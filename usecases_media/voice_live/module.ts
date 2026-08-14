import type { UseCaseModule } from "@/app/types";

export const voiceLiveUseCase: UseCaseModule = {
  id: "voice_live",
  title: "Voice Live travel Concierge",
  shortTitle: "Voice Live travel Concierge",
  description:
    "Plan a trip naturally with multilingual turn detection, noise suppression, barge-in, and an Azure HD voice.",
  badge: "Audio",
  icon: "voiceWave",
  modalities: ["audio"],
  implementation: [
    "The browser streams microphone and response audio over WebRTC while the backend proxies the authenticated Voice Live control WebSocket.",
    "Voice Live combines the conversational model with Azure semantic VAD, deep noise suppression, server echo cancellation, and an Azure Speech HD voice.",
    "The travel concierge tolerates pauses, lets the traveler interrupt naturally, and can switch language without a separate STT -> chat -> TTS pipeline.",
  ],
  codeSnippet: {
    title: "Voice Live: configure the concierge session",
    language: "javascript",
    code: [
      "signalWs.send(JSON.stringify({",
      "  type: 'rtc.call.sdp.create',",
      "  sdp_offer: pc.localDescription.sdp,",
      "  session: {",
      "    modalities: ['text', 'audio'],",
      "    instructions: TRAVEL_CONCIERGE_INSTRUCTIONS,",
      "    voice: {",
      "      type: 'azure-standard',",
      "      name: 'en-US-Ava:DragonHDLatestNeural',",
      "      temperature: 0.8,",
      "    },",
      "    turn_detection: {",
      "      type: 'azure_semantic_vad_multilingual',",
      "      remove_filler_words: true,",
      "      interrupt_response: true,",
      "    },",
      "    input_audio_noise_reduction: { type: 'azure_deep_noise_suppression' },",
      "    input_audio_echo_cancellation: { type: 'server_echo_cancellation' },",
      "  },",
      "}));",
    ].join("\n"),
  },
  workspace: "voiceLive",
};
