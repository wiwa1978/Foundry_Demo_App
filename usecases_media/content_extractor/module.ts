import type { UseCaseModule } from "@/app/types";

export const contentExtractorUseCase: UseCaseModule = {
  id: "content_extractor",
  title: "Content Extractor",
  shortTitle: "Content Extractor",
  description:
    "Extract structured text from images with Azure Content Understanding. Document and audio inputs are reserved for the next phase.",
  badge: "Text",
  typeLabel: "Content Understanding",
  icon: "documents",
  modalities: ["text", "image", "audio"],
  implementation: [
    "The browser lets the user choose a content type and upload a file; the first enabled path is image extraction.",
    "The backend sends the uploaded image as base64 data to Azure Content Understanding prebuilt-imageSearch.",
    "The backend polls the Content Understanding operation and returns the extracted markdown and fields without exposing credentials.",
  ],
  codeSnippet: {
    title: "Azure Content Understanding image analysis",
    language: "python",
    code: [
      "body = {",
      "    'inputs': [{",
      "        'name': filename,",
      "        'mimeType': mime_type,",
      "        'data': base64.b64encode(image_bytes).decode('ascii'),",
      "    }]",
      "}",
      "response = requests.post(",
      "    f'{endpoint}/contentunderstanding/analyzers/prebuilt-imageSearch:analyze',",
      "    params={'api-version': '2025-11-01'},",
      "    headers={'Authorization': f'Bearer {token}'},",
      "    json=body,",
      ")",
      "operation_location = response.headers['Operation-Location']",
    ].join("\n"),
  },
  workspace: "contentExtractor",
};
