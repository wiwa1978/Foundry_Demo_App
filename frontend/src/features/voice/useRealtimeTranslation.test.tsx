import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockAudioWorkletNode,
  MockWebSocket,
  installMediaSessionMocks,
} from "@/test/mediaSessionMocks";

import { realtimeTranslationWebSocketUrl } from "./api";
import { useRealtimeTranslation } from "./useRealtimeTranslation";

const apiMocks = vi.hoisted(() => ({
  realtimeTranslationWebSocketUrl: vi.fn(
    () => "ws://example.test/api/realtime-translation",
  ),
}));

vi.mock("./api", () => ({
  createRealtimeTranslationSession: vi.fn(),
  exchangeRealtimeSdp: vi.fn(),
  realtimeTranslationWebSocketUrl: apiMocks.realtimeTranslationWebSocketUrl,
}));

describe("useRealtimeTranslation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMediaSessionMocks();
  });

  it("shows source transcript events from realtime translation websockets", async () => {
    const { result } = renderHook(() =>
      useRealtimeTranslation({
        defaultTranscriptionModel: "gpt-realtime-whisper",
        transport: "websocket",
      }),
    );

    await act(async () => result.current.start());
    expect(vi.mocked(realtimeTranslationWebSocketUrl)).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptionModel: "gpt-realtime-whisper",
      }),
    );
    const socket = MockWebSocket.instances[0];
    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "ready",
          model: "gpt-realtime-translate",
          transcription_model: "gpt-realtime-whisper",
        }),
      ),
    );
    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "session.input_transcript.delta",
          text: "Good ",
        }),
      ),
    );
    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.delta",
          delta: "morning",
        }),
      ),
    );
    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "session.input_transcript.done",
          text: "Good morning",
        }),
      ),
    );
    act(() =>
      socket.emitMessage(
        JSON.stringify({ type: "transcript.delta", delta: "!" }),
      ),
    );
    act(() =>
      socket.emitMessage(
        JSON.stringify({ type: "translation.delta", delta: "Bonjour" }),
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.sourceTranscript).toBe("Good morning!");
    expect(result.current.translatedTranscript).toBe("Bonjour");
    expect(result.current.transcriptionModel).toBe("gpt-realtime-whisper");

    const microphonePcm = new ArrayBuffer(4);
    act(() =>
      MockAudioWorkletNode.instances[0].port.onmessage?.(
        new MessageEvent("message", { data: microphonePcm }),
      ),
    );
    expect(socket.sent).toContain(microphonePcm);
  });
});
