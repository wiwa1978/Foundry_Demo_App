import type { UseCaseModule } from "@/app/types";

export const piiRedactionUseCase: UseCaseModule = {
  id: "pii_redaction",
  title: "Azure Language",
  shortTitle: "PII Redaction",
  description:
    "Redact personally identifiable information with Azure Language. Select Text, Document, or Conversational PII mode from the workspace dropdown.",
  badge: "Text",
  typeLabel: "PII Redaction",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "The workspace exposes a mode selector for Text PII, Document PII, and Conversational PII workflows.",
    "Text mode reuses the same language controls and output panel structure as translation.",
    "No chat model is used; requests are routed to Azure Language service endpoints.",
  ],
  codeSnippet: {
    title: "Azure Language - Text PII Redaction",
    language: "python",
    code: [
      "body = {",
      "    'kind': 'PiiEntityRecognition',",
      "    'analysisInput': {'documents': [{'id': '1', 'text': text}]},",
      "}",
      "response = requests.post(language_url, headers=headers, json=body)",
      "response.raise_for_status()",
    ].join("\n"),
  },
  workspace: "textTranslation",
};
