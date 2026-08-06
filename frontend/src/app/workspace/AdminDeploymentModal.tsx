import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, RotateCcw, Tags, X } from "lucide-react";

import {
  defaultDeploymentDraft,
  modelModalitiesList,
} from "@/app/workspace/constants";
import type {
  AdminConfig,
  AdminDeploymentDraft,
  ModelModality,
  ModelSettings,
  StatusMessage,
} from "@/app/workspace/contracts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type AdminDeploymentModalProps = {
  config: AdminConfig | null;
  draft: AdminDeploymentDraft;
  deploying: boolean;
  message: StatusMessage | null;
  onClose: () => void;
  onCreate: () => void;
  onChange: (patch: Partial<AdminDeploymentDraft>) => void;
};

export function AdminDeploymentModal({
  config,
  draft,
  deploying,
  message,
  onClose,
  onCreate,
  onChange,
}: AdminDeploymentModalProps) {
  function toggleModality(modality: ModelModality) {
    const next = draft.modalities.includes(modality)
      ? draft.modalities.filter((item) => item !== modality)
      : [...draft.modalities, modality];
    onChange({ modalities: next.length ? next : [modality] });
  }

  const canCreate =
    Boolean(config?.is_configured) &&
    Boolean(draft.deployment_name.trim()) &&
    Boolean(draft.model_name.trim()) &&
    Boolean(draft.model_version.trim()) &&
    !deploying;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#303033]/60 p-4">
      <Card className="max-h-[90vh] w-full max-w-3xl overflow-auto bg-white text-slate-950 dark:border-[#606066] dark:bg-[#39393d] dark:text-slate-50">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Foundry deployment admin</CardTitle>
              <CardDescription>
                Create Azure AI Foundry model deployments without opening the portal.
              </CardDescription>
            </div>
            <button
              type="button"
              className="rounded p-1 hover:bg-slate-100 dark:hover:bg-[#45454a]"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>

        <CardContent className="grid gap-6 pt-6">
          <section className="rounded-lg border bg-slate-50 p-3 dark:border-[#606066] dark:bg-[#29292c]">
            <div className="flex items-start gap-2">
              {config?.is_configured ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 text-amber-600" />
              )}
              <div className="grid gap-1 text-sm">
                <p className="font-medium">
                  {config === null
                    ? "Loading Azure target..."
                    : config.is_configured
                      ? "Azure target configured"
                      : "Azure target missing configuration"}
                </p>
                {config ? (
                  config.is_configured ? (
                    <p className="break-all text-xs text-slate-500 dark:text-slate-400">
                      {config.subscription_id} / {config.resource_group} / {config.account_name}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Add {config.missing.join(", ")} to your `.env`.
                    </p>
                  )
                ) : null}
              </div>
            </div>
          </section>

          {message ? (
            <div
              className={cn(
                "rounded-lg border p-3 text-sm",
                message.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
                  : "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100",
              )}
            >
              {message.text}
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2">
            <Field label="Deployment name">
              <Input
                value={draft.deployment_name}
                placeholder="gpt-5.5"
                onChange={(event) => onChange({ deployment_name: event.target.value })}
              />
            </Field>
            <Field label="Base model name">
              <Input
                value={draft.model_name}
                placeholder="gpt-4o"
                onChange={(event) => onChange({ model_name: event.target.value })}
              />
            </Field>
            <Field label="Model version">
              <Input
                value={draft.model_version}
                placeholder="2024-11-20"
                onChange={(event) => onChange({ model_version: event.target.value })}
              />
            </Field>
            <Field label="Model format">
              <select
                value={draft.model_format}
                onChange={(event) => onChange({ model_format: event.target.value })}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="OpenAI">OpenAI</option>
                <option value="Microsoft">Microsoft</option>
              </select>
            </Field>
            <Field label="SKU name">
              <select
                value={draft.sku_name}
                onChange={(event) => onChange({ sku_name: event.target.value })}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="Standard">Standard</option>
                <option value="GlobalStandard">GlobalStandard</option>
                <option value="GlobalBatch">GlobalBatch</option>
                <option value="ProvisionedManaged">ProvisionedManaged</option>
              </select>
            </Field>
            <Field label="SKU capacity">
              <Input
                type="number"
                min={1}
                value={draft.sku_capacity}
                onChange={(event) => onChange({ sku_capacity: Number(event.target.value) })}
              />
            </Field>
            <Field label="Version upgrade option">
              <select
                value={draft.version_upgrade_option}
                onChange={(event) => onChange({ version_upgrade_option: event.target.value })}
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="OnceNewDefaultVersionAvailable">Once new default version is available</option>
                <option value="OnceCurrentVersionExpired">Once current version expires</option>
                <option value="NoAutoUpgrade">No auto upgrade</option>
              </select>
            </Field>
            <Field label="RAI policy name">
              <Input
                value={draft.rai_policy_name}
                placeholder="Optional"
                onChange={(event) => onChange({ rai_policy_name: event.target.value })}
              />
            </Field>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Field label="Default API surface">
              <select
                value={draft.api_surface}
                onChange={(event) =>
                  onChange({ api_surface: event.target.value as ModelSettings["api_surface"] })
                }
                className="h-9 rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="responses">Responses API</option>
                <option value="chat_completions">Chat Completions API</option>
              </select>
            </Field>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-200">Model capabilities</Label>
              <div className="flex flex-wrap gap-2">
                {modelModalitiesList.map((modality) => (
                  <button
                    key={modality}
                    type="button"
                    onClick={() => toggleModality(modality)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm capitalize transition",
                      draft.modalities.includes(modality)
                        ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-[#606066] dark:text-slate-300 dark:hover:bg-[#45454a]",
                    )}
                  >
                    <Tags className="h-3.5 w-3.5" />
                    {modality}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <label className="flex items-start gap-2 rounded-lg border p-3 text-sm dark:border-[#606066]">
            <input
              type="checkbox"
              checked={draft.wait_for_completion}
              onChange={(event) => onChange({ wait_for_completion: event.target.checked })}
              className="mt-1"
            />
            <span>
              Wait for Azure to finish provisioning before returning. Leave this off for long-running
              deployments.
            </span>
          </label>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 border-t bg-slate-50 sm:flex-row sm:justify-between dark:border-[#55555a] dark:bg-[#29292c]">
          <Button type="button" variant="outline" onClick={() => onChange(defaultDeploymentDraft)}>
            <RotateCcw className="h-4 w-4" />
            Reset form
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="button" onClick={onCreate} disabled={!canCreate}>
              {deploying ? "Creating..." : "Create deployment"}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label className="text-slate-700 dark:text-slate-200">{label}</Label>
      {children}
    </div>
  );
}
