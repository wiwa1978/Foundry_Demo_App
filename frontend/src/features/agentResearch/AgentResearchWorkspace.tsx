import { Activity, Bot, Square, X } from "lucide-react";
import { useState } from "react";

import { ThinkingIndicator, UseCaseComposer } from "@/app/workspace/WorkspacePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type {
  AgentResearchCitation,
  AgentResearchRunConfig,
  AgentResearchStep,
  AgentResearchTrace,
} from "./types";

type AgentResearchWorkspaceProps = {
  configured: boolean;
  projectEndpoint: string | null;
  question: string;
  answer: string;
  steps: AgentResearchStep[];
  citations: AgentResearchCitation[];
  runConfig: AgentResearchRunConfig | null;
  isRunning: boolean;
  error: string;
  trace: AgentResearchTrace | null;
  traceLoading: boolean;
  traceError: string;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  defaultAgentName?: string;
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  questionPlaceholder?: string;
  questionAriaLabel?: string;
  activityDescription?: string;
};

export function AgentResearchWorkspace({
  configured,
  projectEndpoint,
  question,
  answer,
  steps,
  runConfig,
  isRunning,
  error,
  trace,
  traceLoading,
  traceError,
  onQuestionChange,
  onSubmit,
  onCancel,
  defaultAgentName = "ResearchAgent",
  emptyStateTitle = "Start your research",
  emptyStateDescription = "Ask ResearchAgent to investigate a current topic using its configured web search tools.",
  questionPlaceholder = "Ask the research agent a question...",
  questionAriaLabel = "Research agent question",
  activityDescription = "Connection and invocation details",
}: AgentResearchWorkspaceProps) {
  const [activityOpen, setActivityOpen] = useState(false);
  const effectiveConfig = runConfig ?? {
    agentName: defaultAgentName,
    projectEndpoint,
    tracingEnabled: false,
  };
  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div className="absolute right-5 top-5 z-10 flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={activityOpen}
          onClick={() => setActivityOpen((open) => !open)}
        >
          <Activity className="h-3.5 w-3.5" />
          Activity
        </Button>
        {isRunning ? (
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5 pt-16">
        {answer || isRunning || error ? (
          <div className="mx-auto w-full max-w-5xl">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Latest answer
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {question || "Ask something like 'What changed in Bing grounding this week?'"}
                    </p>
                  </div>
                  {isRunning ? <ThinkingIndicator /> : null}
                </div>
                <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-800 dark:text-slate-100">
                  {answer || (isRunning ? "Streaming answer..." : "Your response will appear here.")}
                </div>
            </div>
            {error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100">
                {error}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
              <div className="palette-icon-surface mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                <Bot className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight">{emptyStateTitle}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {emptyStateDescription}
              </p>
            </div>
          </div>
        )}
      </div>

      <UseCaseComposer
        ariaLabel={questionAriaLabel}
        placeholder={questionPlaceholder}
        value={question}
        disabled={!configured || isRunning}
        submitting={isRunning}
        disclaimer="AI-generated content may be incorrect"
        error={error}
        onChange={onQuestionChange}
        onSubmit={onSubmit}
      />

      <aside
        aria-hidden={!activityOpen}
        className={cn(
          "absolute inset-y-0 right-0 z-20 flex w-full max-w-sm transform flex-col border-l bg-white shadow-2xl transition-transform duration-200 dark:border-[#606066] dark:bg-[#39393d]",
          activityOpen ? "translate-x-0" : "translate-x-full",
        )}
      >
            <header className="flex items-center justify-between border-b px-4 py-4 dark:border-[#55555a]">
              <div>
                <h4 className="text-sm font-semibold">Agent activity</h4>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                   {activityDescription}
                </p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Close agent activity"
                onClick={() => setActivityOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs dark:border-[#606066] dark:bg-[#45454a]">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">Foundry configuration</span>
                  <Badge variant={configured ? "default" : "secondary"}>
                    {configured ? "Ready" : "Missing"}
                  </Badge>
                </div>
                <dl className="mt-3 grid gap-2">
                  <ConfigRow label="Agent" value={effectiveConfig.agentName} />
                  <ConfigRow
                    label="Project endpoint"
                    value={effectiveConfig.projectEndpoint || "Not set"}
                  />
                  <ConfigRow
                    label="Foundry tracing"
                    value={effectiveConfig.tracingEnabled ? "Enabled" : "Not configured"}
                  />
                </dl>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Foundry spans
                  </h5>
                  {traceLoading ? <Badge variant="secondary">Loading</Badge> : null}
                </div>
                {trace?.spans.length ? (
                  <ol className="mt-2 grid gap-2">
                    {trace.spans.map((span) => (
                      <li
                        key={`${span.trace_id}-${span.span_id}`}
                        className="rounded-xl border border-slate-200 p-3 text-xs dark:border-[#606066]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-medium">
                            {span.tool_name || span.operation || span.name}
                          </span>
                          <Badge variant="secondary">
                            {Math.round(span.duration_ms)} ms
                          </Badge>
                        </div>
                        <div className="mt-2 grid gap-1 text-slate-500 dark:text-slate-400">
                          {span.model ? <span>Model: {span.model}</span> : null}
                          {span.input_tokens !== null || span.output_tokens !== null ? (
                            <span>
                              Tokens: {span.input_tokens ?? 0} in / {span.output_tokens ?? 0} out
                            </span>
                          ) : null}
                          {span.error_type ? (
                            <span className="text-rose-600 dark:text-rose-300">
                              Error: {span.error_type}
                            </span>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 rounded-xl border border-dashed p-3 text-xs text-slate-500 dark:border-[#606066] dark:text-slate-400">
                    {traceError ||
                      (effectiveConfig.tracingEnabled
                        ? "Run the agent to retrieve Foundry spans."
                        : "Set the Application Insights resource ID to enable trace retrieval.")}
                  </p>
                )}
              </div>
              <ol className="mt-4 grid gap-2">
                {steps.length ? (
                  steps.map((step) => (
                    <li
                      key={step.id}
                      className={cn(
                        "rounded-xl border p-3 text-sm",
                        step.status === "done"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                          : step.status === "error"
                            ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100"
                            : "border-blue-200 bg-blue-50 text-blue-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{step.label}</span>
                        <Badge variant="secondary">{step.status}</Badge>
                      </div>
                      {step.detail ? <p className="mt-1 text-xs opacity-80">{step.detail}</p> : null}
                    </li>
                  ))
                ) : (
                  <li className="rounded-xl border border-dashed p-4 text-sm text-slate-500 dark:border-[#606066] dark:text-slate-400">
                    No activity yet.
                  </li>
                )}
              </ol>
            </div>
      </aside>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-slate-900 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}
