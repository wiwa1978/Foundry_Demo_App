import { FlaskConical, Plus, Rocket, Tags } from "lucide-react";
import { useEffect, useState } from "react";

import type {
  ModelBucketName,
  UseCaseModelMap,
  UseCaseResourceSettings,
} from "@/api/types";
import { useCaseModules } from "@/app/useCaseRegistry";
import type { UseCaseCategory } from "@/app/types";
import { colorPalettes, modelModalitiesList } from "@/app/workspace/constants";
import type {
  ColorPalette,
  ModelModality,
  StatusMessage,
} from "@/app/workspace/contracts";
import { formatModelName } from "@/app/workspace/formatters";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AppSettingsPageProps = {
  models: string[];
  modelModalities: Record<string, ModelModality[]>;
  newModel: string;
  message: StatusMessage | null;
  colorPalette: ColorPalette;
  canManageModels: boolean;
  liveTranslationSettings: UseCaseResourceSettings;
  liveTranslationSettingsLoading: boolean;
  liveTranslationSettingsSaving: boolean;
  liveTranslationSettingsMessage: string;
  useCaseModelMap: UseCaseModelMap;
  useCaseModelBucketNames: ModelBucketName[];
  useCaseModelMapLoading: boolean;
  useCaseModelMapSaving: boolean;
  useCaseModelMapMessage: string;
  onNewModelChange: (value: string) => void;
  onAddModel: () => void;
  onOpenAdmin: () => void;
  onOpenEvaluationsAdmin?: () => void;
  onSaveLiveTranslationSettings: (binding: string) => Promise<void>;
  onSaveUseCaseModelMap: (mapping: UseCaseModelMap) => Promise<void>;
  onSaveCapabilities: (
    model: string,
    modalities: ModelModality[],
  ) => Promise<void>;
  onColorPaletteChange: (palette: ColorPalette) => void;
};

