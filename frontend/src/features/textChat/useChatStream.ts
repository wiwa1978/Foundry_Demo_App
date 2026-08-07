import {
  useEffect,
  useRef,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import type { FetchClient } from "@/api/types";
import {
  createAssistantMessage,
  createUserMessage,
  mapStoredMessage,
} from "@/app/workspace/messageUtils";
import {
  documentAnswerStreamEndpoint,
  streamDocumentAnswer,
} from "@/features/documentQa/api";

import { streamTextChat, textChatStreamEndpoint } from "./api";
import type {
  ChatMessage,
  ChatStreamEvent,
  Conversation,
  FoundryRequestTrace,
  FoundryResponseTrace,
  StoredMessage,
  TextChatRequest,
} from "./types";

type RetrievalEvent = Extract<ChatStreamEvent, { type: "retrieval" }>;
type StreamKind = "text" | "document";

type StreamProfile = {
  endpoint: string;
  responseLabel: string;
  failureMessage: string;
  foundryQualifier: string;
  initialAssistantContent: string;
  startedAssistantContent?: string;
  policy2Content: string;
  pending: boolean;
};

type ApiResponseTrace = {
  label: string;
  method: "SSE";
  url: string;
  status: number;
  response: { events: ChatStreamEvent[] };
};

export type ChatStreamOptions = {
  fetchClient: FetchClient;
  sessionRef: RefObject<number>;
  deploymentDefaultGuardrail: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  setIsRunning: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setCurrentConversationId: Dispatch<SetStateAction<string | null>>;
  upsertConversation: (conversation: Conversation) => void;
  appendFoundryTrace: (request: FoundryRequestTrace, label?: string) => void;
  appendFoundryResponseTrace: (
    response: FoundryResponseTrace,
    label?: string,
  ) => void;
  appendApiResponseTrace: (trace: ApiResponseTrace) => void;
  onDocumentRetrieval: (event: RetrievalEvent) => void;
  speakResponses: (responses: StoredMessage[]) => void;
};

const streamProfiles: Record<StreamKind, StreamProfile> = {
  text: {
    endpoint: textChatStreamEndpoint,
    responseLabel: "Stream chat response",
    failureMessage: "Chat request failed.",
    foundryQualifier: "",
    initialAssistantContent: "",
    policy2Content: "Running guardrail 2...",
    pending: true,
  },
  document: {
    endpoint: documentAnswerStreamEndpoint,
    responseLabel: "Document RAG stream response",
    failureMessage: "Document question failed.",
    foundryQualifier: "grounded ",
    initialAssistantContent: "Retrieving documents...",
    startedAssistantContent: "Reading retrieved document excerpts...",
    policy2Content: "Running guardrail 2 against retrieved context...",
    pending: false,
  },
};

export function useChatStream({
  fetchClient,
  sessionRef,
  deploymentDefaultGuardrail,
  setPrompt,
  setIsRunning,
  setMessages,
  setCurrentConversationId,
  upsertConversation,
  appendFoundryTrace,
  appendFoundryResponseTrace,
  appendApiResponseTrace,
  onDocumentRetrieval,
  speakResponses,
}: ChatStreamOptions) {
  const controllerRef = useRef<AbortController | null>(null);
  const runSequenceRef = useRef(0);
  const speakResponsesRef = useRef(speakResponses);
  speakResponsesRef.current = speakResponses;

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function run(kind: StreamKind, request: TextChatRequest) {
    const profile = streamProfiles[kind];
    const useCaseSession = sessionRef.current;
    const pendingUser = createUserMessage(request.prompt);
    const pendingAssistant = createAssistantMessage({
      model: request.model,
      content: request.guardrail_comparison
        ? kind === "text"
          ? "Running guardrail 1..."
          : profile.initialAssistantContent
        : profile.initialAssistantContent,
      pending: profile.pending || undefined,
      guardrail_variant:
        kind === "text"
          ? request.guardrail_comparison
            ? "policy_1"
            : null
          : undefined,
    });
    const pendingPolicy2 = createAssistantMessage({
      model: request.model,
      content: profile.policy2Content,
      guardrail_variant: "policy_2",
      pending: profile.pending || undefined,
    });
    const runMessageIds = new Set([pendingUser.id, pendingAssistant.id]);
    let receivedDelta = false;

    setPrompt("");
    setIsRunning(true);
    setMessages((current) => [...current, pendingUser, pendingAssistant]);

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    runSequenceRef.current += 1;
    const runSequence = runSequenceRef.current;

    try {
      const startStream =
        kind === "document" ? streamDocumentAnswer : streamTextChat;
      const { response, events } = await startStream({
        request,
        fetchClient,
        signal: controller.signal,
        onEvent: (event) => {
          if (useCaseSession !== sessionRef.current) {
            return;
          }

          switch (event.type) {
            case "start":
              runMessageIds.add(event.user_message.id);
              if (event.guardrail_comparison) {
                runMessageIds.add(pendingPolicy2.id);
              }
              setCurrentConversationId(event.conversation.id);
              upsertConversation(event.conversation);
              setMessages((current) => {
                const updated = current.map((message) => {
                  if (message.id === pendingUser.id) {
                    return mapStoredMessage(event.user_message);
                  }
                  if (message.id === pendingAssistant.id) {
                    return {
                      ...message,
                      api_surface: event.api_surface,
                      ...(profile.startedAssistantContent
                        ? { content: profile.startedAssistantContent }
                        : {}),
                      guardrail_variant: event.guardrail_comparison
                        ? ("policy_1" as const)
                        : null,
                      guardrail_policy_name:
                        event.guardrail_policy_names?.[0] ===
                        deploymentDefaultGuardrail
                          ? null
                          : event.guardrail_policy_names?.[0],
                    };
                  }
                  return message;
                });
                return event.guardrail_comparison
                  ? [
                      ...updated,
                      {
                        ...pendingPolicy2,
                        api_surface: event.api_surface,
                        guardrail_policy_name:
                          event.guardrail_policy_names?.[1] ===
                          deploymentDefaultGuardrail
                            ? null
                            : event.guardrail_policy_names?.[1],
                      },
                    ]
                  : updated;
              });
              return;

            case "variant_completed": {
              runMessageIds.add(event.result.assistant_message.id);
              setCurrentConversationId(event.conversation.id);
              upsertConversation(event.conversation);
              const targetId =
                event.result.guardrail_variant === "policy_2" ||
                event.result.guardrail_variant === "guarded"
                  ? pendingPolicy2.id
                  : pendingAssistant.id;
              setMessages((current) =>
                current.map((message) =>
                  message.id === targetId
                    ? mapStoredMessage(event.result.assistant_message)
                    : message,
                ),
              );
              if (event.result.foundry_request) {
                appendFoundryTrace(
                  event.result.foundry_request,
                  `Foundry ${profile.foundryQualifier}${event.result.guardrail_variant} request for ${request.model}`,
                );
              }
              if (event.result.foundry_response) {
                appendFoundryResponseTrace(
                  event.result.foundry_response,
                  `Foundry ${profile.foundryQualifier}${event.result.guardrail_variant} response for ${request.model}`,
                );
              }
              return;
            }

            case "comparison_completed":
              setCurrentConversationId(event.conversation.id);
              upsertConversation(event.conversation);
              return;

            case "retrieval":
              if (kind === "document") {
                onDocumentRetrieval(event);
              }
              return;

            case "foundry_request":
              appendFoundryTrace(
                event.request,
                `Foundry ${profile.foundryQualifier}request for ${request.model}`,
              );
              return;

            case "foundry_response":
              appendFoundryResponseTrace(
                event.response,
                `Foundry ${profile.foundryQualifier}response for ${request.model}`,
              );
              return;

            case "delta":
              setMessages((current) =>
                current.map((message) =>
                  message.id === pendingAssistant.id
                    ? {
                        ...message,
                        content: receivedDelta
                          ? `${message.content}${event.delta}`
                          : event.delta,
                        ...(profile.pending ? { pending: false } : {}),
                      }
                    : message,
                ),
              );
              receivedDelta = true;
              return;

            case "completed":
              runMessageIds.add(event.assistant_message.id);
              setCurrentConversationId(event.conversation.id);
              upsertConversation(event.conversation);
              setMessages((current) =>
                current.map((message) =>
                  message.id === pendingAssistant.id
                    ? mapStoredMessage(event.assistant_message)
                    : message,
                ),
              );
              speakResponsesRef.current([event.assistant_message]);
              return;

            case "error":
              if (event.assistant_message) {
                runMessageIds.add(event.assistant_message.id);
              }
              setMessages((current) =>
                current.map((message) =>
                  message.id === pendingAssistant.id
                    ? event.assistant_message
                      ? mapStoredMessage(event.assistant_message)
                      : { ...message, error: event.error }
                    : message,
                ),
              );
              return;

            default:
              return;
          }
        },
      });
      appendApiResponseTrace({
        label: profile.responseLabel,
        method: "SSE",
        url: profile.endpoint,
        status: response.status,
        response: { events },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setMessages((current) => [
        ...current.filter((message) => !runMessageIds.has(message.id)),
        createUserMessage(request.prompt),
        createAssistantMessage({
          model: request.model,
          error:
            error instanceof Error ? error.message : profile.failureMessage,
        }),
      ]);
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      if (
        runSequence === runSequenceRef.current &&
        useCaseSession === sessionRef.current
      ) {
        setIsRunning(false);
      }
    }
  }

  function cancel() {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }

  return {
    runTextChat: (request: TextChatRequest) => run("text", request),
    runDocumentChat: (request: TextChatRequest) => run("document", request),
    cancel,
  };
}
