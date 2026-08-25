import type { UseCaseModule } from "@/app/types";

export const contentExtractorUseCase: UseCaseModule = {
  id: "content_extractor",
  title: "Content Extractor",
  shortTitle: "Content Extractor",
  description:
    "Extract structured text and fields from images, documents, and audio with Azure Content Understanding prebuilt analyzers (image search, document layout, invoice, tax (US), document fields, OCR read, and call center).",
  badge: "Text",
  typeLabel: "Content Understanding",
  icon: "documents",
  modalities: ["text", "image", "audio"],
  implementation: [
    "The browser lets the user choose a content type (image, document, or audio) and, for documents, an analyzer (layout, invoice, tax (US), fields, or OCR read).",
    "The backend sends the uploaded file as base64 data to the matching Azure Content Understanding prebuilt analyzer (prebuilt-imageSearch, prebuilt-layout/invoice/tax.us/documentFields/read, or prebuilt-callCenter).",
    "The backend polls the Content Understanding operation and returns the extracted markdown and structured fields without exposing credentials.",
  ],
  codeSnippet: {
    title: "Azure Content Understanding analysis",
    language: "python",
    code: [
      "body = {",
      "    'inputs': [{",
      "        'name': filename,",
      "        'mimeType': mime_type,",
      "        'data': base64.b64encode(file_bytes).decode('ascii'),",
      "    }]",
      "}",
      "# analyzer_id varies by mode, e.g. prebuilt-imageSearch, prebuilt-invoice,",
      "# prebuilt-tax.us, prebuilt-documentFields, prebuilt-read, prebuilt-callCenter",
      "response = requests.post(",
      "    f'{endpoint}/contentunderstanding/analyzers/{analyzer_id}:analyze',",
      "    params={'api-version': '2025-11-01'},",
      "    headers={'Authorization': f'Bearer {token}'},",
      "    json=body,",
      ")",
      "operation_location = response.headers['Operation-Location']",
    ].join("\n"),
  },
  workspace: "contentExtractor",
};
