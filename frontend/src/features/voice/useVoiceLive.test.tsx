import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockAudioContext,
  MockAudioWorkletNode,
  MockMediaStream,
  MockPeerConnection,
  MockWebSocket,
  installMediaSessionMocks,
} from "@/test/mediaSessionMocks";

import { useVoiceLive } from "./useVoiceLive";

vi.mock("./api", () => ({
  voiceLiveAvatarUrl: () => "ws://example.test/api/voice-live-avatar",
}));

describe("useVoiceLive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMediaSessionMocks();
  });

  it("starts an avatar session, streams microphone audio, and handles transcripts", async () => {
    const { result } = renderHook(() =>
      useVoiceLive({
        model: "gpt-realtime",
        voice: "en-US-Ava:Test",
      }),
    );

    await act(async () => result.current.start());
    await waitFor(() =>
      expect(MockWebSocket.instances[0].sent.length).toBeGreaterThan(1),
    );

    const socket = MockWebSocket.instances[0];
    const setupMessage = JSON.parse(String(socket.sent[0])) as {
      session: {
        avatar: { output_protocol: string; character: string; style: string };
        input_audio_transcription: { model: string };
        voice: { name: string; type: string; temperature?: number };
      };
    };
    expect(setupMessage.session.voice).toEqual({
      type: "azure-standard",
      name: "en-US-Ava:Test",
      temperature: 0.8,
    });
    expect(setupMessage.session.input_audio_transcription).toEqual({
      model: "gpt-4o-mini-transcribe",
    });
    expect(setupMessage.session.avatar).toMatchObject({
      output_protocol: "webrtc",
      character: "lisa",
      style: "casual-sitting",
    });

    await waitFor(() =>
      expect(
        socket.sent.some((message) =>
          String(message).includes('"type":"session.avatar.connect"'),
        ),
      ).toBe(true),
    );
    expect(MockPeerConnection.instances[0].addTransceiver).toHaveBeenCalledWith(
      "video",
      { direction: "recvonly" },
    );
    expect(
      MockPeerConnection.instances[0].setRemoteDescription,
    ).toHaveBeenCalledWith({
      type: "answer",
      sdp: "mock-avatar-answer",
    });

    const microphonePcm = new ArrayBuffer(4);
    act(() =>
      MockAudioWorkletNode.instances[0].port.onmessage?.(
        new MessageEvent("message", { data: microphonePcm }),
      ),
    );
    expect(String(socket.sent.at(-1))).toContain("input_audio_buffer.append");

    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "Plan Paris",
        }),
      ),
    );
    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "response.audio_transcript.done",
          transcript: "What dates?",
        }),
      ),
    );
    expect(result.current.transcript.map((entry) => entry.text)).toEqual([
      "Connected to Voice Live avatar (gpt-realtime)",
      "Plan Paris",
      "What dates?",
    ]);
    expect(result.current.status).toBe("live");
  });

  it("uses azure-realtime native voice configuration", async () => {
    const { result } = renderHook(() =>
      useVoiceLive({
        model: "azure-realtime",
        voice: "ava",
      }),
    );

    await act(async () => result.current.start());
    const setupMessage = JSON.parse(
      String(MockWebSocket.instances[0].sent[0]),
    ) as {
      session: {
        input_audio_transcription?: { model: string };
        voice: { name: string; type: string; temperature?: number };
      };
    };

    expect(setupMessage.session.voice).toEqual({
      type: "azure-realtime-native",
      name: "ava",
    });
    expect(setupMessage.session.input_audio_transcription).toBeUndefined();
  });

  it("continues avatar SDP setup when ICE gathering does not complete", async () => {
    vi.useFakeTimers();
    try {
      MockPeerConnection.initialIceGatheringState = "gathering";
      const { result } = renderHook(() =>
        useVoiceLive({
          model: "gpt-realtime",
          voice: "en-US-Ava:Test",
        }),
      );

      await act(async () => result.current.start());
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(MockPeerConnection.instances).toHaveLength(1);
      expect(
        MockWebSocket.instances[0].sent.some((message) =>
          String(message).includes("session.avatar.connect"),
        ),
      ).toBe(false);

      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(
        MockWebSocket.instances[0].sent.some((message) =>
          String(message).includes("session.avatar.connect"),
        ),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("handles provider errors, avatar WebRTC failure, and unsupported browsers", async () => {
    const { result } = renderHook(() =>
      useVoiceLive({
        model: "gpt-realtime",
        voice: "en-US-Ava:Test",
      }),
    );

    await act(async () => result.current.start());
    const socket = MockWebSocket.instances[0];
    act(() =>
      socket.emitMessage(
        JSON.stringify({
          type: "error",
          error: { message: "Provider rejected avatar session" },
        }),
      ),
    );
    expect(result.current.error).toBe("Provider rejected avatar session");
    expect(result.current.status).toBe("idle");

    await act(async () => result.current.start());
    act(() => MockPeerConnection.instances.at(-1)?.fail());
    expect(result.current.avatar.status).toBe("unavailable");
    expect(result.current.avatar.error).toBe(
      "Avatar WebRTC connection failed.",
    );

    vi.stubGlobal("navigator", { mediaDevices: {} });
    act(() => result.current.stop());
    await act(async () => result.current.start());
    expect(result.current.error).toBe(
      "This browser does not support the audio and WebRTC APIs required for Voice Live avatars.",
    );
  });

  it("cleans up a failed channel and an active session on unmount", async () => {
    MockWebSocket.mode = "open-error";
    const media = installMediaSessionMocks();
    MockWebSocket.mode = "open-error";
    const { result, unmount } = renderHook(() =>
      useVoiceLive({
        model: "gpt-realtime",
        voice: "en-US-Ava:Test",
      }),
    );

    await act(async () => result.current.start());
    expect(result.current.error).toBe("Voice Live avatar channel failed.");
    expect(result.current.status).toBe("idle");
    expect(media.streams[0].track.stop).toHaveBeenCalledOnce();
    expect(MockAudioContext.instances[0].close).toHaveBeenCalledOnce();

    MockWebSocket.mode = "success";
    await act(async () => result.current.start());
    await waitFor(() => expect(MockAudioWorkletNode.instances).toHaveLength(2));
    unmount();
    expect(media.streams[1].track.stop).toHaveBeenCalledOnce();
    expect(MockWebSocket.instances[1].readyState).toBe(MockWebSocket.CLOSED);
    expect(MockAudioWorkletNode.instances[1].disconnect).toHaveBeenCalledOnce();
    expect(MockAudioContext.instances[1].close).toHaveBeenCalledOnce();
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
        model: "gpt-realtime",
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
