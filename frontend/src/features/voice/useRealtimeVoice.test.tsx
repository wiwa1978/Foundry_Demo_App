import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchClient, RealtimeSessionResponse } from "@/api/types";
import {
  MockAudioElement,
  MockMediaStream,
  MockPeerConnection,
  installMediaSessionMocks,
} from "@/test/mediaSessionMocks";

import { createRealtimeSession, exchangeRealtimeSdp } from "./api";
import { useRealtimeVoice } from "./useRealtimeVoice";

vi.mock("./api", () => ({
  createRealtimeSession: vi.fn(),
  exchangeRealtimeSdp: vi.fn(),
}));

const session: RealtimeSessionResponse = {
  token: "token",
  webrtc_url: "https://example.test/realtime",
  model: "gpt-realtime-test",
  voice: "alloy",
  configured_guardrail_policy_name: "Safe",
  guardrail_status: "configured",
};

const fetchClient = vi.fn<FetchClient>();

describe("useRealtimeVoice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMediaSessionMocks();
    vi.mocked(createRealtimeSession).mockResolvedValue(session);
    vi.mocked(exchangeRealtimeSdp).mockResolvedValue("mock-answer");
  });

  it("starts, handles provider events, stops, and ignores the stopped session after restart", async () => {
    const { result } = renderHook(() =>
      useRealtimeVoice({
        fetchClient,
        model: "gpt-realtime-test",
      }),
    );

    await act(async () => result.current.start());
    const firstPeer = MockPeerConnection.instances[0];
    act(() => firstPeer.dataChannel.open());
    act(() =>
      firstPeer.dataChannel.emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "Hello",
        }),
      ),
    );
    act(() =>
      firstPeer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.output_text.done",
          transcript: "Hi there",
        }),
      ),
    );

    expect(result.current.status).toBe("live");
    expect(result.current.guardrailStatus).toBe("Safe: configured");
    expect(result.current.transcript.map((entry) => entry.text)).toEqual([
      "Connected to gpt-realtime-test (alloy)",
      "Hello",
      "Hi there",
    ]);

    act(() => result.current.stop());
    expect(result.current.status).toBe("idle");
    expect(firstPeer.close).toHaveBeenCalledOnce();
    expect(MockAudioElement.instances[0].pause).toHaveBeenCalledOnce();

    await act(async () => result.current.start());
    act(() =>
      firstPeer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.output_text.done",
          transcript: "stale response",
        }),
      ),
    );
    expect(result.current.transcript).toEqual([]);

    const secondPeer = MockPeerConnection.instances[1];
    act(() => secondPeer.dataChannel.open());
    expect(result.current.transcript[0].id).toBe("realtime-5");
  });

  it("handles all realtime event categories and a WebRTC failure", async () => {
    vi.mocked(createRealtimeSession).mockResolvedValue({
      ...session,
      configured_guardrail_policy_name: null,
      guardrail_status: undefined,
    });
    const { result } = renderHook(() =>
      useRealtimeVoice({
        fetchClient,
        model: "gpt-realtime-test",
      }),
    );

    await act(async () => result.current.start());
    const peer = MockPeerConnection.instances[0];
    act(() =>
      peer.ontrack?.({
        streams: [new MockMediaStream() as unknown as MediaStream],
      }),
    );
    act(() => peer.ontrack?.({ streams: [] }));
    act(() =>
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.output_audio_transcript.done",
          transcript: "Audio done",
        }),
      ),
    );
    act(() =>
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.output_audio_transcript.delta",
          delta: "Audio delta",
        }),
      ),
    );
    act(() =>
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "response.output_text.delta",
          delta: "Text delta",
        }),
      ),
    );
    act(() =>
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "input_audio_buffer.speech_started",
        }),
      ),
    );
    act(() =>
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "output_audio_buffer.started",
        }),
      ),
    );
    act(() =>
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "session.error",
        }),
      ),
    );
    expect(result.current.error).toBe("Realtime session reported an error.");
    act(() =>
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "error",
          error: { message: "Provider rejected audio" },
        }),
      ),
    );
    expect(result.current.error).toBe("Provider rejected audio");
    act(() =>
      peer.dataChannel.emitMessage(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "   ",
        }),
      ),
    );
    act(() => peer.dataChannel.emitMessage("not-json"));

    expect(result.current.guardrailStatus).toBe("");
    expect(result.current.transcript.map((entry) => entry.text)).toEqual([
      "Audio done",
      "Audio delta",
      "Text delta",
      "Speech detected",
      "Foundry is responding",
    ]);
    expect(result.current.error).toBe("Received an unreadable Realtime event.");

    act(() => peer.fail());
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe(
      "Foundry Realtime WebRTC connection failed.",
    );
  });

  it("reports unsupported browsers and unknown setup failures", async () => {
    vi.stubGlobal("navigator", { mediaDevices: {} });
    const { result } = renderHook(() =>
      useRealtimeVoice({
        fetchClient,
        model: "gpt-realtime-test",
      }),
    );

    await act(async () => result.current.start());
    expect(result.current.error).toBe(
      "This browser does not support the WebRTC APIs required for Foundry Realtime.",
    );

    installMediaSessionMocks();
    vi.mocked(createRealtimeSession).mockRejectedValueOnce("unknown failure");
    await act(async () => result.current.start());
    expect(result.current.error).toBe(
      "Failed to start Foundry Realtime voice demo.",
    );
  });

  it("cleans up a failed SDP exchange and all resources again on unmount", async () => {
    vi.mocked(exchangeRealtimeSdp)
      .mockRejectedValueOnce(new Error("SDP failed"))
      .mockResolvedValueOnce("mock-answer");
    const media = installMediaSessionMocks();
    const { result, unmount } = renderHook(() =>
      useRealtimeVoice({
        fetchClient,
        model: "gpt-realtime-test",
      }),
    );

    await act(async () => result.current.start());
    expect(result.current.error).toBe("SDP failed");
    expect(result.current.status).toBe("idle");
    expect(media.streams[0].track.stop).toHaveBeenCalledOnce();
    expect(
      MockPeerConnection.instances[0].dataChannel.close,
    ).toHaveBeenCalledOnce();

    await act(async () => result.current.start());
    await waitFor(() => expect(MockPeerConnection.instances).toHaveLength(2));
    unmount();
    expect(media.streams[1].track.stop).toHaveBeenCalledOnce();
    expect(MockPeerConnection.instances[1].close).toHaveBeenCalledOnce();
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
    const { result } = renderHook(() =>
      useRealtimeVoice({
        fetchClient,
        model: "gpt-realtime-test",
      }),
    );
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
    expect(MockPeerConnection.instances).toHaveLength(0);
  });
});
