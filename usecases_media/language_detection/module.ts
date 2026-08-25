import type { UseCaseModule } from "@/app/types";

export const languageDetectionUseCase: UseCaseModule = {
  id: "language_detection",
  title: "Azure Language",
  shortTitle: "Language Detection",
  description:
    "Detect the source language of input text using Azure Language. Use the mode selector in the workspace to run language-specific analysis flows.",
  badge: "Text",
  typeLabel: "Language Detection",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "The workspace shares the same Language Services controls used for translation and text analytics workflows.",
    "Language detection mode is selected from the in-workspace mode dropdown.",
    "No chat model is used; requests are handled by Azure AI Language/Translator service endpoints.",
  ],
  codeSnippet: {
    title: "Azure Language - Language Detection",
    language: "python",
    code: [
      "body = {",
      "    'kind': 'LanguageDetection',",
      "    'analysisInput': {'documents': [{'id': '1', 'text': text}]},",
      "}",
      "response = requests.post(language_url, headers=headers, json=body)",
      "response.raise_for_status()",
    ].join("\n"),
  },
  workspace: "textTranslation",
};
