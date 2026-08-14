import {
  Bot,
  CheckCircle2,
  Clock,
  Copy,
  LoaderCircle,
  User,
} from "lucide-react";
import { useState } from "react";

import {
  formatGuardrailLabel,
  formatMessageDateTime,
  formatModelName,
  formatUsage,
} from "@/app/workspace/formatters";
import { formatApiSurface } from "@/app/workspace/traceUtils";
import { ThinkingIndicator } from "@/app/workspace/WorkspacePrimitives";
import { Badge } from "@/components/ui/badge";
import type { ChatMessage } from "@/features/textChat/types";
import { cn } from "@/lib/utils";


function routedModelLabel(message: ChatMessage) {
  if (!message.routed_model || message.routed_model === message.model) {
    return null;
  }
  return `Answered by ${formatModelName(message.routed_model)}`;
}
export function ChatMessageHistory({ messages }: { messages: ChatMessage[] }) {
  const turns = groupComparisonTurns(messages);
  return (
    <>
      {turns.map((turn) => {
        const isGuardrailComparison = turn.responses.some(
          (response) => response.guardrail_variant,
        );
        return (
          <div key={turn.user.id} className="grid gap-4">
            <ChatBubble message={turn.user} />
            {isGuardrailComparison ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {(["policy_1", "policy_2", "baseline", "guarded"] as const).map(
                  (variant) => {
                    const response = turn.responses.find(
                      (item) => item.guardrail_variant === variant,
                    );
                    return response ? (
                      <ChatBubble key={response.id} message={response} />
                    ) : null;
                  },
                )}
              </div>
            ) : (
              turn.responses.map((response) => (
                <ChatBubble key={response.id} message={response} />
              ))
            )}
          </div>
        );
      })}
    </>
  );
}

export function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const copyText = message.error ?? message.content;
  const timestamp = formatMessageDateTime(message.created_at);

  async function copyMessage() {
    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div
      className={cn(
        "group flex items-end gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser ? (
        <div className="chat-assistant-avatar mb-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow-sm">
          <Bot className="h-4 w-4" />
        </div>
      ) : null}

      <div
        className={cn(
          "flex max-w-[min(44rem,82%)] flex-col",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "mb-1 flex flex-wrap items-center gap-2 px-2 text-[11px]",
            isUser
              ? "justify-end text-slate-500 dark:text-slate-400"
              : "text-slate-500 dark:text-slate-400",
          )}
        >
          <span
            className={cn(
              "font-semibold",
              isUser
                ? "text-slate-600 dark:text-slate-200"
                : "text-slate-700 palette-accent-text",
            )}
          >
            {isUser ? "You" : (message.model ?? "Assistant")}
          </span>
          {timestamp ? <span>{timestamp}</span> : null}
          {!isUser && message.api_surface ? (
            <Badge variant="secondary">
              {formatApiSurface(message.api_surface)}
            </Badge>
          ) : null}
          {!isUser && routedModelLabel(message) ? (
            <Badge variant="outline">{routedModelLabel(message)}</Badge>
          ) : null}
          {!isUser && message.guardrail_variant ? (
            <Badge variant="outline">{formatGuardrailLabel(message)}</Badge>
          ) : null}
          {!isUser && message.duration_ms ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {message.duration_ms} ms
            </span>
          ) : null}
          {!isUser && formatUsage(message.usage) ? (
            <span>{formatUsage(message.usage)}</span>
          ) : null}
        </div>

        {!isUser && message.guardrail_results ? (
          <details className="mt-1 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-300">
            <summary className="cursor-pointer font-medium">
              Guardrail annotations
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(message.guardrail_results, null, 2)}
            </pre>
          </details>
        ) : null}

        <div
          className={cn(
            !message.pending &&
              "relative rounded-[1.35rem] px-4 py-3 text-sm shadow-sm transition duration-200 after:absolute after:bottom-3 after:h-3 after:w-3 after:rotate-45 group-hover:-translate-y-0.5 group-hover:shadow-md",
            !message.pending &&
              (isUser
                ? "chat-user-bubble rounded-br-md after:-right-1 dark:shadow-black/20"
                : "chat-assistant-bubble rounded-bl-md border after:-left-1 after:border-b after:border-l dark:shadow-black/20"),
            !message.pending &&
              message.error &&
              "border-red-200 bg-red-50 text-red-900 after:bg-red-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100 dark:after:bg-red-950",
          )}
        >
          {message.pending ? (
            <ThinkingIndicator />
          ) : (
            <div className="whitespace-pre-wrap leading-6">{copyText}</div>
          )}
        </div>

        {!message.pending ? (
          <button
            type="button"
            onClick={() => void copyMessage()}
            className={cn(
              "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] opacity-0 transition hover:bg-slate-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:hover:bg-[#45454a] dark:focus-visible:ring-violet-500",
              isUser
                ? "text-slate-500 dark:text-slate-300"
                : "text-slate-500 dark:text-slate-400",
            )}
            aria-label={`Copy ${isUser ? "request" : "response"}`}
            title={`Copy ${isUser ? "request" : "response"}`}
          >
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        ) : null}
      </div>

      {isUser ? (
        <div className="mb-6 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-700 shadow-sm dark:border dark:border-white/10 dark:bg-[#424248] dark:text-slate-300 dark:shadow-black/20">
          <User className="h-4 w-4" />
        </div>
      ) : null}
    </div>
  );
}

export function ComparisonModelResponse({ message }: { message: ChatMessage }) {
  if (message.pending && !message.guardrail_variant) {
    return <ThinkingIndicator />;
  }

  return (
    <div
      className={cn(
        "chat-assistant-bubble rounded-2xl border px-3 py-3 text-sm leading-6 shadow-sm",
        message.error &&
          "border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-white/75">
        {message.api_surface ? (
          <Badge variant="secondary">
            {formatApiSurface(message.api_surface)}
          </Badge>
        ) : null}
        {routedModelLabel(message) ? (
          <Badge variant="outline">{routedModelLabel(message)}</Badge>
        ) : null}
        {message.guardrail_variant ? (
          <Badge variant="outline">{formatGuardrailLabel(message)}</Badge>
        ) : null}
        {message.duration_ms ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {message.duration_ms} ms
          </span>
        ) : null}
        {formatUsage(message.usage) ? (
          <span>{formatUsage(message.usage)}</span>
        ) : null}
      </div>
      <div className="whitespace-pre-wrap">
        {message.pending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            {message.content}
          </span>
        ) : (
          (message.error ?? message.content)
        )}
      </div>
      {message.guardrail_results ? (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer font-medium">
            Guardrail annotations
          </summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(message.guardrail_results, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

export function groupComparisonTurns(messages: ChatMessage[]) {
  const turns: Array<{ user: ChatMessage; responses: ChatMessage[] }> = [];

  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ user: message, responses: [] });
    } else if (turns.length) {
      turns[turns.length - 1].responses.push(message);
    }
  }

  return turns;
}
