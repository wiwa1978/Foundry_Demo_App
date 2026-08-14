import type { UseCaseModule } from "@/app/types";

export const realtimeTranslationWebRtcUseCase: UseCaseModule = {
  id: "realtime_translation_webrtc",
  title: "GPT Realtime Translation webrtc",
  typeLabel: "Foundry Realtime Translation",
  shortTitle: "GPT Realtime Translation webrtc",
  description:
    "Browser-native speech translation with gpt-realtime-translate: FastAPI requests a Foundry short-lived WebRTC token, then microphone audio flows directly between the browser and Foundry over WebRTC when the service enables that operation.",
  badge: "Audio",
  icon: "voiceWave",
  modalities: ["audio"],
  implementation: [
    "The user selects a deployed gpt-realtime-translate model and target language.",
    "The browser asks FastAPI to create a WebRTC translation session for that deployment.",
    "FastAPI authenticates to Foundry and requests an ephemeral client secret for /openai/v1/realtime/calls.",
    "The browser captures the microphone, creates an SDP offer, and negotiates directly with the Foundry /realtime/calls endpoint.",
    "Foundry returns translated text events through the data channel and translated audio through the WebRTC media track.",
  ],
  codeSnippet: {
    title: "Create a browser-native translation session",
    language: "python",
    code: [
      "payload = {'session': {",
      "    'type': 'realtime',",
      "    'model': 'gpt-realtime-translate',",
      "    'audio': {'output': {'language': 'fr'}},",
      "}}",
      "# FastAPI returns an ephemeral token for /realtime/calls.",
      "# The browser exchanges its SDP offer directly with Foundry.",
    ].join("\n"),
  },
  workspace: "realtimeTranslationWebRtc",
};
