export type TextTranslationLanguage = {
  value: string;
  label: string;
};

export type TextTranslationRequest = {
  text: string;
  source_language: string | null;
  target_language: string;
};

export type TextTranslationItem = {
  language: string;
  text: string;
};

export type TextTranslationResult = {
  source_language?: string | null;
  detected_language?: string | null;
  target_language: string;
  translated_text: string;
  translations: TextTranslationItem[];
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
