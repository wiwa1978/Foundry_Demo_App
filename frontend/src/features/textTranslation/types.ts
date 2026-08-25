import type { UseCaseId } from "@/app/types";

export type TextTranslationLanguage = {
  value: string;
  label: string;
};

export type TextTranslationRequest = {
  text: string;
  source_language: string | null;
  target_language: string;
  model?: string;
  mode?: LanguageServiceMode;
};

export type TextTranslationItem = {
  language: string;
  text: string;
};

export type TextTranslationResult = {
  source_language?: string | null;
  detected_language?: string | null;
  detected_confidence?: number | null;
  target_language: string;
  translated_text: string;
  translations: TextTranslationItem[];
  engine?: string;
  mode?: LanguageServiceMode;
  analysis?: Record<string, unknown>;
};

export const AZURE_MT_ENGINE = "azure-mt";

export type TranslationModelOption = {
  value: string;
  label: string;
};

export const azureMtModelOption: TranslationModelOption = {
  value: AZURE_MT_ENGINE,
  label: "Azure-MT",
};

export const languageServiceUseCases = [
  "text_translation",
  "language_detection",
  "pii_redaction",
  "text_analytics_health",
] as const;

export type LanguageServiceUseCaseId = (typeof languageServiceUseCases)[number];

export function isLanguageServiceUseCase(
  value: UseCaseId,
): value is LanguageServiceUseCaseId {
  return (languageServiceUseCases as readonly string[]).includes(value);
}

export type LanguageServiceMode =
  | "translator_text"
  | "translator_document"
  | "language_detection_text"
  | "pii_text"
  | "pii_document"
  | "pii_conversation"
  | "health_text";

export type LanguageServiceModeOption = {
  value: LanguageServiceMode;
  label: string;
  implemented: boolean;
};

export const modeOptionsByUseCase: Record<
  LanguageServiceUseCaseId,
  readonly LanguageServiceModeOption[]
> = {
  text_translation: [
    { value: "translator_text", label: "Text Translation", implemented: true },
    {
      value: "translator_document",
      label: "Document Translation",
      implemented: false,
    },
  ],
  language_detection: [
    {
      value: "language_detection_text",
      label: "Language Detection",
      implemented: true,
    },
  ],
  pii_redaction: [
    { value: "pii_text", label: "Text PII Redaction", implemented: true },
    {
      value: "pii_document",
      label: "Document PII Redaction",
      implemented: false,
    },
    {
      value: "pii_conversation",
      label: "Conversational PII Redaction",
      implemented: true,
    },
  ],
  text_analytics_health: [
    {
      value: "health_text",
      label: "Text Analytics for Health",
      implemented: true,
    },
  ],
};

export const defaultModeByUseCase: Record<
  LanguageServiceUseCaseId,
  LanguageServiceMode
> = {
  text_translation: "translator_text",
  language_detection: "language_detection_text",
  pii_redaction: "pii_text",
  text_analytics_health: "health_text",
};

export const sourceLanguages: TextTranslationLanguage[] = [
  { value: "auto", label: "Auto detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "nl", label: "Dutch" },
  { value: "it", label: "Italian" },
  { value: "pt", label: "Portuguese" },
  { value: "zh-Hans", label: "Chinese Simplified" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
];

export const targetLanguages: TextTranslationLanguage[] =
  sourceLanguages.filter((language) => language.value !== "auto");

export function languageLabel(value: string | null | undefined) {
  return (
    sourceLanguages.find(
      (language) =>
        language.value.toLowerCase() === (value ?? "").toLowerCase(),
    )?.label ?? value
  );
}
