import type { PromptExample } from "@/components/PromptExamples";

export const imageToImagePrompts: readonly PromptExample[] = [
  {
    id: "watercolor-restyle",
    title: "Watercolor restyle",
    prompt:
      "Transform the source image into a delicate watercolor illustration. Preserve the original composition, subjects, poses, and recognizable details. Use layered translucent washes, subtle paper texture, soft edges, and a restrained natural palette.",
    description: "Change the medium while preserving composition and identity.",
  },
  {
    id: "golden-hour",
    title: "Golden hour",
    prompt:
      "Keep every subject and object in the same position, but relight the scene at golden hour. Add warm low-angle sunlight, long soft shadows, gentle rim lighting, and a realistic amber sky. Preserve the original photographic style.",
    description: "Relight a scene without changing its content.",
  },
  {
    id: "studio-background",
    title: "Studio background",
    prompt:
      "Replace only the background with a clean warm-gray photography studio and a subtle floor shadow. Preserve the main subject exactly, including shape, colors, materials, logos, and fine details. Produce a polished commercial product photograph.",
    description: "Replace a background while protecting the main subject.",
  },
  {
    id: "interior-refresh",
    title: "Interior refresh",
    prompt:
      "Redesign this room in a warm contemporary style while preserving the architecture, camera angle, windows, and room dimensions. Introduce light oak, textured neutral fabrics, a few sculptural lamps, and restrained greenery with photorealistic lighting.",
    description: "Explore a design variation grounded in the source room.",
  },
];
