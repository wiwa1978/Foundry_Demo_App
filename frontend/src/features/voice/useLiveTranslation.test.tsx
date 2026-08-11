import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockAudioContext,
  MockAudioWorkletNode,
  MockMediaStream,
  MockWebSocket,
  installMediaSessionMocks,
} from "@/test/mediaSessionMocks";

import { useLiveTranslation } from "./useLiveTranslation";

vi.mock("./api", () => ({
  liveInterpreterUrl: () => "ws://example.test/api/live-interpreter",
}));

describe("useLiveTranslation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMediaSessionMocks();
  });

  it("starts with the selected language, handles translations and PCM, then ignores stale events", async () => {
    const { result } = renderHook(() => useLiveTranslation());
    act(() => result.current.setTargetLanguage("nl"));

    await act(async () => result.current.start());
    const firstSocket = MockWebSocket.instances[0];
    act(() =>
      firstSocket.emitMessage(
        JSON.stringify({
          type: "translation",
          text: "Goedemorgen",
          detected_language: "en",
        }),
      ),
    );
    act(() =>
      firstSocket.emitMessage(
        JSON.stringify({
          type: "translation",
          text: "Welkom",
        }),
      ),
    );
    act(() =>
      firstSocket.emitMessage(
        JSON.stringify({
          type: "translation",
          text: "   ",
        }),
      ),
    );
    const pcm = new Int16Array([0, 16384, -16384]).buffer;
    act(() => firstSocket.emitMessage(pcm));

    expect(result.current.status).toBe("live");
    expect(result.current.transcript.map((entry) => entry.text)).toEqual([
      "Goedemorgen · detected en",
      "Welkom",
    ]);
    const startMessage = JSON.parse(String(firstSocket.sent[0])) as {
      mode: string;
      source_language: string;
      target_language: string;
    };
    expect(startMessage.mode).toBe("standard");
    expect(startMessage.source_language).toBe("en-US");
    expect(startMessage.target_language).toBe("nl");
    const firstContext = MockAudioContext.instances[0];
    expect(firstContext.bufferSources[0].start).toHaveBeenCalledWith(1);
    const worklet = MockAudioWorkletNode.instances[0];
    const microphonePcm = new ArrayBuffer(4);
    act(() =>
      worklet.port.onmessage?.(
        new MessageEvent("message", { data: microphonePcm }),
      ),
    );
    expect(firstSocket.sent).toContain(microphonePcm);

    act(() => result.current.stop());
    expect(firstSocket.sent).toContain(JSON.stringify({ type: "stop" }));
    expect(firstContext.bufferSources[0].stop).toHaveBeenCalledOnce();
    expect(firstContext.close).toHaveBeenCalledOnce();
    const sentAfterStop = firstSocket.sent.length;
    act(() =>
      worklet.port.onmessage?.(
        new MessageEvent("message", { data: microphonePcm }),
      ),
    );
    expect(firstSocket.sent).toHaveLength(sentAfterStop);
    act(() => firstContext.bufferSources[0].onended?.());

    await act(async () => result.current.start());
    act(() =>
      firstSocket.emitMessage(
        JSON.stringify({
          type: "translation",
          text: "stale translation",
        }),
      ),
    );
    expect(result.current.transcript).toEqual([]);
    expect(MockAudioWorkletNode.instances).toHaveLength(2);
  });

  it("cleans up when the interpreter socket closes after becoming ready", async () => {
    const { result } = renderHook(() => useLiveTranslation());

    await act(async () => result.current.start());
    act(() => MockWebSocket.instances[0].close());

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Live Interpreter connection closed.");
  });

  it("reports when the provider stops the interpreter session", async () => {
    const { result } = renderHook(() => useLiveTranslation());

    await act(async () => result.current.start());
    act(() =>
      MockWebSocket.instances[0].emitMessage(
        JSON.stringify({ type: "session_stopped" }),
      ),
    );

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toContain("stopped listening");
  });

  it("cleans up provider errors and reports unsupported browsers", async () => {
    const media = installMediaSessionMocks();
    const { result } = renderHook(() => useLiveTranslation());

    await act(async () => result.current.start());
    act(() =>
      MockWebSocket.instances[0].emitMessage(JSON.stringify({ type: "error" })),
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Live Interpreter reported an error.");
    expect(media.streams[0].track.stop).toHaveBeenCalledOnce();

    vi.stubGlobal("navigator", { mediaDevices: {} });
    await act(async () => result.current.start());
    expect(result.current.error).toBe(
      "This browser does not support the audio APIs required for live translation.",
    );
  });

  it("cleans up a failed socket and an active session on unmount", async () => {
    const media = installMediaSessionMocks();
    MockWebSocket.mode = "open-error";
    const { result, unmount } = renderHook(() => useLiveTranslation());

    await act(async () => result.current.start());
    expect(result.current.error).toBe("Live Interpreter connection failed.");
    expect(result.current.status).toBe("idle");
    expect(media.streams[0].track.stop).toHaveBeenCalledOnce();
    expect(MockAudioContext.instances[0].close).toHaveBeenCalledOnce();

    MockWebSocket.mode = "success";
    await act(async () => result.current.start());
    await waitFor(() => expect(MockAudioWorkletNode.instances).toHaveLength(2));
    unmount();
    expect(media.streams[1].track.stop).toHaveBeenCalledOnce();
    expect(MockAudioWorkletNode.instances[1].disconnect).toHaveBeenCalledOnce();
    expect(MockAudioContext.instances[1].close).toHaveBeenCalledOnce();
  });

  it("stops a stale microphone stream that resolves after stop", async () => {
    const media = installMediaSessionMocks();
    const stream = new MockMediaStream();
    let resolveMedia: (stream: MediaStream) => void = () => undefined;
    media.getUserMedia.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMedia = resolve;
      }),
    );
    const { result } = renderHook(() => useLiveTranslation());
    let startPromise: Promise<void> | undefined;

    act(() => {
      startPromise = result.current.start();
    });
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledOnce());
    act(() => result.current.stop());
    await act(async () => {
      resolveMedia(stream as unknown as MediaStream);
      await startPromise;
    });

    expect(stream.track.stop).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances).toHaveLength(0);
  });
});
