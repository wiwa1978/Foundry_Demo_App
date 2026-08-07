import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockAudioElement,
  MockMediaStream,
  MockPeerConnection,
  MockWebSocket,
  installMediaSessionMocks,
} from "@/test/mediaSessionMocks";

import { useVoiceLive } from "./useVoiceLive";

vi.mock("./api", () => ({
  voiceLiveUrl: () => "ws://example.test/api/voice-live",
}));

describe("useVoiceLive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMediaSessionMocks();
  });

  it("starts with the configured model and voice, handles events, and rejects stale restart events", async () => {
    const { result } = renderHook(() =>
      useVoiceLive({
        model: "voice-live-test",
        voice: "en-US-Ava:Test",
      }),
    );

    await act(async () => result.current.start());
    const firstPeer = MockPeerConnection.instances[0];
    const firstSocket = MockWebSocket.instances[0];
    act(() => firstPeer.connect());
    act(() =>
      firstPeer.dataChannel.emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "Plan Paris",
        }),
      ),
    );
    act(() =>
      firstSocket.emitMessage(
        JSON.stringify({
          type: "response.text.done",
          transcript: "What dates?",
        }),
      ),
    );
    act(() =>
      firstSocket.emitMessage(
        JSON.stringify({
          type: "response.audio_transcript.done",
          transcript: "Audio itinerary",
        }),
      ),
    );
    act(() =>
      firstSocket.emitMessage(
        JSON.stringify({
          type: "input_audio_buffer.speech_started",
        }),
      ),
    );
    act(() => firstPeer.dataChannel.emitMessage("not-json"));
    act(() =>
      firstPeer.ontrack?.({
        streams: [new MockMediaStream() as unknown as MediaStream],
      }),
    );
    act(() => firstPeer.ontrack?.({ streams: [] }));

    expect(result.current.status).toBe("live");
    expect(result.current.transcript.map((entry) => entry.text)).toEqual([
      "Connected to Voice Live (voice-live-test)",
      "Plan Paris",
      "What dates?",
      "Audio itinerary",
      "Listening - interrupt at any time",
    ]);
    const setupMessage = JSON.parse(String(firstSocket.sent[0])) as {
      session: { voice: { name: string } };
    };
    expect(setupMessage.session.voice.name).toBe("en-US-Ava:Test");

    act(() => result.current.stop());
    expect(firstSocket.readyState).toBe(MockWebSocket.CLOSED);
    expect(firstPeer.close).toHaveBeenCalledOnce();
    expect(MockAudioElement.instances[0].pause).toHaveBeenCalledOnce();

    await act(async () => result.current.start());
    act(() =>
      firstSocket.emitMessage(
        JSON.stringify({
          type: "response.text.done",
          transcript: "stale response",
        }),
      ),
    );
    expect(result.current.transcript.map((entry) => entry.text)).toEqual([
      "Connected to Voice Live (voice-live-test)",
    ]);

    const secondPeer = MockPeerConnection.instances[1];
    act(() => secondPeer.connect());
    expect(result.current.status).toBe("live");
  });

  it("handles provider errors, WebRTC failure, and unsupported browsers", async () => {
    const { result } = renderHook(() =>
      useVoiceLive({
        model: "voice-live-test",
        voice: "en-US-Ava:Test",
      }),
    );

    await act(async () => result.current.start());
    const peer = MockPeerConnection.instances[0];
    const socket = MockWebSocket.instances[0];
    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "error",
          error: { message: "Provider rejected call" },
        }),
      ),
    );
    expect(result.current.error).toBe("Provider rejected call");
    expect(result.current.status).toBe("idle");

    await act(async () => result.current.start());
    const nextPeer = MockPeerConnection.instances[1];
    act(() => nextPeer.fail());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Voice Live WebRTC connection failed.");

    await act(async () => result.current.start());
    act(() => peer.fail());

    vi.stubGlobal("navigator", { mediaDevices: {} });
    act(() => result.current.stop());
    await act(async () => result.current.start());
    expect(result.current.error).toBe(
      "This browser does not support the WebRTC APIs required for Voice Live.",
    );
  });

  it("cleans up a failed control channel and an active session on unmount", async () => {
    MockWebSocket.mode = "open-error";
    const media = installMediaSessionMocks();
    MockWebSocket.mode = "open-error";
    const { result, unmount } = renderHook(() =>
      useVoiceLive({
        model: "voice-live-test",
        voice: "en-US-Ava:Test",
      }),
    );

    await act(async () => result.current.start());
    expect(result.current.error).toBe("Voice Live control channel failed.");
    expect(result.current.status).toBe("idle");
    expect(media.streams[0].track.stop).toHaveBeenCalledOnce();
    expect(MockPeerConnection.instances[0].close).toHaveBeenCalledOnce();

    MockWebSocket.mode = "success";
    await act(async () => result.current.start());
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2));
    unmount();
    expect(media.streams[1].track.stop).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances[1].readyState).toBe(MockWebSocket.CLOSED);
  });

  it("tears down post-setup data-channel close and error events", async () => {
    const media = installMediaSessionMocks();
    const { result } = renderHook(() =>
      useVoiceLive({
        model: "voice-live-test",
        voice: "en-US-Ava:Test",
      }),
    );

    await act(async () => result.current.start());
    act(() => MockPeerConnection.instances[0].dataChannel.close());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Voice Live data channel closed.");
    expect(media.streams[0].track.stop).toHaveBeenCalledOnce();

    await act(async () => result.current.start());
    act(() =>
      MockPeerConnection.instances[1].dataChannel.dispatchEvent(
        new Event("error"),
      ),
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Voice Live data channel failed.");
    expect(media.streams[1].track.stop).toHaveBeenCalledOnce();
  });

  it("tears down a control socket that fails after setup", async () => {
    const media = installMediaSessionMocks();
    const { result } = renderHook(() =>
      useVoiceLive({
        model: "voice-live-test",
        voice: "en-US-Ava:Test",
      }),
    );

    await act(async () => result.current.start());
    act(() => MockWebSocket.instances[0].dispatchEvent(new Event("error")));

    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Voice Live control channel failed.");
    expect(media.streams[0].track.stop).toHaveBeenCalledOnce();
  });

  it("stops a stale microphone stream that resolves after unmount", async () => {
    const media = installMediaSessionMocks();
    const stream = new MockMediaStream();
    let resolveMedia: (stream: MediaStream) => void = () => undefined;
    media.getUserMedia.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveMedia = resolve;
      }),
    );
    const { result, unmount } = renderHook(() =>
      useVoiceLive({
        model: "voice-live-test",
        voice: "en-US-Ava:Test",
      }),
    );
    let startPromise: Promise<void> | undefined;

    act(() => {
      startPromise = result.current.start();
    });
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledOnce());
    unmount();
    await act(async () => {
      resolveMedia(stream as unknown as MediaStream);
      await startPromise;
    });

    expect(stream.track.stop).toHaveBeenCalledOnce();
  });
});
