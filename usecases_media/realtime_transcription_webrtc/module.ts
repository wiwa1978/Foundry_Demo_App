import type { UseCaseModule } from "@/app/types";

export const realtimeTranscriptionWebRtcUseCase: UseCaseModule = {
  id: "realtime_transcription_webrtc",
  title: "Realtime transcription",
  typeLabel: "WebRTC",
  shortTitle: "Transcription · WebRTC",
  description:
    "Stream browser microphone audio directly to gpt-realtime-whisper over WebRTC.",
  badge: "Realtime",
  icon: "voiceWave",
  modalities: ["audio"],
  implementation: [
    "The backend creates a transcription-only session and returns a short-lived Foundry token.",
    "The browser sends its microphone track directly to Foundry over WebRTC.",
    "Transcript deltas and completed turns arrive over the WebRTC data channel.",
  ],
  codeSnippet: {
    title: "Transcription-only WebRTC session",
    language: "python",
    code: [
      "payload = {'session': {",
      "    'type': 'transcription',",
      "    'audio': {'input': {",
      "        'format': {'type': 'audio/pcm', 'rate': 24000},",
      "        'transcription': {'model': 'gpt-realtime-whisper'},",
      "        'turn_detection': {'type': 'server_vad'},",
      "    }}},",
      "}}",
      "# Return an ephemeral token; the browser negotiates WebRTC with Foundry.",
    ].join("\n"),
  },
  workspace: "realtimeTranscriptionWebRtc",
};
