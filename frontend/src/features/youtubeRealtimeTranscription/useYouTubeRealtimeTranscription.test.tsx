import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockWebSocket,
  installMediaSessionMocks,
} from "@/test/mediaSessionMocks";

import { useYouTubeRealtimeTranscription } from "./useYouTubeRealtimeTranscription";

vi.mock("./api", () => ({
  youtubeRealtimeTranscriptionWebSocketUrl: () =>
    "ws://example.test/api/youtube/realtime-transcribe",
}));

describe("useYouTubeRealtimeTranscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMediaSessionMocks();
  });

  it("handles backend status sent before the socket open await resolves", async () => {
    MockWebSocket.mode = "manual";
    const { result } = renderHook(() =>
      useYouTubeRealtimeTranscription({
        models: ["gpt-live-transcribe"],
        defaultModel: "gpt-live-transcribe",
      }),
    );

    act(() =>
      result.current.setUrl("https://www.youtube.com/watch?v=7QfEn47HzQM"),
    );
    let startPromise: Promise<void> | undefined;
    act(() => {
      startPromise = result.current.start();
    });
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1));
    const socket = MockWebSocket.instances[0];

    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "youtube.status",
          status: "Downloading YouTube audio...",
        }),
      ),
    );
    expect(result.current.statusMessage).toBe("Downloading YouTube audio...");

    act(() => socket.open());
    await act(async () => startPromise);
    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "ready",
          model: "gpt-live-transcribe",
          video_id: "7QfEn47HzQM",
        }),
      ),
    );

    expect(result.current.status).toBe("live");
    expect(result.current.videoId).toBe("7QfEn47HzQM");
  });

  it("does not timeout when the socket opens before the open waiter is attached", async () => {
    MockWebSocket.mode = "sync-open";
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useYouTubeRealtimeTranscription({
        models: ["gpt-live-transcribe"],
        defaultModel: "gpt-live-transcribe",
      }),
    );

    act(() =>
      result.current.setUrl("https://www.youtube.com/watch?v=7QfEn47HzQM"),
    );
    await act(async () => result.current.start());
    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(result.current.error).toBe("");
    expect(MockWebSocket.instances[0].readyState).toBe(MockWebSocket.OPEN);

    vi.useRealTimers();
  });

  it("renders completed transcription event variants", async () => {
    const { result } = renderHook(() =>
      useYouTubeRealtimeTranscription({
        models: ["gpt-live-transcribe"],
        defaultModel: "gpt-live-transcribe",
      }),
    );

    act(() =>
      result.current.setUrl("https://www.youtube.com/watch?v=7QfEn47HzQM"),
    );
    await act(async () => result.current.start());
    act(() =>
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({
          type: "ready",
          model: "gpt-live-transcribe",
          video_id: "7QfEn47HzQM",
        }),
      ),
    );

    act(() =>
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({
          type: "response.text.done",
          text: "First segment.",
          sequence: 1,
        }),
      ),
    );
    act(() =>
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          item_id: "item-2",
          transcript: "Second segment.",
          sequence: 2,
        }),
      ),
    );

    expect(result.current.transcript).toBe("First segment. Second segment.");
  });

  it("reports provider errors instead of staying stuck on starting", async () => {
    const { result } = renderHook(() =>
      useYouTubeRealtimeTranscription({
        models: ["gpt-live-transcribe"],
        defaultModel: "gpt-live-transcribe",
      }),
    );

    act(() =>
      result.current.setUrl("https://www.youtube.com/watch?v=7QfEn47HzQM"),
    );
    await act(async () => result.current.start());
    act(() =>
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({ type: "error", error: { message: "blocked" } }),
      ),
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("blocked");
  });
});
