import type { UseCaseModule } from "@/app/types";

export const realtimeTranscriptionWebSocketUseCase: UseCaseModule = {
  id: "realtime_transcription_websocket",
  title: "Realtime Transcription websockets",
  typeLabel: "Realtime Transcription",
  shortTitle: "Realtime Transcription websockets",
  description:
    "Backend-mediated transcription: the browser sends PCM audio to FastAPI, which keeps the Foundry WebSocket and credentials server-side and controls audio commits.",
  badge: "Audio",
  icon: "voiceWave",
  modalities: ["audio"],
  implementation: [
    "An AudioWorklet converts browser microphone audio to 24 kHz PCM16 chunks.",
    "The browser sends PCM over an application WebSocket; FastAPI authenticates and proxies it to Foundry.",
    "The backend filters Foundry events and returns transcript deltas and completed turns.",
  ],
  codeSnippet: {
    title: "Proxy PCM to Foundry Realtime",
    language: "python",
    code: [
      "async with websockets.connect(realtime_url, headers=auth) as upstream:",
      "    await upstream.send(json.dumps(session_update))",
      "    audio = await browser.receive_bytes()",
      "    await upstream.send(json.dumps({",
      "        'type': 'input_audio_buffer.append',",
      "        'audio': base64.b64encode(audio).decode('ascii'),",
      "    }))",
    ].join("\n"),
  },
  workspace: "realtimeTranscriptionWebSocket",
};
