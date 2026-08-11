import { CopyPlus, GitCompareArrows, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { deploymentDefaultGuardrail } from "@/app/workspace/constants";
import type {
  DeploymentGuardrailPolicy,
  GuardrailPolicy,
  ModelSettings,
} from "@/app/workspace/contracts";
import {
  formatConfiguredGuardrail,
  formatModelName,
} from "@/app/workspace/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GuardrailPolicyComparisonModal } from "@/features/guardrails/GuardrailPolicyComparisonModal";
import { cn } from "@/lib/utils";

type ModelSettingsPageProps = {
  model: string;
  draft: ModelSettings | null;
  saving: boolean;
  policies: GuardrailPolicy[];
  deploymentPolicy: DeploymentGuardrailPolicy | null;
  policiesLoading: boolean;
  creatingPolicyCopies: boolean;
  error: string;
  onClose: () => void;
  onSave: () => void;
  onCreatePolicyCopies: () => void;
  onReset: () => void;
  onChange: (patch: Partial<ModelSettings>) => void;
};

function guardrailPolicyOptionLabel(policy: GuardrailPolicy) {
  if (
    policy.name.startsWith("FoundryChat-") &&
    policy.base_policy_name?.startsWith("Microsoft.")
  ) {
    return `${policy.base_policy_name} (selectable copy)`;
  }
  return policy.is_selectable
    ? policy.name
    : `${policy.name} (system-managed; deployment only)`;
}

export function ModelSettingsPage({
  model,
  draft,
  saving,
  policies,
  deploymentPolicy,
  policiesLoading,
  creatingPolicyCopies,
  error,
  onClose,
  onSave,
  onCreatePolicyCopies,
  onReset,
  onChange,
}: ModelSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<"general" | "api" | "guardrails">(
    "general",
  );
  const selectablePolicies = policies.filter((policy) => policy.is_selectable);
  const [guardrailComparisonOpen, setGuardrailComparisonOpen] = useState(false);

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-5 dark:bg-[#303033]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="palette-heading text-xl font-semibold">
              Configure {formatModelName(model)}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Settings are stored for this deployment endpoint.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
            Back to chat
          </Button>
        </div>

        <div
          className="mb-4 flex gap-1 overflow-x-auto rounded-xl border bg-white p-1.5 shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
          role="tablist"
          aria-label="Model settings sections"
        >
          {[
            { value: "general" as const, label: "General" },
            { value: "api" as const, label: "API surface" },
            { value: "guardrails" as const, label: "Guardrails" },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition",
                activeTab === tab.value
                  ? "palette-tab-active shadow-sm"
                  : "palette-tab",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
          {draft ? (
            <>
              <CardContent className="grid gap-6 pt-6">
                {activeTab === "api" ? (
                  <section className="grid gap-2">
                    <div>
                      <h3 className="font-semibold">API surface</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Responses is the default for OpenAI/GPT deployments. Use
                        Chat Completions for deployments such as Kimi that
                        document that API.
                      </p>
                    </div>
                    <select
                      value={draft.api_surface}
                      onChange={(event) =>
                        onChange({
                          api_surface: event.target
                            .value as ModelSettings["api_surface"],
                        })
                      }
                      className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                    >
                      <option value="responses">Responses API</option>
                      <option value="chat_completions">
                        Chat Completions API
                      </option>
                    </select>
                  </section>
                ) : null}

                {activeTab === "guardrails" ? (
                  <section className="grid gap-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-[#606066] dark:bg-[#45454a]">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          Guardrail comparison policies
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Select the two policies available to the guardrail
                          test on the chat page.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={policiesLoading || creatingPolicyCopies}
                          onClick={onCreatePolicyCopies}
                        >
                          <CopyPlus className="h-4 w-4" />
                          {creatingPolicyCopies
                            ? "Creating copies..."
                            : "Create selectable copies"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            draft.guardrail_policy_names.length !== 2 ||
                            policiesLoading
                          }
                          onClick={() => setGuardrailComparisonOpen(true)}
                        >
                          <GitCompareArrows className="h-4 w-4" />
                          Visualize differences
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-white/80 px-3 py-2 dark:border-[#606066] dark:bg-[#29292c]">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Deployment guardrail
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">
                          {deploymentPolicy?.policy_name ??
                            "Microsoft.DefaultV2"}
                        </Badge>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Currently assigned to {formatModelName(model)}
                        </span>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      {[0, 1].map((index) => (
                        <div key={index} className="grid gap-2">
                          <Label htmlFor={`guardrail-policy-${index}`}>
                            Guardrail {index + 1}
                          </Label>
                          <select
                            id={`guardrail-policy-${index}`}
                            value={draft.guardrail_policy_names[index] ?? ""}
                            disabled={policiesLoading}
                            onChange={(event) => {
                              const guardrail_policy_names = [
                                ...draft.guardrail_policy_names,
                              ];
                              guardrail_policy_names[index] =
                                event.target.value;
                              onChange({ guardrail_policy_names });
                            }}
                            className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
                          >
                            <option value="">
                              {policiesLoading
                                ? "Loading Foundry guardrails..."
                                : "Select a guardrail"}
                            </option>
                            <option value={deploymentDefaultGuardrail}>
                              {formatConfiguredGuardrail(
                                deploymentDefaultGuardrail,
                                deploymentPolicy?.policy_name,
                              )}
                            </option>
                            {policies.map((policy) => (
                              <option
                                key={policy.name}
                                value={policy.name}
                                disabled={!policy.is_selectable}
                              >
                                {guardrailPolicyOptionLabel(policy)}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      <p className="text-xs text-slate-500 md:col-span-2 dark:text-slate-400">
                        Custom policies are retrieved live from Foundry and sent
                        as request-level overrides. They do not need to be
                        assigned to this deployment. The same model settings and
                        prompt are used for both requests. System-managed
                        Microsoft policies cannot be sent as request-level
                        overrides. Use Create selectable copies to provision
                        equivalent user-managed policies for side-by-side
                        comparison.
                      </p>
                      {!policiesLoading && !selectablePolicies.length ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                          No custom guardrails are available. This deployment
                          continues to use{" "}
                          {deploymentPolicy?.policy_name ??
                            "Microsoft.DefaultV2"}
                          .
                        </p>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                {guardrailComparisonOpen ? (
                  <GuardrailPolicyComparisonModal
                    policyNames={draft.guardrail_policy_names}
                    deploymentPolicyName={deploymentPolicy?.policy_name}
                    policies={policies}
                    onClose={() => setGuardrailComparisonOpen(false)}
                  />
                ) : null}

                {activeTab === "general" ? (
                  <>
                    <section className="grid gap-2">
                      <div>
                        <h3 className="font-semibold">Instructions</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Stored separately for this model endpoint and sent as
                          the system prompt.
                        </p>
                      </div>
                      <Textarea
                        rows={5}
                        value={draft.system_prompt}
                        onChange={(event) =>
                          onChange({ system_prompt: event.target.value })
                        }
                      />
                    </section>

                    <section className="grid gap-4">
                      <div>
                        <h3 className="font-semibold">Parameters</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          These settings are saved per deployment endpoint.
                        </p>
                      </div>
                      <SliderField
                        label="Temperature"
                        description="Controls randomness. Lower is more focused, higher is more creative."
                        min={0}
                        max={2}
                        step={0.1}
                        value={draft.temperature}
                        onChange={(temperature) => onChange({ temperature })}
                      />
                      <SliderField
                        label="Top P"
                        description="Nucleus sampling. Controls diversity of word choices."
                        min={0.01}
                        max={1}
                        step={0.01}
                        value={draft.top_p}
                        onChange={(top_p) => onChange({ top_p })}
                      />
                      <SliderField
                        label="Max Tokens"
                        description="Maximum length of the response."
                        min={1}
                        max={4096}
                        step={1}
                        value={draft.max_tokens}
                        onChange={(max_tokens) => onChange({ max_tokens })}
                      />
                      <SliderField
                        label="Repetition Penalty"
                        description="Reduces repetitive text. Higher values mean less repetition."
                        min={1}
                        max={2}
                        step={0.1}
                        value={draft.repetition_penalty}
                        onChange={(repetition_penalty) =>
                          onChange({ repetition_penalty })
                        }
                      />
                    </section>
                  </>
                ) : null}
              </CardContent>

              {error ? (
                <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100">
                  {error}
                </div>
              ) : null}

              <CardFooter className="flex flex-col gap-3 border-t bg-slate-50 py-5 sm:flex-row sm:justify-between dark:border-[#55555a] dark:bg-[#29292c]">
                <Button type="button" variant="outline" onClick={onReset}>
                  <RotateCcw className="h-4 w-4" />
                  Reset to defaults
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={onSave}
                    className="dark:bg-[#505056] dark:text-slate-50 dark:hover:bg-[#606066]"
                    disabled={
                      saving ||
                      draft.guardrail_policy_names.length !== 2 ||
                      draft.guardrail_policy_names.some((policy) => !policy) ||
                      draft.guardrail_policy_names[0].toLowerCase() ===
                        draft.guardrail_policy_names[1].toLowerCase()
                    }
                  >
                    {saving ? "Saving..." : "Save settings"}
                  </Button>
                </div>
              </CardFooter>
            </>
          ) : (
            <CardContent className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading settings...
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

type SliderFieldProps = {
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
};

function SliderField({
  label,
  description,
  min,
  max,
  step,
  value,
  onChange,
}: SliderFieldProps) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <Label className="text-slate-700 dark:text-slate-200">{label}</Label>
        <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:border-violet-500/40 dark:bg-violet-500/10 dark:text-violet-200">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-blue-600 dark:bg-[#606066] dark:accent-violet-400"
      />
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </div>
  );
}
