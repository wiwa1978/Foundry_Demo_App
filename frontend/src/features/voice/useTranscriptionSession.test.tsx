import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchClient, TranscriptionResult } from "@/api/types";
import {
  MockMediaRecorder,
  MockMediaStream,
  installMediaSessionMocks,
} from "@/test/mediaSessionMocks";

import { transcribeRecording } from "./api";
import { convertAudioToWav } from "./audioUtils";
import { useTranscriptionSession } from "./useTranscriptionSession";

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, transcribeRecording: vi.fn() };
});

vi.mock("./audioUtils", async (importOriginal) => {
  const original = await importOriginal<typeof import("./audioUtils")>();
  return { ...original, convertAudioToWav: vi.fn() };
});

const fetchClient = vi.fn<FetchClient>();
const transcription: TranscriptionResult = {
  model: "transcribe-model",
  text: "Recorded words",
  language: "en-US",
  duration_ms: 25,
  segments: ["Recorded words"],
};

describe("useTranscriptionSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMediaSessionMocks();
    vi.mocked(convertAudioToWav).mockResolvedValue(
      new Blob(["wav"], { type: "audio/wav" }),
    );
    vi.mocked(transcribeRecording).mockResolvedValue(transcription);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:recording"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("stops delayed permission streams after stop and unmount", async () => {
    const media = installMediaSessionMocks();
    const stoppedStream = new MockMediaStream();
    const unmountedStream = new MockMediaStream();
    let resolveStopped: (stream: MediaStream) => void = () => undefined;
    let resolveUnmounted: (stream: MediaStream) => void = () => undefined;
    media.getUserMedia
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveStopped = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveUnmounted = resolve;
        }),
      );
    const first = renderHook(() =>
      useTranscriptionSession({ fetchClient, model: "transcribe-model" }),
    );
    let firstStart: Promise<void> | undefined;

    act(() => {
      firstStart = first.result.current.start();
    });
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledOnce());
    act(() => first.result.current.stop());
    await act(async () => {
      resolveStopped(stoppedStream as unknown as MediaStream);
      await firstStart;
    });
    expect(stoppedStream.track.stop).toHaveBeenCalledOnce();
    expect(MockMediaRecorder.instances).toHaveLength(0);

    const second = renderHook(() =>
      useTranscriptionSession({ fetchClient, model: "transcribe-model" }),
    );
    let secondStart: Promise<void> | undefined;
    act(() => {
      secondStart = second.result.current.start();
    });
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(2));
    second.unmount();
    await act(async () => {
      resolveUnmounted(unmountedStream as unknown as MediaStream);
      await secondStart;
    });
    expect(unmountedStream.track.stop).toHaveBeenCalledOnce();
  });

  it("records and transcribes captured audio", async () => {
    const { result } = renderHook(() =>
      useTranscriptionSession({ fetchClient, model: "transcribe-model" }),
    );
    await act(async () => result.current.start());
    const recorder = MockMediaRecorder.instances[0];
    recorder.emitData(new Blob(["audio"], { type: "audio/webm" }));
    act(() => result.current.stop());

    await waitFor(() => expect(result.current.status).toBe("complete"));
    expect(result.current.sourceName).toBe("Microphone recording");
    expect(result.current.result).toBe(transcription);
    expect(transcribeRecording).toHaveBeenCalledWith(
      fetchClient,
      expect.any(Blob),
      "transcribe-model",
      "en-US",
    );
  });

  it("converts once and transcribes with multiple models independently", async () => {
    const second: TranscriptionResult = {
      ...transcription,
      model: "transcribe-b",
      text: "Alternate words",
    };
    vi.mocked(transcribeRecording)
      .mockResolvedValueOnce(transcription)
      .mockResolvedValueOnce(second);
    const { result } = renderHook(() =>
      useTranscriptionSession({
        fetchClient,
        model: "transcribe-model",
        models: ["transcribe-model", "transcribe-b"],
      }),
    );

    await act(async () =>
      result.current.selectFile(
        new File(["audio"], "recording.wav", { type: "audio/wav" }),
      ),
    );

    expect(convertAudioToWav).toHaveBeenCalledOnce();
    expect(transcribeRecording).toHaveBeenCalledTimes(2);
    expect(result.current.results).toEqual({
      "transcribe-model": [transcription],
      "transcribe-b": [second],
    });
    expect(result.current.modelErrors).toEqual({});
  });

  it("publishes each model result immediately and keeps prior session output", async () => {
    let resolveFirst: (value: TranscriptionResult) => void = () => undefined;
    let resolveSecond: (value: TranscriptionResult) => void = () => undefined;
    vi.mocked(transcribeRecording)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
      );
    const { result } = renderHook(() =>
      useTranscriptionSession({
        fetchClient,
        model: "transcribe-model",
        models: ["transcribe-model", "transcribe-b"],
      }),
    );

    let run: Promise<TranscriptionResult | null> | undefined;
    act(() => {
      run = result.current.selectFile(
        new File(["audio"], "recording.wav", { type: "audio/wav" }),
      );
    });
    await waitFor(() => expect(transcribeRecording).toHaveBeenCalledTimes(2));
    await act(async () => resolveFirst(transcription));

    expect(result.current.results["transcribe-model"]).toEqual([transcription]);
    expect(result.current.pendingModels).toEqual(new Set(["transcribe-b"]));
    expect(result.current.status).toBe("processing");

    await act(async () => {
      resolveSecond({ ...transcription, model: "transcribe-b" });
      await run;
    });
    vi.mocked(transcribeRecording).mockResolvedValue(transcription);
    await act(async () =>
      result.current.selectFile(
        new File(["next"], "next.wav", { type: "audio/wav" }),
      ),
    );

    expect(result.current.results["transcribe-model"]).toHaveLength(2);
    expect(result.current.results["transcribe-b"]).toHaveLength(2);
  });

  it("transcribes files and revokes replaced and unmounted object URLs", async () => {
    const createObjectURL = vi
      .mocked(URL.createObjectURL)
      .mockReturnValueOnce("blob:first")
      .mockReturnValueOnce("blob:second");
    const revokeObjectURL = vi.mocked(URL.revokeObjectURL);
    const { result, unmount } = renderHook(() =>
      useTranscriptionSession({ fetchClient, model: "transcribe-model" }),
    );
    const first = new File(["one"], "first.mp3", { type: "audio/mpeg" });
    const second = new File(["two"], "second.wav", { type: "audio/wav" });

    await act(async () => result.current.selectFile(first));
    expect(result.current.audioUrl).toBe("blob:first");
    expect(result.current.sourceName).toBe("first.mp3");
    await act(async () => result.current.selectFile(second));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:first");
    expect(result.current.audioUrl).toBe("blob:second");
    expect(createObjectURL).toHaveBeenCalledTimes(2);

    unmount();
    expect(revokeObjectURL).toHaveBeenLastCalledWith("blob:second");
  });

  it("preserves unsupported, invalid-file, recorder-error, and empty-audio messages", async () => {
    const { result } = renderHook(() =>
      useTranscriptionSession({ fetchClient, model: "transcribe-model" }),
    );
    vi.stubGlobal("navigator", { mediaDevices: {} });
    await act(async () => result.current.start());
    expect(result.current.error).toBe(
      "This browser does not support audio recording with MediaRecorder.",
    );

    await act(async () =>
      result.current.selectFile(
        new File(["text"], "notes.txt", { type: "text/plain" }),
      ),
    );
    expect(result.current.error).toBe(
      "Select an audio file such as MP3, WAV, OGG, WebM, or M4A.",
    );

    installMediaSessionMocks();
    await act(async () => result.current.start());
    act(() => MockMediaRecorder.instances[0].emitError());
    expect(result.current.error).toBe(
      "Audio recording failed. Check microphone permissions and try again.",
    );

    await act(async () => result.current.start());
    act(() => result.current.stop());
    expect(result.current.error).toBe("No audio was captured.");
  });

  it("reports microphone and transcription failures", async () => {
    const media = installMediaSessionMocks();
    media.getUserMedia.mockRejectedValueOnce(new Error("Permission denied"));
    const { result } = renderHook(() =>
      useTranscriptionSession({ fetchClient, model: "transcribe-model" }),
    );

    await act(async () => result.current.start());
    expect(result.current.error).toBe("Permission denied");

    vi.mocked(transcribeRecording).mockRejectedValueOnce("provider offline");
    await act(async () =>
      result.current.selectFile(
        new File(["audio"], "recording.webm", { type: "audio/webm" }),
      ),
    );
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBe("Transcription failed.");
  });

  it("handles alternate file detection, absent files, and remaining start guards", async () => {
    const { result } = renderHook(() =>
      useTranscriptionSession({ fetchClient, model: "transcribe-model" }),
    );
    await act(async () => result.current.selectFile(undefined));
    expect(transcribeRecording).not.toHaveBeenCalled();

    await act(async () =>
      result.current.selectFile(new File(["audio"], "recording.m4a")),
    );
    expect(result.current.status).toBe("complete");

    vi.stubGlobal("MediaRecorder", undefined);
    await act(async () => result.current.start());
    expect(result.current.error).toBe(
      "This browser does not support audio recording with MediaRecorder.",
    );

    installMediaSessionMocks();
    await act(async () => result.current.start());
    MockMediaRecorder.instances[0].emitData(new Blob(["audio"]));
    await act(async () => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("complete"));
    act(() => result.current.stop());
    act(() => result.current.invalidate());
    expect(result.current.status).toBe("idle");
  });

  it("stops the granted stream when recorder construction fails", async () => {
    const media = installMediaSessionMocks();
    vi.stubGlobal(
      "MediaRecorder",
      class {
        static isTypeSupported() {
          return false;
        }

        constructor() {
          throw new Error("Recorder unavailable");
        }
      },
    );
    const { result } = renderHook(() =>
      useTranscriptionSession({ fetchClient, model: "transcribe-model" }),
    );

    await act(async () => result.current.start());
    expect(media.streams[0].track.stop).toHaveBeenCalledOnce();
    expect(result.current.error).toBe("Recorder unavailable");
  });
});
