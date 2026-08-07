import type { UseCaseModule } from "@/app/types";

export const imageToImageUseCase: UseCaseModule = {
  id: "image_to_image",
  title: "Image to Image",
  shortTitle: "Image-Image",
  description:
    "Transform an uploaded image with a prompt while preserving the parts that matter.",
  badge: "Foundry image",
  icon: "image",
  modalities: ["image"],
  implementation: [
    "The browser sends a source image, transformation prompt, output size, and compatible image deployment as multipart form data.",
    "The backend obtains a Microsoft Entra ID token and calls the OpenAI-compatible image edits API.",
    "Compatible gpt-image deployments are reused, while generation-only image deployments are excluded.",
  ],
  codeSnippet: {
    title: "Image edit with an existing deployment",
    language: "python",
    code: [
      "result = client.images.edit(",
      "    model=deployment_name,",
      "    image=open('source.png', 'rb'),",
      "    prompt='Turn this into a watercolor illustration',",
      "    size='1024x1024',",
      ")",
    ].join("\n"),
  },
  workspace: "imageEdit",
};
