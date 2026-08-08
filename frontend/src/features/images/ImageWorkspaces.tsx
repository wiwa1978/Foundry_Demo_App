import {
  ChevronsUpDown,
  Download,
  GitCompareArrows,
  Image,
  LoaderCircle,
  Settings,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { ImageGenerationResult } from "@/app/workspace/contracts";
import { formatModelName } from "@/app/workspace/formatters";
import {
  ComposerSelect,
  UseCaseComposer,
} from "@/app/workspace/WorkspacePrimitives";
import { PromptExamples } from "@/components/PromptExamples";
import { Button } from "@/components/ui/button";
import { imageToImagePrompts } from "@/features/useCases/imageToImagePrompts";
import { textToImagePrompts } from "@/features/useCases/textToImagePrompts";

import type { ImageSample } from "./api";

type TextToImageWorkspaceProps = {
  model: string;
  models: string[];
  prompt: string;
  submittedPrompt: string;
  size: string;
  result: ImageGenerationResult | null;
  generating: boolean;
  error: string;
  onPromptChange: (prompt: string) => void;
  onSizeChange: (size: string) => void;
  onModelChange: (model: string) => void;
  onGenerate: () => void;
};

export function TextToImageWorkspace({
  model,
  models,
  prompt,
  submittedPrompt,
  size,
  result,
  generating,
  error,
  onPromptChange,
  onSizeChange,
  onModelChange,
  onGenerate,
}: TextToImageWorkspaceProps) {
  const imageUrl = result
    ? `data:${result.mime_type};base64,${result.image_base64}`
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <PromptExamples
        title="Image prompt gallery"
        description="Choose an example to load it into the image composer."
        icon={<Sparkles className="h-4 w-4" />}
        examples={textToImagePrompts}
        value={prompt}
        onSelect={onPromptChange}
      />
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto w-full max-w-5xl">
          <div className="min-h-[360px] w-full rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4 dark:border-[#55555a] dark:bg-[#303033]/70 sm:min-h-[520px]">
            {submittedPrompt ? (
              <div className="mx-auto mb-4 max-w-3xl rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-200">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Submitted prompt
                </div>
                <p className="whitespace-pre-wrap break-words">
                  {submittedPrompt}
                </p>
              </div>
            ) : null}

            {imageUrl && result ? (
              <div className="w-full">
                <img
                  src={imageUrl}
                  alt={result.prompt || "AI-generated image"}
                  className="mx-auto max-h-[68vh] w-auto rounded-2xl object-contain shadow-2xl"
                />
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    {result.model} · {result.width} × {result.height} ·
                    Generation time: {(result.duration_ms / 1000).toFixed(1)}s
                  </span>
                  <a
                    href={imageUrl}
                    download="foundry-generated-image.png"
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Download className="h-3.5 w-3.5" /> Download PNG
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[300px] items-center justify-center sm:min-h-[440px]">
                <div className="max-w-xs text-center text-slate-400">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-violet-100 text-violet-500 dark:bg-violet-500/15 dark:text-violet-200">
                    {generating ? (
                      <Sparkles className="h-9 w-9 animate-pulse" />
                    ) : (
                      <Image className="h-9 w-9" />
                    )}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-slate-700 dark:text-slate-200">
                    {generating
                      ? "Brewing your picture..."
                      : "Imagine it. Describe it."}
                  </h3>
                  <p className="mt-2 text-sm leading-6">
                    {generating
                      ? "Hang on a moment while the model brings your prompt to life."
                      : "Enter a prompt below to generate a high-quality PNG."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <UseCaseComposer
        ariaLabel="Image prompt"
        placeholder="Describe the image you want to create..."
        value={prompt}
        disabled={!model || !prompt.trim() || generating}
        submitting={generating}
        disclaimer="AI-generated images may be inaccurate"
        error={error}
        onChange={onPromptChange}
        onSubmit={onGenerate}
        leftControls={
          <>
            <ComposerSelect
              id="image-canvas-size"
              ariaLabel="Image canvas size"
              value={size}
              onChange={onSizeChange}
              options={[
                { value: "1024x1024", label: "Square · 1024 × 1024" },
                { value: "768x1024", label: "Portrait · 768 × 1024" },
                { value: "1024x768", label: "Landscape · 1024 × 768" },
              ]}
            />
            <ComposerSelect
              id="image-composer-model"
              ariaLabel="Image model"
              value={model}
              onChange={onModelChange}
              options={models.map((modelName) => ({
                value: modelName,
                label: formatModelName(modelName),
              }))}
            />
          </>
        }
      />
    </div>
  );
}

type ImageToImageWorkspaceProps = {
  model: string;
  models: string[];
  prompt: string;
  size: string;
  source: File | null;
  result: ImageGenerationResult | null;
  generating: boolean;
  error: string;
  onPromptChange: (prompt: string) => void;
  onSizeChange: (size: string) => void;
  onSourceChange: (source: File | null) => void;
  onModelChange: (model: string) => void;
  onGenerate: () => void;
};

export function ImageToImageWorkspace({
  model,
  models,
  prompt,
  size,
  source,
  result,
  generating,
  error,
  onPromptChange,
  onSizeChange,
  onSourceChange,
  onModelChange,
  onGenerate,
}: ImageToImageWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [samples, setSamples] = useState<ImageSample[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(true);
  const resultUrl = result
    ? `data:${result.mime_type};base64,${result.image_base64}`
    : "";

  useEffect(() => {
    if (!source) {
      setSourceUrl("");
      return;
    }
    const url = URL.createObjectURL(source);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/images/samples", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: ImageSample[]) => setSamples(data))
      .catch(() => undefined)
      .finally(() => setSamplesLoading(false));
    return () => controller.abort();
  }, []);

  async function selectSample(sample: ImageSample) {
    setSamplesLoading(true);
    try {
      const response = await fetch(sample.image_url);
      if (!response.ok) throw new Error("Could not load image sample.");
      const blob = await response.blob();
      onSourceChange(new File([blob], sample.id, { type: blob.type }));
    } catch {
      toast.error("Could not load image sample.");
    } finally {
      setSamplesLoading(false);
    }
  }

  function chooseSource(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast.error("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Source image cannot exceed 10 MB.");
      return;
    }
    onSourceChange(file);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <PromptExamples
        title="Image transformation prompts"
        description="Choose an instruction, then adapt it to your source image."
        icon={<Sparkles className="h-4 w-4" />}
        examples={imageToImagePrompts}
        value={prompt}
        onSelect={onPromptChange}
      />
      {samples.length || samplesLoading ? (
        <section className="border-b bg-white px-5 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
          <div className="mx-auto max-w-6xl">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Start with a stock image
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {samplesLoading && !samples.length ? (
                <div className="flex h-20 items-center gap-2 text-sm text-slate-400">
                  <LoaderCircle className="h-4 w-4 animate-spin" /> Loading
                  images...
                </div>
              ) : null}
              {samples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  disabled={samplesLoading}
                  onClick={() => void selectSample(sample)}
                  className="group relative h-24 w-36 flex-none overflow-hidden rounded-xl border bg-slate-100 text-left disabled:opacity-60 dark:border-[#606066] dark:bg-[#303033]"
                  title={`${sample.name}${sample.attribution ? ` - ${sample.attribution}` : ""}`}
                >
                  <img
                    src={sample.image_url}
                    alt={sample.name}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-5 text-xs font-medium text-white">
                    {sample.name}
                  </span>
                </button>
              ))}
            </div>
            {samples.some((sample) => sample.attribution) ? (
              <p className="mt-2 text-[11px] text-slate-400">
                Photos from Unsplash. Creator attribution is available on each
                image tooltip.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      <div className="flex-1 overflow-auto p-5">
        <div className="mx-auto grid min-h-full max-w-6xl gap-4 md:grid-cols-2">
          <div className="flex min-h-[360px] flex-col rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4 dark:border-[#606066] dark:bg-[#29292c]/70">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Source
                </div>
                <div className="mt-1 max-w-xs truncate text-sm text-slate-600 dark:text-slate-300">
                  {source?.name ?? "No image selected"}
                </div>
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                chooseSource(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-50 text-slate-400 dark:bg-[#303033]"
            >
              {sourceUrl ? (
                <img
                  src={sourceUrl}
                  alt="Source upload"
                  className="max-h-[62vh] w-full object-contain"
                />
              ) : (
                <div className="p-8 text-center">
                  <UploadCloud className="mx-auto h-10 w-10" />
                  <p className="mt-3 text-sm">
                    Upload a PNG, JPEG, or WebP image up to 10 MB.
                  </p>
                </div>
              )}
            </button>
          </div>
          <div className="flex min-h-[360px] flex-col rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-[#55555a] dark:bg-[#29292c]/70">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Transformed result
            </div>
            <div className="flex flex-1 items-center justify-center overflow-hidden rounded-xl bg-slate-50 dark:bg-[#303033]">
              {resultUrl && result ? (
                <img
                  src={resultUrl}
                  alt={result.prompt || "AI-edited image"}
                  className="max-h-[62vh] w-full object-contain"
                />
              ) : (
                <div className="max-w-xs p-8 text-center text-slate-400">
                  <Image className="mx-auto h-10 w-10" />
                  <p className="mt-3 text-sm">
                    Your transformed image will appear here.
                  </p>
                </div>
              )}
            </div>
            {resultUrl && result ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  {result.model} · {result.width} × {result.height} ·{" "}
                  {(result.duration_ms / 1000).toFixed(1)}s
                </span>
                <a
                  href={resultUrl}
                  download="foundry-edited-image.png"
                  className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 font-medium"
                >
                  <Download className="h-3.5 w-3.5" /> Download PNG
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <UseCaseComposer
        ariaLabel="Image transformation prompt"
        placeholder="Describe how the source image should change..."
        value={prompt}
        disabled={!model || !source || !prompt.trim() || generating}
        submitting={generating}
        disclaimer="Image edits may alter details you intended to preserve"
        error={
          models.length
            ? error
            : "Add a gpt-image deployment to use image editing."
        }
        onChange={onPromptChange}
        onSubmit={onGenerate}
        leftControls={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              title={source ? `Replace ${source.name}` : "Upload source image"}
            >
              <UploadCloud className="mr-2 h-4 w-4" />{" "}
              {source ? "Replace source" : "Upload source"}
            </Button>
            <ComposerSelect
              id="image-edit-size"
              ariaLabel="Edited image size"
              value={size}
              onChange={onSizeChange}
              options={[
                { value: "1024x1024", label: "Square · 1024 × 1024" },
                { value: "768x1024", label: "Portrait · 768 × 1024" },
                { value: "1024x768", label: "Landscape · 1024 × 768" },
              ]}
            />
            <ComposerSelect
              id="image-edit-model"
              ariaLabel="Image edit model"
              value={model}
              onChange={onModelChange}
              options={models.map((modelName) => ({
                value: modelName,
                label: formatModelName(modelName),
              }))}
            />
          </>
        }
      />
    </div>
  );
}

type ImageComparisonWorkspaceProps = {
  allModels: string[];
  models: string[];
  prompt: string;
  size: string;
  results: Record<string, ImageGenerationResult>;
  errors: Record<string, string>;
  generating: boolean;
  onPromptChange: (prompt: string) => void;
  onSizeChange: (size: string) => void;
  onGenerate: () => void;
  onOpenSettings: (model: string) => void;
  onModelChange: (currentModel: string, nextModel: string) => void;
};

export function ImageComparisonWorkspace({
  allModels,
  models,
  prompt,
  size,
  results,
  errors,
  generating,
  onPromptChange,
  onSizeChange,
  onGenerate,
  onOpenSettings,
  onModelChange,
}: ImageComparisonWorkspaceProps) {
  if (!models.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <GitCompareArrows className="mx-auto mb-4 h-10 w-10 text-slate-300 dark:text-[#77777d]" />
          <h3 className="text-lg font-semibold">
            Select image models to compare
          </h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Turn on up to two image endpoints in the comparison list to start
            side-by-side generation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-slate-100/70 dark:bg-[#303033]">
      <PromptExamples
        title="Image prompt gallery"
        description="Choose an example to load the same prompt into both image panes."
        icon={<Sparkles className="h-4 w-4" />}
        examples={textToImagePrompts}
        value={prompt}
        onSelect={onPromptChange}
      />
      <div className="flex-1 overflow-x-auto p-4">
        <div
          className="grid h-full min-w-[44rem] gap-4"
          style={{
            gridTemplateColumns: `repeat(${models.length}, minmax(20rem, 1fr))`,
          }}
        >
          {models.map((model) => (
            <ImageComparisonPane
              key={model}
              allModels={allModels}
              selectedModels={models}
              model={model}
              prompt={prompt}
              size={size}
              result={results[model]}
              error={errors[model]}
              generating={generating}
              onPromptChange={onPromptChange}
              onSizeChange={onSizeChange}
              onGenerate={onGenerate}
              onOpenSettings={onOpenSettings}
              onModelChange={onModelChange}
            />
          ))}
        </div>
      </div>
      <p className="border-t bg-white px-4 py-2 text-center text-xs text-slate-500 dark:border-[#55555a] dark:bg-[#29292c] dark:text-slate-400">
        Text typed in either prompt is mirrored to both panes. Sending generates
        the same image size with every selected model.
      </p>
    </div>
  );
}

function ImageComparisonPane({
  allModels,
  selectedModels,
  model,
  prompt,
  size,
  result,
  error,
  generating,
  onPromptChange,
  onSizeChange,
  onGenerate,
  onOpenSettings,
  onModelChange,
}: {
  allModels: string[];
  selectedModels: string[];
  model: string;
  prompt: string;
  size: string;
  result?: ImageGenerationResult;
  error?: string;
  generating: boolean;
  onPromptChange: (prompt: string) => void;
  onSizeChange: (size: string) => void;
  onGenerate: () => void;
  onOpenSettings: (model: string) => void;
  onModelChange: (currentModel: string, nextModel: string) => void;
}) {
  const imageUrl = result
    ? `data:${result.mime_type};base64,${result.image_base64}`
    : "";

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onGenerate();
      }}
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
    >
      <header className="flex items-center gap-2 border-b px-3 py-3 dark:border-[#55555a]">
        <div className="relative min-w-0 flex-1">
          <select
            aria-label={`Image model for comparison pane ${model}`}
            value={model}
            onChange={(event) => onModelChange(model, event.target.value)}
            className="h-9 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 py-1 pr-8 text-sm font-medium shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
          >
            {allModels.map((option) => (
              <option
                key={option}
                value={option}
                disabled={option !== model && selectedModels.includes(option)}
              >
                {formatModelName(option)}
              </option>
            ))}
          </select>
          <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onOpenSettings(model)}
          title={`Open settings for ${model}`}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-[#303033]">
        {imageUrl && result ? (
          <div className="w-full">
            <div className="mb-3 rounded-xl border bg-white px-3 py-2 text-sm leading-5 text-slate-700 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-200">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Submitted prompt
              </div>
              <p className="whitespace-pre-wrap">{result.prompt}</p>
            </div>
            <img
              src={imageUrl}
              alt={result.prompt || "AI-generated image"}
              className="mx-auto max-h-[52vh] w-auto rounded-xl object-contain shadow-xl"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {result.width} × {result.height} · Generation time:{" "}
                {(result.duration_ms / 1000).toFixed(1)}s
              </span>
              <a
                href={imageUrl}
                download={`${model}-generated-image.png`}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-input bg-background px-3 font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-xs text-center text-slate-400">
              {generating ? (
                <LoaderCircle className="mx-auto h-9 w-9 animate-spin" />
              ) : (
                <Image className="mx-auto h-9 w-9 text-slate-300 dark:text-[#77777d]" />
              )}
              <h3 className="mt-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {generating
                  ? `Generating with ${formatModelName(model)}...`
                  : `Ready for ${formatModelName(model)}`}
              </h3>
              <p className="mt-1 text-xs">
                Use either prompt below. Both inputs stay synchronized.
              </p>
            </div>
          </div>
        )}
      </div>

      <UseCaseComposer
        ariaLabel={`Image prompt for ${model}`}
        placeholder="Describe the image for both models..."
        value={prompt}
        disabled={!prompt.trim() || generating}
        submitting={generating}
        disclaimer="AI-generated images may be inaccurate"
        error={error}
        onChange={onPromptChange}
        onSubmit={onGenerate}
        leftControls={
          <ComposerSelect
            id={`image-comparison-size-${model}`}
            ariaLabel={`Image canvas size for ${model}`}
            value={size}
            onChange={onSizeChange}
            options={[
              { value: "1024x1024", label: "Square · 1024 × 1024" },
              { value: "768x1024", label: "Portrait · 768 × 1024" },
              { value: "1024x768", label: "Landscape · 1024 × 768" },
            ]}
          />
        }
      />
    </form>
  );
}
