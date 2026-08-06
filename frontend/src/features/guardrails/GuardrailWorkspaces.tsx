import { GitCompareArrows, Settings, ShieldCheck } from "lucide-react";

import { UseCaseComposer } from "@/app/workspace/WorkspacePrimitives";
import { deploymentDefaultGuardrail, guardrailPromptExamples } from "@/app/workspace/constants";
import { formatConfiguredGuardrail, formatModelName } from "@/app/workspace/formatters";
import { Button } from "@/components/ui/button";
import { PromptExamples } from "@/components/PromptExamples";
import {
  ComparisonModelResponse,
  groupComparisonTurns,
} from "@/features/textChat/ChatMessages";
import type { ChatMessage } from "@/features/textChat/types";

type GuardrailComparisonWorkspaceProps = {
  model: string;
  policyNames: string[];
  deploymentPolicyName?: string | null;
  messages: ChatMessage[];
  prompt: string;
  isRunning: boolean;
  canSubmit: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onOpenSettings: () => void;
};

export function GuardrailComparisonWorkspace({
  model,
  policyNames,
  deploymentPolicyName,
  messages,
  prompt,
  isRunning,
  canSubmit,
  onPromptChange,
  onSubmit,
  onOpenSettings,
}: GuardrailComparisonWorkspaceProps) {
  const turns = groupComparisonTurns(messages);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <PromptExamples
        title="Guardrail prompt lab"
        description="Select a scenario to load the same test prompt into both panes."
        icon={<ShieldCheck className="h-4 w-4" />}
        examples={guardrailPromptExamples}
        value={prompt}
        onSelect={onPromptChange}
      />
      <div className="flex-1 overflow-x-auto p-4">
        <div className="grid h-full min-w-[44rem] grid-cols-2 gap-4">
          {(["policy_1", "policy_2"] as const).map((variant, index) => (
            <GuardrailComparisonPane
              key={variant}
              model={model}
              title={`Guardrail ${index + 1}`}
              policyName={policyNames[index] ?? deploymentDefaultGuardrail}
              deploymentPolicyName={deploymentPolicyName}
              variant={variant}
              turns={turns}
              prompt={prompt}
              isRunning={isRunning}
              canSubmit={canSubmit}
              onPromptChange={onPromptChange}
              onSubmit={onSubmit}
              onOpenSettings={onOpenSettings}
            />
          ))}
        </div>
      </div>
      <p className="border-t bg-white px-4 py-2 text-center text-xs text-slate-500 dark:border-[#55555a] dark:bg-[#29292c] dark:text-slate-400">
        Both panes use {formatModelName(model)} with the same prompt and model parameters. Only the guardrail policy differs.
      </p>
    </div>
  );
}

function GuardrailComparisonPane({
  model,
  title,
  policyName,
  deploymentPolicyName,
  variant,
  turns,
  prompt,
  isRunning,
  canSubmit,
  onPromptChange,
  onSubmit,
  onOpenSettings,
}: {
  model: string;
  title: string;
  policyName: string;
  deploymentPolicyName?: string | null;
  variant: "policy_1" | "policy_2";
  turns: Array<{ user: ChatMessage; responses: ChatMessage[] }>;
  prompt: string;
  isRunning: boolean;
  canSubmit: boolean;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onOpenSettings: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
    >
      <header className="flex items-center gap-3 border-b px-3 py-3 dark:border-[#55555a]">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
            {formatConfiguredGuardrail(policyName, deploymentPolicyName)} · {formatModelName(model)}
          </div>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={onOpenSettings}>
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-[#303033]">
        {turns.length ? (
          <div className="grid gap-4">
            {turns.map((turn) => {
              const response = turn.responses.find((item) => item.guardrail_variant === variant);
              return (
                <section key={turn.user.id} className="grid gap-2">
                  <div className="chat-user-bubble ml-auto max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm">
                    {turn.user.content}
                  </div>
                  {response ? (
                    <ComparisonModelResponse message={response} />
                  ) : (
                    <div className="rounded-2xl border bg-white px-3 py-2 text-sm text-slate-500 shadow-sm dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-400">
                      {isRunning ? `Running ${title.toLowerCase()}...` : "Waiting for a response..."}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-xs">
              <GitCompareArrows className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-[#77777d]" />
              <h3 className="text-sm font-semibold">Ready for {title}</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {formatConfiguredGuardrail(policyName, deploymentPolicyName)}
              </p>
            </div>
          </div>
        )}
      </div>

      <UseCaseComposer
        ariaLabel={`Prompt for ${title}`}
        placeholder="Ask both guardrails..."
        value={prompt}
        disabled={!canSubmit}
        submitting={isRunning}
        disclaimer="AI-generated content may be incorrect"
        onChange={onPromptChange}
        onSubmit={onSubmit}
        leftControls={
          <span className="text-xs font-medium">{formatConfiguredGuardrail(policyName, deploymentPolicyName)}</span>
        }
      />
    </form>
  );
}
