import type { UseCaseModule } from "@/app/types";

export const textTranslationUseCase: UseCaseModule = {
  id: "text_translation",
  title: "Text Translation",
  shortTitle: "Text Translation",
  description:
    "Translate source text into another language with Azure Translator - Text Translation on an Azure AI Foundry resource.",
  badge: "Text",
  typeLabel: "Azure Translator",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "The browser sends source text, source language or auto-detect, and target language to an authenticated FastAPI endpoint.",
    "The backend derives the Translator resource endpoint from the Foundry project endpoint, then authenticates with Microsoft Entra ID or an optional Translator key.",
    "The response returns the detected source language when available and renders the translated text in a side-by-side workspace.",
  ],
  codeSnippet: {
    title: "Azure Translator - Text Translation",
    language: "python",
    code: [
      "headers = {",
      "    'Ocp-Apim-Subscription-Key': subscription_key,",
      "    'Content-Type': 'application/json',",
      "}",
      "url = f'{endpoint}/translator/text/translate?api-version=2025-10-01-preview'",
      "body = {",
      "    'inputs': [{",
      "        'Text': text,",
      "        'language': source_language,",
      "        'targets': [{'language': target_language}],",
      "    }]",
      "}",
      "response = requests.post(url, headers=headers, json=body)",
      "response.raise_for_status()",
    ].join("\n"),
  },
  workspace: "textTranslation",
};
