import type { UseCaseModule } from "@/app/types";

export const comparisonUseCase: UseCaseModule = {
  id: "comparison",
  title: "Side by Side - Text Chat",
  shortTitle: "Side by Side - Text Chat",
  description:
    "Send one prompt to multiple deployments and compare responses side by side.",
  badge: "Models",
  icon: "comparison",
  modalities: ["text"],
  implementation: [
    "The sidebar lets the user choose multiple deployment names for the comparison set.",
    "The frontend posts one prompt and the selected model list to `/api/compare`.",
    "The backend runs each model concurrently with its own settings and stores one assistant response per deployment.",
  ],
  codeSnippet: {
    title: "Foundry SDK: run the same prompt across deployments",
    language: "python",
    code: [
      "async def run_model(model: str) -> dict:",
      "    model_settings = get_model_settings(model)",
      "    return await asyncio.to_thread(",
      "        complete_chat,",
      "        model=model,",
      "        prompt=request.prompt,",
      "        api_surface=model_settings.api_surface,",
      "        system_prompt=model_settings.system_prompt,",
      "        temperature=model_settings.temperature,",
      "        top_p=model_settings.top_p,",
      "        max_tokens=model_settings.max_tokens,",
      "        reasoning_effort=request.reasoning_effort,",
      "        history=histories[model],",
      "    )",
      "",
      "results = await asyncio.gather(*(run_model(model) for model in request.models))",
    ].join("\n"),
  },
  workspace: "comparison",
  showComparisonControls: true,
};
