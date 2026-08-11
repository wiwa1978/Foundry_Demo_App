import type { UseCaseModule } from "@/app/types";

export const imageComparisonUseCase: UseCaseModule = {
  id: "image_comparison",
  title: "Side by Side - Text Image",
  shortTitle: "Side by Side - Text Image",
  description:
    "Send one prompt to two image deployments and compare their generated pictures side by side.",
  badge: "Image models",
  icon: "comparison",
  modalities: ["image"],
  implementation: [
    "The sidebar lets the user select two image-capable deployment names.",
    "The frontend sends the same prompt and dimensions to both deployments concurrently through `/api/images/generate`.",
    "Each result is rendered in its own synchronized pane for direct visual comparison and download.",
  ],
  codeSnippet: {
    title: "Generate the same image with two deployments",
    language: "typescript",
    code: [
      "const results = await Promise.all(",
      "  models.map((model) =>",
      "    fetch('/api/images/generate', {",
      "      method: 'POST',",
      "      headers: { 'Content-Type': 'application/json' },",
      "      body: JSON.stringify({ model, prompt, width, height }),",
      "    }),",
      "  ),",
      ");",
    ].join("\n"),
  },
  workspace: "imageComparison",
  showImageComparisonControls: true,
};
