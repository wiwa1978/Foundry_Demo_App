import { Languages, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

import { languageLabel, sourceLanguages, targetLanguages } from "./types";
import type { TextTranslationResult } from "./types";

function TranslationSelect({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
      htmlFor={id}
    >
      {label}
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 min-w-44 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium normal-case tracking-normal text-slate-800 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#3f3f46] dark:bg-[#2b2b30] dark:text-slate-100 dark:focus:border-violet-400 dark:focus:ring-violet-500/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TextTranslationWorkspace({
  configured,
  sourceText,
  sourceLanguage,
  targetLanguage,
  result,
  loading,
  error,
  onSourceTextChange,
  onSourceLanguageChange,
  onTargetLanguageChange,
  onTranslate,
}: {
  configured: boolean;
  sourceText: string;
  sourceLanguage: string;
  targetLanguage: string;
  result: TextTranslationResult | null;
  loading: boolean;
  error: string;
  onSourceTextChange: (value: string) => void;
  onSourceLanguageChange: (value: string) => void;
  onTargetLanguageChange: (value: string) => void;
  onTranslate: () => void;
}) {
  const translatedText = result?.translated_text.trim() ?? "";
  const detectedLanguage = result?.detected_language
    ? languageLabel(result.detected_language)
    : null;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3f3f46] dark:bg-[#202025]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-violet-200">
              <Languages className="h-4 w-4" />
              Azure Translator - Text Translation
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-slate-50">
              Text Translation
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Translate plain text with source auto-detection or an explicit
              source language. Credentials stay on the backend.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <TranslationSelect
              id="text-translation-source-language"
              label="Translate from"
              value={sourceLanguage}
              options={sourceLanguages}
              disabled={loading}
              onChange={onSourceLanguageChange}
            />
            <TranslationSelect
              id="text-translation-target-language"
              label="Translate to"
              value={targetLanguage}
              options={targetLanguages}
              disabled={loading}
              onChange={onTargetLanguageChange}
            />
            <Button
              type="button"
              disabled={!configured || loading || !sourceText.trim()}
              onClick={onTranslate}
              className="h-10 rounded-xl"
            >
              {loading ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : null}
              Translate
            </Button>
          </div>
        </div>
        {!configured ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
            Configure FOUNDRY_PROJECT_ENDPOINT or FOUNDRY_TRANSLATOR_ENDPOINT to
            enable this use case. Microsoft Entra ID is used by default;
            FOUNDRY_TRANSLATOR_KEY remains an optional key fallback.
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid min-h-[26rem] flex-1 gap-4 lg:grid-cols-2">
        <section className="flex min-h-[24rem] flex-col rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-[#3f3f46] dark:bg-[#202025]">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-[#3f3f46]">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Source text
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {sourceLanguage === "auto"
                ? detectedLanguage
                  ? `Detected ${detectedLanguage}`
                  : "Auto detect source language"
                : languageLabel(sourceLanguage)}
            </p>
          </div>
          <textarea
            value={sourceText}
            onChange={(event) => onSourceTextChange(event.target.value)}
            placeholder="Enter text to translate..."
            className="min-h-80 flex-1 resize-none rounded-b-3xl bg-transparent p-5 text-base leading-7 text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60 dark:text-slate-50 dark:placeholder:text-slate-500"
            disabled={loading}
          />
        </section>

        <section className="flex min-h-[24rem] flex-col rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-[#3f3f46] dark:bg-[#202025]">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-[#3f3f46]">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Translated text
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {languageLabel(result?.target_language ?? targetLanguage)}
            </p>
          </div>
          <div className="min-h-80 flex-1 whitespace-pre-wrap p-5 text-base leading-7 text-slate-900 dark:text-slate-50">
            {loading ? (
              <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Translating...
              </span>
            ) : translatedText ? (
              translatedText
            ) : (
              <span className="text-slate-400 dark:text-slate-500">
                The translation appears here.
              </span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
