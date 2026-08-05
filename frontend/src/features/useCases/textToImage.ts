import type { UseCaseModule } from "@/app/types";

export const textToImageUseCase: UseCaseModule = {
  id: "text_to_image",
  title: "Text to Image",
  shortTitle: "Text-Image",
  description: "Turn a detailed text prompt into a high-quality PNG with an MAI image deployment.",
  badge: "Foundry image",
  icon: "image",
  modalities: ["image"],
  implementation: [
    "The browser sends the prompt, dimensions, and selected image deployment to the FastAPI backend.",
    "The backend obtains a Microsoft Entra ID token and calls the dedicated MAI image generations API.",
    "The generated base64 PNG is returned for preview and download without exposing Foundry credentials.",
  ],
  codeSnippet: {
    title: "MAI image generations API with Entra ID",
    language: "python",
    code: [
      "token = credential.get_token(",
      "    'https://cognitiveservices.azure.com/.default'",
      ").token",
      "response = requests.post(",
      "    f'{endpoint}/mai/v1/images/generations',",
      "    headers={'Authorization': f'Bearer {token}'},",
      "    json={",
      "        'model': deployment_name,",
      "        'prompt': prompt,",
      "        'width': 1024,",
      "        'height': 1024,",
      "    },",
      ")",
      "response.raise_for_status()",
    ].join("\n"),
  },
  workspace: "image",
};
