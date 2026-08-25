import type { UseCaseModule } from "@/app/types";

export const textAnalyticsForHealthUseCase: UseCaseModule = {
  id: "text_analytics_health",
  title: "Azure Language",
  shortTitle: "Text Analytics for Health",
  description:
    "Extract healthcare insights from clinical text with Azure Language Text Analytics for Health.",
  badge: "Text",
  typeLabel: "Text Analytics for Health",
  icon: "chat",
  modalities: ["text"],
  implementation: [
    "Uses the shared Language Services workspace with a focused healthcare analysis mode.",
    "Inputs and results remain in the dedicated non-chat analysis workflow.",
    "No chat model is used; requests are routed to Azure Language service endpoints.",
  ],
  codeSnippet: {
    title: "Azure Language - Text Analytics for Health",
    language: "python",
    code: [
      "body = {",
      "    'kind': 'Healthcare',",
      "    'analysisInput': {'documents': [{'id': '1', 'text': text}]},",
      "}",
      "response = requests.post(language_url, headers=headers, json=body)",
      "response.raise_for_status()",
    ].join("\n"),
  },
  workspace: "textTranslation",
};
