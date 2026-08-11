import type { UseCaseModule } from "@/app/types";

export const realtimeTranslationWebSocketUseCase: UseCaseModule = {
  id: "realtime_translation_websocket",
  title: "Realtime translation",
  typeLabel: "WebSockets",
  shortTitle: "Translation · GPT Realtime",
  description:
    "Translate live speech into streamed text and audio with gpt-realtime-translate.",
  badge: "GPT Realtime",
  icon: "voiceWave",
  modalities: ["audio"],
  implementation: [
    "An AudioWorklet sends continuous 24 kHz PCM16, including silence, through the application WebSocket.",
    "FastAPI authenticates to the dedicated Foundry Realtime Translation endpoint using gpt-realtime-translate and gpt-realtime-whisper.",
    "Source text, translated text, and translated PCM audio stream back while the speaker is talking.",
  ],
  codeSnippet: {
    title: "Dedicated realtime translation session",
    language: "python",
    code: [
      "url = f'{endpoint}/realtime/translations?model=gpt-realtime-translate'",
      "session_update = {",
      "    'type': 'session.update',",
      "    'session': {'audio': {",
      "        'input': {'transcription': {'model': 'gpt-realtime-whisper'}},",
      "        'output': {'language': 'fr'},",
      "    }},",
      "}",
      "# Append continuous PCM with session.input_audio_buffer.append.",
    ].join("\n"),
  },
  workspace: "realtimeTranslationWebSocket",
};