export function AppSettingsPage({
  models,
  modelModalities,
  newModel,
  message,
  colorPalette,
  canManageModels,
  liveTranslationSettings,
  liveTranslationSettingsLoading,
  liveTranslationSettingsSaving,
  liveTranslationSettingsMessage,
  useCaseModelMap,
  useCaseModelBucketNames,
  useCaseModelMapLoading,
  useCaseModelMapSaving,
  useCaseModelMapMessage,
  onNewModelChange,
  onAddModel,
  onOpenAdmin,
  onOpenEvaluationsAdmin,
  onSaveLiveTranslationSettings,
  onSaveUseCaseModelMap,
  onSaveCapabilities,
  onColorPaletteChange,
}: AppSettingsPageProps) {
  const [capabilityDrafts, setCapabilityDrafts] = useState<
    Record<string, ModelModality[]>
  >({});
  const [capabilitySaving, setCapabilitySaving] = useState("");
  const [capabilityMessage, setCapabilityMessage] =
    useState<StatusMessage | null>(null);
  const [liveBinding, setLiveBinding] = useState(
    liveTranslationSettings.binding,
  );
  const [useCaseMapDraft, setUseCaseMapDraft] = useState(useCaseModelMap);
  const [activeUseCaseCategory, setActiveUseCaseCategory] =
    useState<UseCaseCategory>("media");

  useEffect(() => {
    setLiveBinding(liveTranslationSettings.binding);
  }, [liveTranslationSettings.binding]);

  useEffect(() => {
    setUseCaseMapDraft(useCaseModelMap);
  }, [useCaseModelMap]);

  function capabilitiesFor(model: string) {
    return capabilityDrafts[model] ?? modelModalities[model] ?? ["text"];
  }

  function toggleCapability(model: string, modality: ModelModality) {
    const current = capabilitiesFor(model);
    const next = current.includes(modality)
      ? current.filter((item) => item !== modality)
      : [...current, modality];
    setCapabilityDrafts((drafts) => ({
      ...drafts,
      [model]: next.length ? next : [modality],
    }));
    setCapabilityMessage(null);
  }

  async function saveCapabilities(model: string) {
    setCapabilitySaving(model);
    setCapabilityMessage(null);
    try {
      await onSaveCapabilities(model, capabilitiesFor(model));
      setCapabilityDrafts((current) => {
        const next = { ...current };
        delete next[model];
        return next;
      });
      setCapabilityMessage({
        type: "success",
        text: `Saved capabilities for ${model}.`,
      });
    } catch (error) {
      setCapabilityMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Failed to save capabilities.",
      });
    } finally {
      setCapabilitySaving("");
    }
  }

  const bucketOptions: ModelBucketName[] = useCaseModelBucketNames.length
    ? useCaseModelBucketNames
    : [
        "models",
        "text_models",
        "image_models",
        "transcription_models",
        "realtime_transcription_models",
        "traditional_transcription_models",
        "tts_models",
      ];
  const visibleUseCases = useCaseModules.filter(
    (useCase) => (useCase.category ?? "media") === activeUseCaseCategory,
  );
  const useCaseMapDirty =
    JSON.stringify(useCaseMapDraft) !== JSON.stringify(useCaseModelMap);

  function formatBucketName(bucket: string) {
    return bucket.replace(/_/g, " ");
  }

  function useCaseMapping(useCaseId: string) {
    return useCaseMapDraft[useCaseId] ?? "models";
  }

  function setUseCaseBucket(useCaseId: string, bucket: ModelBucketName) {
    setUseCaseMapDraft((current) => ({ ...current, [useCaseId]: bucket }));
  }

  function setUseCaseRoleBucket(
    useCaseId: string,
    role: string,
    bucket: ModelBucketName,
  ) {
    setUseCaseMapDraft((current) => {
      const mapping = current[useCaseId];
      const roleMapping: Record<string, ModelBucketName> =
        mapping && typeof mapping !== "string" ? mapping : { primary: "models" };
      return {
        ...current,
        [useCaseId]: { ...roleMapping, [role]: bucket },
      };
    });
  }

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-5 dark:bg-[#303033]">
      <div className="mx-auto grid max-w-5xl gap-4">
        <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
          <CardHeader>
            <CardTitle>Color palette</CardTitle>
            <CardDescription>
              Choose a coordinated accent and surface palette. Your selection is
              saved in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
              role="radiogroup"
              aria-label="Color palette"
            >
              {colorPalettes.map((palette) => {
                const selected = colorPalette === palette.id;
                return (
                  <button
                    key={palette.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => onColorPaletteChange(palette.id)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-[#55555a] dark:bg-[#303033] dark:hover:border-[#77777d]",
                    )}
                  >
                    <span
                      className="mb-3 flex h-8 overflow-hidden rounded-lg"
                      aria-hidden="true"
                    >
                      {palette.swatches.map((color) => (
                        <span
                          key={color}
                          className="flex-1"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </span>
                    <span className="block text-sm font-semibold">
                      {palette.name}
                    </span>
                    <span className="mt-1 block text-xs leading-4 text-slate-500 dark:text-slate-400">
                      {palette.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {canManageModels ? (
          <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <CardHeader>
              <CardTitle>Live Interpreter resource</CardTitle>
              <CardDescription>
                Map Live translation to a named Foundry binding discovered from
                environment variables. The database stores only the binding
                name.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label
                  htmlFor="live-interpreter-binding"
                  className="text-sm font-medium"
                >
                  Foundry binding
                </label>
                <Select value={liveBinding} onValueChange={setLiveBinding}>
                  <SelectTrigger id="live-interpreter-binding" className="mt-2">
                    <SelectValue placeholder="Select a binding" />
                  </SelectTrigger>
                  <SelectContent>
                    {liveTranslationSettings.available_bindings.map(
                      (binding) => (
                        <SelectItem key={binding} value={binding}>
                          {binding}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                disabled={
                  liveTranslationSettingsLoading ||
                  liveTranslationSettingsSaving ||
                  !liveBinding
                }
                onClick={() => void onSaveLiveTranslationSettings(liveBinding)}
              >
                {liveTranslationSettingsSaving ? "Saving..." : "Save binding"}
              </Button>
              {liveTranslationSettingsMessage ? (
                <p className="text-sm text-slate-500 dark:text-slate-300 sm:col-span-2">
                  {liveTranslationSettingsMessage}
                </p>
              ) : null}
              {!liveTranslationSettings.available_bindings.length ? (
                <p className="text-xs text-amber-700 dark:text-amber-300 sm:col-span-2">
                  Add at least one FOUNDRY_PROJECT_ENDPOINT_&lt;BINDING&gt;
                  environment variable.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {canManageModels ? (
          <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <CardHeader>
              <CardTitle>Use case model buckets</CardTitle>
              <CardDescription>
                Map each use case to the /api/models bucket it should use. Use
                role mappings when a scenario needs more than one model type.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex w-fit rounded-full border border-slate-200 bg-slate-50 p-1 text-sm dark:border-[#55555a] dark:bg-[#303033]">
                {(["media", "agents"] as const).map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setActiveUseCaseCategory(category)}
                    className={cn(
                      "rounded-full px-4 py-1.5 font-medium capitalize transition",
                      activeUseCaseCategory === category
                        ? "bg-white text-slate-900 shadow-sm dark:bg-[#45454a] dark:text-slate-50"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                    )}
                  >
                    {category}
                  </button>
                ))}
              </div>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#55555a]">
                {visibleUseCases.map((useCase) => {
                  const mapping = useCaseMapping(useCase.id);
                  const roleEntries =
                    typeof mapping === "string" ? null : Object.entries(mapping);
                  return (
                    <div
                      key={useCase.id}
                      className="grid gap-3 border-b border-slate-200 p-3 last:border-b-0 dark:border-[#55555a] md:grid-cols-[minmax(0,1fr)_minmax(18rem,1.4fr)] md:items-center"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{useCase.title}</p>
                        <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                          {useCase.id}
                        </p>
                      </div>
                      {roleEntries ? (
                        <div className="grid gap-2">
                          {roleEntries.map(([role, bucket]) => (
                            <label
                              key={role}
                              className="grid gap-1 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center"
                            >
                              <span className="font-medium capitalize">{role}</span>
                              <Select
                                value={bucket}
                                onValueChange={(value) =>
                                  setUseCaseRoleBucket(
                                    useCase.id,
                                    role,
                                    value as ModelBucketName,
                                  )
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {bucketOptions.map((option) => (
                                    <SelectItem key={option} value={option}>
                                      {formatBucketName(option)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <Select
                          value={typeof mapping === "string" ? mapping : "models"}
                          onValueChange={(value) =>
                            setUseCaseBucket(useCase.id, value as ModelBucketName)
                          }
                        >
                          <SelectTrigger aria-label={`${useCase.title} model bucket`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {bucketOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {formatBucketName(option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={
                    useCaseModelMapLoading ||
                    useCaseModelMapSaving ||
                    !useCaseMapDirty
                  }
                  onClick={() => void onSaveUseCaseModelMap(useCaseMapDraft)}
                >
                  {useCaseModelMapSaving ? "Saving..." : "Save use case map"}
                </Button>
                {useCaseModelMapMessage ? (
                  <p className="text-sm text-slate-500 dark:text-slate-300">
                    {useCaseModelMapMessage}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {canManageModels ? (
          <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <CardHeader>
              <CardTitle>Model endpoints</CardTitle>
              <CardDescription>
                Model deployment names are stored in the local database. Values
                from `.env` are only used to seed the registry.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex gap-2">
                <Input
                  aria-label="Deployment name"
                  placeholder="deployment-name"
                  value={newModel}
                  onChange={(event) => onNewModelChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onAddModel();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={onAddModel}>
                  <Plus className="h-4 w-4" />
                  Add local endpoint
                </Button>
              </div>
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
              <div className="flex flex-wrap gap-2">
                {models.map((model) => (
                  <Badge key={model} variant="secondary">
                    {formatModelName(model)}
                  </Badge>
                ))}
              </div>
              <div className="border-t pt-4 dark:border-[#55555a]">
                <h3 className="font-semibold">Deployment capabilities</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Control which deployments are available in text, image, and
                  voice workflows.
                </p>
                <div className="mt-4 grid gap-3">
                  {models.map((model) => {
                    const capabilities = capabilitiesFor(model);
                    const dirty = capabilityDrafts[model] !== undefined;
                    return (
                      <div
                        key={model}
                        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#55555a] dark:bg-[#303033] sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 font-medium">
                          {formatModelName(model)}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {modelModalitiesList.map((modality) => (
                            <button
                              key={modality}
                              type="button"
                              onClick={() => toggleCapability(model, modality)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs capitalize transition",
                                capabilities.includes(modality)
                                  ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-[#77777d] dark:bg-[#505056] dark:text-slate-50"
                                  : "border-slate-200 text-slate-500 hover:bg-white dark:border-[#606066] dark:text-slate-400 dark:hover:bg-[#45454a]",
                              )}
                            >
                              <Tags className="h-3 w-3" /> {modality}
                            </button>
                          ))}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!dirty || capabilitySaving === model}
                            onClick={() => void saveCapabilities(model)}
                          >
                            {capabilitySaving === model ? "Saving..." : "Save"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {capabilityMessage ? (
                  <p
                    className={cn(
                      "mt-3 text-sm",
                      capabilityMessage.type === "success"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-red-700 dark:text-red-300",
                    )}
                  >
                    {capabilityMessage.text}
                  </p>
                ) : null}
              </div>
            </CardContent>
            <CardFooter className="border-t pt-4 dark:border-[#55555a]">
              <Button type="button" onClick={onOpenAdmin}>
                <Rocket className="h-4 w-4" />
                Deploy model in Foundry
              </Button>
              {onOpenEvaluationsAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onOpenEvaluationsAdmin}
                >
                  <FlaskConical className="h-4 w-4" />
                  Open admin dashboard
                </Button>
              ) : null}
            </CardFooter>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
