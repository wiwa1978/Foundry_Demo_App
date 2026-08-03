import type { UseCaseModule } from "@/app/types";

export const textChatUseCase: UseCaseModule = {
  id: "text_chat",
  title: "Text Chat",
  shortTitle: "Text chat",
  description: "A clean single-model Foundry chat experience with only the controls needed to chat.",
  badge: "Default",
  icon: "chat",
  implementation: [
    "The browser submits the prompt to the FastAPI backend with the selected deployment and optional reasoning effort.",
    "The backend builds conversation history for the selected model and streams the request to Foundry using the model's saved API surface.",
    "Server-sent events return Foundry request traces, response deltas, and the final saved assistant message.",
  ],
  codeSnippet: {
    title: "Foundry SDK: streaming text response",
    language: "python",
    code: [
      "with _create_openai_client(settings) as openai_client:",
      "    if api_surface == 'chat_completions':",
      "        request = foundry_request['payload']",
      "        stream = openai_client.chat.completions.create(**request, stream=True)",
      "        for event in stream:",
      "            delta = getattr(event.choices[0].delta, 'content', None)",
      "            if delta:",
      "                yield {'type': 'delta', 'delta': delta}",
      "",
      "    elif api_surface == 'responses':",
      "        request = foundry_request['payload']",
      "        stream = openai_client.responses.create(**request, stream=True)",
      "        for event in stream:",
      "            if getattr(event, 'type', '') == 'response.output_text.delta':",
      "                yield {'type': 'delta', 'delta': getattr(event, 'delta', '')}",
    ].join("\n"),
  },
  workspace: "chat",
  showChatComposer: true,
};
