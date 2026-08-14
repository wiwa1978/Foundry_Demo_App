import type { UseCaseModule } from "@/app/types";

export const browserVoiceUseCase: UseCaseModule = {
  id: "browser_voice",
  title: "Browser based Voice",
  shortTitle: "Browser based Voice",
  description:
    "Use browser dictation and readback around the normal text chat flow.",
  badge: "Audio",
  icon: "browserVoice",
  modalities: ["audio"],
  implementation: [
    "The browser Web Speech API listens to microphone input and appends final transcript text to the normal prompt box.",
    "The prompt is still sent as text to the selected Foundry chat deployment.",
    "Optional browser speech synthesis reads the assistant's text response aloud; no Foundry audio model is used in this mode.",
  ],
  codeSnippet: {
    title: "Foundry SDK: browser voice still calls the text model",
    language: "python",
    code: [
      "foundry_request = build_foundry_request_trace(",
      "    model=model,",
      "    prompt=browser_transcript,",
      "    api_surface=api_surface,",
      "    system_prompt=system_prompt,",
      "    temperature=temperature,",
      "    top_p=top_p,",
      "    max_tokens=max_tokens,",
      "    history=history,",
      ")",
      "",
      "with _create_openai_client(settings) as openai_client:",
      "    request = foundry_request['payload']",
      "    response = openai_client.responses.create(**request)",
      "    assistant_text = getattr(response, 'output_text', '') or ''",
    ].join("\n"),
  },
  workspace: "chat",
  showBrowserVoiceControls: true,
  showChatComposer: true,
  enableComposerDictation: true,
};
