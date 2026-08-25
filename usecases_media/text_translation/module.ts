import type { UseCaseModule } from "@/app/types";

export const textTranslationUseCase: UseCaseModule = {
  id: "text_translation",
  title: "Azure Translator",
  shortTitle: "Detecting language and translating...",
  description:
    "Detect the source language and translate text with Azure Translator in a single workspace.",
  badge: "Text",
  typeLabel: "Detection + Translation",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "The workspace uses a mode selector to switch between Text and Document Translation workflows.",
    "For text mode, the browser sends source text, source language or auto-detect, and target language to an authenticated FastAPI endpoint; the result includes the detected source language alongside the translation.",
    "The backend derives the Translator resource endpoint from the Foundry project endpoint, then authenticates with Microsoft Entra ID or an optional Translator key.",
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
