import type { UseCaseModule } from "@/app/types";

export const reasoningComparisonUseCase: UseCaseModule = {
  id: "reasoning_comparison",
  title: "Reasoning Arena",
  shortTitle: "Reasoning Arena",
  description:
    "Compare reasoning-capable deployments side by side on multi-step math, logic, and debugging tasks while tracking latency and app-recorded usage.",
  badge: "Text",
  typeLabel: "Reasoning",
  icon: "comparison",
  modalities: ["text"],
  implementation: [
    "The use case reuses the side-by-side text comparison workspace with reasoning effort controls enabled.",
    "The frontend sends the same prompt, selected deployments, and reasoning effort to `/api/compare`.",
    "The backend runs each deployment concurrently, persists app-recorded usage, and streams results into side-by-side panes.",
  ],
  codeSnippet: {
    title: "Foundry SDK: compare reasoning-capable deployments",
    language: "python",
    code: [
      "async def run_reasoning_model(model: str) -> dict:",
      "    model_settings = get_model_settings(model)",
      "    return await asyncio.to_thread(",
      "        complete_chat,",
      "        model=model,",
      "        prompt=request.prompt,",
      "        api_surface=model_settings.api_surface,",
      "        system_prompt=model_settings.system_prompt,",
      "        max_tokens=model_settings.max_tokens,",
      "        reasoning_effort=request.reasoning_effort or 'high',",
      "        history=histories[model],",
      "    )",
      "",
      "results = await asyncio.gather(*(run_reasoning_model(model) for model in request.models))",
    ].join("\n"),
  },
  workspace: "comparison",
  showComparisonControls: true,
};
