import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockAudioWorkletNode,
  MockPeerConnection,
  MockWebSocket,
  installMediaSessionMocks,
} from "@/test/mediaSessionMocks";

import { useRealtimeTranscription } from "./useRealtimeTranscription";

vi.mock("./api", () => ({
  createRealtimeTranscriptionSession: vi.fn(() =>
    Promise.resolve({
      token: "session-token",
      webrtc_url: "https://example.test/realtime/calls",
      model: "gpt-live-transcribe",
    }),
  ),
  exchangeRealtimeSdp: vi.fn(() => Promise.resolve("mock-answer")),
  realtimeTranscriptionWebSocketUrl: vi.fn(() =>
    "ws://example.test/api/realtime-transcription",
  ),
}));

describe("useRealtimeTranscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMediaSessionMocks();
  });

  it("renders WebRTC transcription deltas immediately", async () => {
    const { result } = renderHook(() =>
      useRealtimeTranscription({
        fetchClient: vi.fn(),
        transport: "webrtc",
        models: ["gpt-live-transcribe"],
        defaultModel: "gpt-live-transcribe",
      }),
    );

    await act(async () => result.current.start());
    const dataChannel = MockPeerConnection.instances[0].dataChannel;
    act(() => dataChannel.open());
    act(() =>
      dataChannel.emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.delta",
          item_id: "item-1",
          sequence: 1,
          delta: "Hel",
        }),
      ),
    );

    expect(result.current.transcript).toBe("Hel");

    act(() =>
      dataChannel.emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          item_id: "item-1",
          sequence: 1,
          transcript: "Hello",
        }),
      ),
    );

    expect(result.current.transcript).toBe("Hello");
  });

  it("renders WebSocket transcription deltas immediately", async () => {
    const { result } = renderHook(() =>
      useRealtimeTranscription({
        fetchClient: vi.fn(),
        transport: "websocket",
        models: ["gpt-live-transcribe"],
        defaultModel: "gpt-live-transcribe",
      }),
    );

    await act(async () => result.current.start());
    const socket = MockWebSocket.instances[0];
    act(() =>
      socket.emitMessage(
        JSON.stringify({ type: "ready", model: "gpt-live-transcribe" }),
      ),
    );
    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.delta",
          item_id: "item-1",
          sequence: 1,
          delta: "Goed",
        }),
      ),
    );

    expect(result.current.transcript).toBe("Goed");

    const microphonePcm = new ArrayBuffer(4);
    act(() =>
      MockAudioWorkletNode.instances[0].port.onmessage?.(
        new MessageEvent("message", { data: microphonePcm }),
      ),
    );
    expect(socket.sent).toContain(microphonePcm);
  });
});
