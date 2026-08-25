import { LoaderCircle, Sparkles, Volume2, VolumeX } from "lucide-react";

import { UseCaseComposer } from "@/app/workspace/WorkspacePrimitives";
import { PromptExamples } from "@/components/PromptExamples";

import { languageServicePromptGalleries } from "./prompts";
import type {
  LanguageServiceMode,
  LanguageServiceModeOption,
  LanguageServiceUseCaseId,
  TextTranslationResult,
  TranslationModelOption,
} from "./types";
import { languageLabel } from "./types";

export function TextTranslationWorkspace(
  {
    configured,
    sourceText,
    draftText,
    result,
    loading,
    error,
    audioEnabled,
    speaking,
    onDraftTextChange,
    onTranslate,
    onSpeakTranslation,
    useCase,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    mode: _mode,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    modeOptions: _modeOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    modeImplemented: _modeImplemented,
    sourceLanguage,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    targetLanguage: _targetLanguage,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    model: _model,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    modelOptions: _modelOptions,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onSourceLanguageChange: _onSourceLanguageChange,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onTargetLanguageChange: _onTargetLanguageChange,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onModelChange: _onModelChange,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onModeChange: _onModeChange,
  }: {
  configured: boolean;
  useCase: LanguageServiceUseCaseId;
  mode: LanguageServiceMode;
  modeOptions: readonly LanguageServiceModeOption[];
  modeImplemented: boolean;
  sourceText: string;
  draftText: string;
  sourceLanguage: string;
  targetLanguage: string;
  model: string;
  modelOptions: readonly TranslationModelOption[];
  result: TextTranslationResult | null;
  loading: boolean;
  error: string;
  audioEnabled: boolean;
  speaking: boolean;
  onDraftTextChange: (value: string) => void;
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onModelChange: (model: string) => void;
  onModeChange: (mode: LanguageServiceMode) => void;
  onTranslate: () => void;
  onSpeakTranslation: () => void;
}) {
  const translatedText = result?.translated_text.trim() ?? "";
  const detectedLanguage = result?.detected_language
    ? languageLabel(result.detected_language)
    : null;
  const detectedLanguageDisplay = detectedLanguage
    ? `${detectedLanguage}${
        typeof result?.detected_confidence === "number"
          ? ` [${Math.round(result.detected_confidence * 100)}% confidence]`
          : ""
      }`
    : null;
  const canSubmit = configured && !loading && draftText.trim();
  const promptGallery = languageServicePromptGalleries[useCase];
  const outputTitle =
    useCase === "language_detection"
      ? "Detected language"
      : useCase === "pii_redaction"
        ? "Redacted text"
        : useCase === "text_analytics_health"
          ? "Health insights"
          : "Translated text";
  const outputSubtitle =
    useCase === "text_translation"
      ? [
          result?.target_language
            ? `Translated to ${languageLabel(result.target_language)}`
            : "",
          detectedLanguageDisplay ? `Detected ${detectedLanguageDisplay}` : "",
        ]
          .filter(Boolean)
          .join(" · ")
      : useCase === "language_detection"
        ? result
          ? languageLabel(result.target_language)
          : ""
        : useCase === "pii_redaction"
          ? result
            ? "PII entities redacted"
            : ""
          : result
            ? "Entities and relationships extracted"
            : "";
  const composerAction =
    useCase === "text_translation" ? "translate" : "analyze";
  const resultPlaceholder =
    useCase === "language_detection"
      ? "The detected language appears here."
      : useCase === "pii_redaction"
        ? "The redacted text appears here."
        : useCase === "text_analytics_health"
          ? "Health insights appear here."
          : "The translation appears here.";

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      {!configured ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          Configure FOUNDRY_PROJECT_ENDPOINT or FOUNDRY_TRANSLATOR_ENDPOINT to
          enable this use case. Microsoft Entra ID is used by default;
          FOUNDRY_TRANSLATOR_KEY remains an optional key fallback.
        </p>
      ) : null}
      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          {error}
        </p>
      ) : null}
      <PromptExamples
        title={promptGallery.title}
        description={promptGallery.description}
        icon={<Sparkles className="h-4 w-4" />}
        examples={promptGallery.examples}
        value={draftText}
        onSelect={onDraftTextChange}
      />

      <div className="grid min-h-[26rem] flex-1 gap-4 lg:grid-cols-2">
        <section className="flex min-h-[24rem] flex-col rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-[#55555a]">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Source text
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {sourceLanguage === "auto"
                ? detectedLanguage
                  ? `Detected ${detectedLanguageDisplay}`
                  : "Auto detect source language"
                : languageLabel(sourceLanguage)}
            </p>
          </div>
          <div className="min-h-80 flex-1 whitespace-pre-wrap p-5 text-base leading-7 text-slate-900 dark:text-slate-50">
            {sourceText || (
              <span className="text-slate-400 dark:text-slate-500">
                Your text appears here.
              </span>
            )}
          </div>
        </section>

        <section className="flex min-h-[24rem] flex-col rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-[#55555a]">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {outputTitle}
            </h3>
            {outputSubtitle ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {outputSubtitle}
              </p>
            ) : null}
            {useCase === "text_translation" &&
            audioEnabled &&
            translatedText ? (
              <button
                type="button"
                aria-label={speaking ? "Pause translated audio" : "Play translated audio"}
                onClick={onSpeakTranslation}
                className="mt-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-blue-400 hover:text-blue-600 dark:border-[#606066] dark:text-slate-300 dark:hover:border-violet-400 dark:hover:text-violet-200"
              >
                {speaking ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
            ) : null}
          </div>
          <div className="min-h-80 flex-1 whitespace-pre-wrap p-5 text-base leading-7 text-slate-900 dark:text-slate-50">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                {useCase === "text_translation"
                  ? "Detecting language and translating..."
                  : "Analyzing..."}
              </span>
            ) : translatedText ? (
              translatedText
            ) : (
              <span className="text-slate-400 dark:text-slate-500">
                {resultPlaceholder}
              </span>
            )}
          </div>
        </section>
      </div>

      <UseCaseComposer
        ariaLabel={`Enter text to ${composerAction}`}
        value={draftText}
        onChange={onDraftTextChange}
        onSubmit={onTranslate}
        disabled={!canSubmit}
        submitting={loading}
        placeholder={`Enter text to ${composerAction}...`}
      />
    </div>
  );
}
