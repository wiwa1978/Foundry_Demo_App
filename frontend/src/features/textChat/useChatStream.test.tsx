import { act, renderHook, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { FetchClient } from "@/api/types";

import type {
  ChatMessage,
  Conversation,
  FoundryRequestTrace,
  FoundryResponseTrace,
  StoredMessage,
  TextChatRequest,
} from "./types";
import { useChatStream } from "./useChatStream";

const conversation: Conversation = {
  id: "conversation-1",
  title: "Question",
  use_case: "text_chat",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:01.000Z",
};

const request: TextChatRequest = {
  model: "gpt-test",
  prompt: "Question",
  conversation_id: null,
  reasoning_effort: null,
  guardrail_comparison: false,
  use_case: "text_chat",
};

const foundryRequest: FoundryRequestTrace = {
  api_surface: "responses",
  method: "POST",
  path: "/responses",
  payload: { input: "Question" },
};

const foundryResponse: FoundryResponseTrace = {
  api_surface: "responses",
  payload: { id: "response-1" },
};

function storedMessage(
  id: string,
  role: StoredMessage["role"],
  content: string,
  guardrailVariant: StoredMessage["guardrail_variant"] = null,
): StoredMessage {
  return {
    id,
    conversation_id: conversation.id,
    role,
    content,
    model: role === "assistant" ? request.model : null,
    api_surface: role === "assistant" ? "responses" : null,
    duration_ms: role === "assistant" ? 25 : null,
    usage: null,
    error: null,
    guardrail_variant: guardrailVariant,
    guardrail_policy_name: null,
    guardrail_results: null,
    created_at: "2026-01-01T00:00:01.000Z",
  };
}

function sseResponse(events: unknown[]) {
  return new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

function createHarness(
  fetchClient: FetchClient,
  initialMessages: ChatMessage[] = [],
) {
  const upsertConversation = vi.fn();
  const appendFoundryTrace = vi.fn();
  const appendFoundryResponseTrace = vi.fn();
  const appendApiResponseTrace = vi.fn();
  const onDocumentRetrieval = vi.fn();
  const speakResponses = vi.fn();
  let currentSpeakResponses: (responses: StoredMessage[]) => void =
    speakResponses;

  function useHarness() {
    const [prompt, setPrompt] = useState(request.prompt);
    const [isRunning, setIsRunning] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [currentConversationId, setCurrentConversationId] = useState<
      string | null
    >(null);
    const sessionRef = useRef(0);
    const stream = useChatStream({
      fetchClient,
      sessionRef,
      deploymentDefaultGuardrail: "deployment_default",
      setPrompt,
      setIsRunning,
      setMessages,
      setCurrentConversationId,
      upsertConversation,
      appendFoundryTrace,
      appendFoundryResponseTrace,
      appendApiResponseTrace,
      onDocumentRetrieval,
      speakResponses: currentSpeakResponses,
    });

    return { ...stream, prompt, isRunning, messages, currentConversationId };
  }

  return {
    useHarness,
    upsertConversation,
    appendFoundryTrace,
    appendFoundryResponseTrace,
    appendApiResponseTrace,
    onDocumentRetrieval,
    speakResponses,
    setSpeakResponses: (callback: (responses: StoredMessage[]) => void) => {
      currentSpeakResponses = callback;
    },
  };
}

describe("useChatStream", () => {
  it("applies a normal stream and records the common trace events", async () => {
    const userMessage = storedMessage("user-1", "user", "Question");
    const assistantMessage = storedMessage(
      "assistant-1",
      "assistant",
      "Hello world",
    );
    const events = [
      {
        type: "start",
        model: request.model,
        api_surface: "responses",
        conversation,
        user_message: userMessage,
      },
      { type: "foundry_request", request: foundryRequest },
      { type: "foundry_response", response: foundryResponse },
      { type: "delta", delta: "Hello " },
      { type: "delta", delta: "world" },
      { type: "completed", conversation, assistant_message: assistantMessage },
    ];
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(sseResponse(events));
    const harness = createHarness(fetchClient);
    const { result } = renderHook(harness.useHarness);

    await act(async () => {
      await result.current.runTextChat(request);
    });

    expect(fetchClient).toHaveBeenCalledWith(
      "/api/chat/stream",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      expect.objectContaining({ responseKind: "stream" }),
    );
    expect(result.current.prompt).toBe("");
    expect(result.current.isRunning).toBe(false);
    expect(result.current.currentConversationId).toBe(conversation.id);
    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: userMessage.id, content: "Question" }),
      expect.objectContaining({
        id: assistantMessage.id,
        content: "Hello world",
      }),
    ]);
    expect(harness.appendFoundryTrace).toHaveBeenCalledWith(
      foundryRequest,
      "Foundry request for gpt-test",
    );
    expect(harness.appendFoundryResponseTrace).toHaveBeenCalledWith(
      foundryResponse,
      "Foundry response for gpt-test",
    );
    expect(harness.speakResponses).toHaveBeenCalledWith([assistantMessage]);
    expect(harness.appendApiResponseTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Stream chat response",
        url: "/api/chat/stream",
        response: { events },
      }),
    );
  });

  it("uses the document starter and delegates retrieval handling", async () => {
    const retrieval = {
      type: "retrieval",
      sources: [
        {
          document_id: "document-1",
          filename: "guide.pdf",
          chunk_index: 2,
          content: "Retrieved text",
          score: 0.91,
        },
      ],
      embedding: {
        model: "embedding-test",
        duration_ms: 12,
        dimensions: 3,
        foundry_request: foundryRequest,
        foundry_response: foundryResponse,
      },
    } as const;
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(sseResponse([retrieval]));
    const harness = createHarness(fetchClient);
    const { result } = renderHook(harness.useHarness);

    await act(async () => {
      await result.current.runDocumentChat({
        ...request,
        use_case: "document_qa",
      });
    });

    expect(fetchClient).toHaveBeenCalledWith(
      "/api/documents/ask/stream",
      expect.objectContaining({ method: "POST" }),
      expect.objectContaining({ label: "Stream document RAG answer" }),
    );
    expect(harness.onDocumentRetrieval).toHaveBeenCalledWith(retrieval);
    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({ content: "Retrieving documents..." }),
    );
  });

  it("maps guardrail variants and comparison completion to their conversations", async () => {
    const policy1 = storedMessage(
      "policy-1",
      "assistant",
      "Baseline",
      "policy_1",
    );
    const policy2 = storedMessage(
      "policy-2",
      "assistant",
      "Guarded",
      "policy_2",
    );
    const variantResult = (assistantMessage: StoredMessage) => ({
      model: request.model,
      guardrail_variant: assistantMessage.guardrail_variant,
      assistant_message: assistantMessage,
      foundry_request: foundryRequest,
      foundry_response: foundryResponse,
    });
    const events = [
      {
        type: "start",
        model: request.model,
        api_surface: "responses",
        conversation,
        user_message: storedMessage("user-1", "user", "Question"),
        guardrail_comparison: true,
        guardrail_policy_names: ["deployment_default", "Strict"],
      },
      {
        type: "variant_completed",
        conversation,
        result: variantResult(policy1),
      },
      {
        type: "variant_completed",
        conversation,
        result: variantResult(policy2),
      },
      { type: "comparison_completed", conversation },
    ];
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(sseResponse(events));
    const harness = createHarness(fetchClient);
    const { result } = renderHook(harness.useHarness);

    await act(async () => {
      await result.current.runTextChat({
        ...request,
        guardrail_comparison: true,
      });
    });

    expect(result.current.messages).toEqual([
      expect.objectContaining({ id: "user-1" }),
      expect.objectContaining({ id: policy1.id, content: "Baseline" }),
      expect.objectContaining({ id: policy2.id, content: "Guarded" }),
    ]);
    expect(harness.upsertConversation).toHaveBeenCalledTimes(4);
    expect(harness.appendFoundryTrace).toHaveBeenCalledWith(
      foundryRequest,
      "Foundry policy_2 request for gpt-test",
    );
  });

  it("applies streamed errors to the pending assistant", async () => {
    const events = [{ type: "error", error: "Guardrail rejected the prompt." }];
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(sseResponse(events));
    const harness = createHarness(fetchClient);
    const { result } = renderHook(harness.useHarness);

    await act(async () => {
      await result.current.runTextChat(request);
    });

    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({ error: "Guardrail rejected the prompt." }),
    );
    expect(result.current.isRunning).toBe(false);
  });

  it("aborts an active request without replacing pending messages with an error", async () => {
    let requestAborted = false;
    const fetchClient = vi.fn<FetchClient>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("Expected an abort signal."));
            return;
          }
          signal.addEventListener("abort", () => {
            requestAborted = true;
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          });
        }),
    );
    const harness = createHarness(fetchClient);
    const { result } = renderHook(harness.useHarness);
    let runPromise: Promise<void> | undefined;

    act(() => {
      runPromise = result.current.runTextChat(request);
    });
    expect(result.current.isRunning).toBe(true);

    act(() => result.current.cancel());
    await act(async () => {
      await runPromise;
    });

    expect(requestAborted).toBe(true);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].error).toBeUndefined();
  });

  it("ignores unknown events and still completes the stream", async () => {
    const assistantMessage = storedMessage(
      "assistant-1",
      "assistant",
      "Known result",
    );
    const events = [
      { type: "future_event", value: "ignored" },
      { type: "completed", conversation, assistant_message: assistantMessage },
    ];
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(sseResponse(events));
    const harness = createHarness(fetchClient);
    const { result } = renderHook(harness.useHarness);

    await act(async () => {
      await result.current.runTextChat(request);
    });

    expect(result.current.messages[1]).toEqual(
      expect.objectContaining({
        id: assistantMessage.id,
        content: "Known result",
      }),
    );
  });

  it("turns malformed SSE data into a request error", async () => {
    const fetchClient = vi.fn<FetchClient>().mockResolvedValue(
      new Response('data: {"type":"delta"\n\n', {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const harness = createHarness(fetchClient);
    const { result } = renderHook(harness.useHarness);

    await act(async () => {
      await result.current.runTextChat(request);
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].error).toBeTruthy();
    expect(result.current.isRunning).toBe(false);
    expect(harness.appendApiResponseTrace).not.toHaveBeenCalled();
  });

  it("preserves existing messages when guardrail comparison fails before start", async () => {
    const existing = {
      id: "existing-message",
      role: "assistant" as const,
      content: "Existing answer",
    };
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(
        Response.json(
          { detail: "Guardrail service unavailable." },
          { status: 503 },
        ),
      );
    const harness = createHarness(fetchClient, [existing]);
    const { result } = renderHook(harness.useHarness);

    await act(async () => {
      await result.current.runTextChat({
        ...request,
        guardrail_comparison: true,
      });
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[0]).toBe(existing);
    expect(result.current.messages[2].error).toBe(
      "Guardrail service unavailable.",
    );
  });

  it("removes only this run's messages when comparison fails after start", async () => {
    const existing = {
      id: "existing-message",
      role: "assistant" as const,
      content: "Existing answer",
    };
    const startEvent = {
      type: "start",
      model: request.model,
      api_surface: "responses",
      conversation,
      user_message: storedMessage("server-user", "user", "Question"),
      guardrail_comparison: true,
      guardrail_policy_names: ["deployment_default", "Strict"],
    };
    const fetchClient = vi
      .fn<FetchClient>()
      .mockResolvedValue(
        new Response(
          `data: ${JSON.stringify(startEvent)}\n\ndata: {"type":"broken"\n\n`,
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
      );
    const harness = createHarness(fetchClient, [existing]);
    const { result } = renderHook(harness.useHarness);

    await act(async () => {
      await result.current.runTextChat({
        ...request,
        guardrail_comparison: true,
      });
    });

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[0]).toBe(existing);
    expect(result.current.messages[1]).not.toEqual(
      expect.objectContaining({ id: "server-user" }),
    );
    expect(result.current.messages[2].error).toBeTruthy();
  });

  it("uses the latest response speaker when a stream completes", async () => {
    const assistantMessage = storedMessage(
      "assistant-1",
      "assistant",
      "Read this response",
    );
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
      }),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    );
    const fetchClient = vi.fn<FetchClient>().mockResolvedValue(response);
    const harness = createHarness(fetchClient);
    const latestSpeaker = vi.fn();
    const { result, rerender } = renderHook(harness.useHarness);
    let runPromise: Promise<void> | undefined;

    act(() => {
      runPromise = result.current.runTextChat(request);
    });
    await waitFor(() => expect(fetchClient).toHaveBeenCalledOnce());
    harness.setSpeakResponses(latestSpeaker);
    rerender();
    await act(async () => {
      streamController.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "completed",
            conversation,
            assistant_message: assistantMessage,
          })}\n\n`,
        ),
      );
      streamController.close();
      await runPromise;
    });

    expect(harness.speakResponses).not.toHaveBeenCalled();
    expect(latestSpeaker).toHaveBeenCalledWith([assistantMessage]);
  });
});
