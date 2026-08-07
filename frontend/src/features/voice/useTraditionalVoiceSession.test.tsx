import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchClient, TraditionalVoiceResult } from "@/api/types";
import type { ApiTraceEntry } from "@/app/workspace/contracts";
import {
  MockMediaRecorder,
  MockMediaStream,
  installMediaSessionMocks,
} from "@/test/mediaSessionMocks";

import { runTraditionalVoice } from "./api";
import {
  useTraditionalVoiceSession,
  type TraditionalVoiceRequest,
} from "./useTraditionalVoiceSession";

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return { ...original, runTraditionalVoice: vi.fn() };
});

const fetchClient = vi.fn<FetchClient>();
const conversation = {
  id: "conversation-1",
  title: "Voice conversation",
  use_case: "traditional_voice" as const,
  created_at: "2026-08-07T10:00:00Z",
  updated_at: "2026-08-07T10:00:00Z",
};
const userMessage = {
  id: "user-1",
  conversation_id: conversation.id,
  role: "user" as const,
  content: "Hello",
  model: null,
  api_surface: null,
  duration_ms: null,
  usage: null,
  error: null,
  guardrail_variant: null,
  guardrail_policy_name: null,
  guardrail_results: null,
  created_at: "2026-08-07T10:00:00Z",
};
const assistantMessage = {
  ...userMessage,
  id: "assistant-1",
  role: "assistant" as const,
  content: "Hi there",
  model: "chat-model",
};
const pipelineResult: TraditionalVoiceResult = {
  model: "chat-model",
  transcription: {
    model: "stt-model",
    text: "Hello",
    duration_ms: 12,
    foundry_request: { payload: { model: "stt-model" } },
    foundry_response: { extracted: { text: "Hello" } },
  },
  results: [
    {
      model: "chat-model",
      content: "Hi there",
      duration_ms: 34,
      assistant_message: assistantMessage,
      foundry_request: {
        api_surface: "responses",
        method: "POST",
        path: "/responses",
        payload: { model: "chat-model" },
      },
      foundry_response: {
        api_surface: "responses",
        payload: { output: "Hi there" },
      },
      speech: {
        model: "tts-model",
        voice: "alloy",
        audio_base64: "YXVkaW8=",
        audio_mime_type: "audio/mpeg",
        duration_ms: 56,
        foundry_request: { payload: { voice: "alloy" } },
        foundry_response: { payload: { bytes: 5 } },
      },
    },
  ],
  conversation,
  user_message: userMessage,
};

function createRequest(): TraditionalVoiceRequest {
  return {
    models: ["chat-model", "backup-model"],
    prompt: "Existing prompt",
    activeModel: "chat-model",
    conversation,
    conversationId: conversation.id,
    useCase: "traditional_voice",
    reasoningEffort: "medium",
    guardrails: {
      comparisonEnabled: true,
      policies: ["policy-1", "policy-2"],
    },
    transcriptionModel: "stt-model",
    tts: { model: "tts-model", voice: "alloy" },
  };
}

function renderSession(sessionRef = { current: 0 }) {
  const appendApiTrace =
    vi.fn<(entry: Omit<ApiTraceEntry, "id" | "timestamp">) => void>();
  const appendFoundryTrace = vi.fn();
  const appendFoundryResponseTrace = vi.fn();
  const appendApiResponseTrace = vi.fn();
  const onComplete = vi.fn();
  return {
    callbacks: {
      appendApiTrace,
      appendFoundryTrace,
      appendFoundryResponseTrace,
      appendApiResponseTrace,
      onComplete,
    },
    hook: renderHook(() =>
      useTraditionalVoiceSession({
        fetchClient,
        sessionRef,
        appendApiTrace,
        appendFoundryTrace,
        appendFoundryResponseTrace,
        appendApiResponseTrace,
        onComplete,
      }),
    ),
    sessionRef,
  };
}

describe("useTraditionalVoiceSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMediaSessionMocks();
    vi.mocked(runTraditionalVoice).mockResolvedValue({
      response: new Response(null, { status: 200 }),
      result: pipelineResult,
    });
  });

  it("stops a delayed permission stream after stop and after unmount", async () => {
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
    const first = renderSession().hook;
    let firstStart: Promise<void> | undefined;

    act(() => {
      firstStart = first.result.current.start(createRequest());
    });
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledOnce());
    act(() => first.result.current.stop());
    await act(async () => {
      resolveStopped(stoppedStream as unknown as MediaStream);
      await firstStart;
    });
    expect(stoppedStream.track.stop).toHaveBeenCalledOnce();
    expect(MockMediaRecorder.instances).toHaveLength(0);

    const second = renderSession().hook;
    let secondStart: Promise<void> | undefined;
    act(() => {
      secondStart = second.result.current.start(createRequest());
    });
    await waitFor(() => expect(media.getUserMedia).toHaveBeenCalledTimes(2));
    second.unmount();
    await act(async () => {
      resolveUnmounted(unmountedStream as unknown as MediaStream);
      await secondStart;
    });
    expect(unmountedStream.track.stop).toHaveBeenCalledOnce();
  });

  it("records successfully, uses the start snapshot, and emits pipeline traces", async () => {
    const { hook, callbacks } = renderSession();
    const request = createRequest();
    await act(async () => hook.result.current.start(request));
    const recorder = MockMediaRecorder.instances[0];

    request.activeModel = "changed-model";
    request.transcriptionModel = "changed-stt";
    request.tts.voice = "nova";
    recorder.emitData(new Blob(["audio"], { type: "audio/webm" }));
    act(() => hook.result.current.stop());

    await waitFor(() => expect(hook.result.current.status).toBe("complete"));
    expect(runTraditionalVoice).toHaveBeenCalledWith(
      fetchClient,
      expect.objectContaining({
        model: "chat-model",
        transcriptionModel: "stt-model",
        ttsModel: "tts-model",
        ttsVoice: "alloy",
        useCase: "traditional_voice",
        conversationId: conversation.id,
        reasoningEffort: "medium",
      }),
    );
    expect(hook.result.current.result).toBe(pipelineResult);
    expect(callbacks.onComplete).toHaveBeenCalledWith(pipelineResult);
    expect(callbacks.appendApiTrace).toHaveBeenCalledTimes(4);
    expect(callbacks.appendFoundryTrace).toHaveBeenCalledOnce();
    expect(callbacks.appendFoundryResponseTrace).toHaveBeenCalledOnce();
    expect(callbacks.appendApiResponseTrace).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "Traditional voice pipeline response",
        status: 200,
      }),
    );
  });

  it("ignores a pipeline completion after use-case session invalidation", async () => {
    let resolvePipeline: (value: {
      response: Response;
      result: TraditionalVoiceResult;
    }) => void = () => undefined;
    vi.mocked(runTraditionalVoice).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePipeline = resolve;
      }),
    );
    const { hook, callbacks, sessionRef } = renderSession();
    await act(async () => hook.result.current.start(createRequest()));
    MockMediaRecorder.instances[0].emitData(new Blob(["audio"]));
    act(() => hook.result.current.stop());
    await waitFor(() => expect(runTraditionalVoice).toHaveBeenCalledOnce());

    act(() => {
      sessionRef.current += 1;
      hook.result.current.invalidate();
    });
    await act(async () => {
      resolvePipeline({
        response: new Response(null, { status: 200 }),
        result: pipelineResult,
      });
    });

    expect(hook.result.current.status).toBe("idle");
    expect(hook.result.current.result).toBeNull();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(callbacks.appendApiTrace).not.toHaveBeenCalled();
  });

  it("preserves validation, browser support, recorder error, and empty-audio messages", async () => {
    const { hook } = renderSession();
    const request = createRequest();

    await act(async () =>
      hook.result.current.start({ ...request, activeModel: "" }),
    );
    expect(hook.result.current.error).toBe(
      "Select a chat model for the middle step of the STT -> Chat -> TTS pipeline.",
    );
    await act(async () =>
      hook.result.current.start({ ...request, transcriptionModel: "" }),
    );
    expect(hook.result.current.error).toBe(
      "Select both an STT deployment and a TTS deployment.",
    );

    vi.stubGlobal("navigator", { mediaDevices: {} });
    await act(async () => hook.result.current.start(request));
    expect(hook.result.current.error).toBe(
      "This browser does not support audio recording with MediaRecorder.",
    );

    installMediaSessionMocks();
    await act(async () => hook.result.current.start(request));
    act(() => MockMediaRecorder.instances[0].emitError());
    expect(hook.result.current.error).toBe(
      "Audio recording failed. Check microphone permissions and try again.",
    );

    await act(async () => hook.result.current.start(request));
    act(() => hook.result.current.stop());
    expect(hook.result.current.error).toBe("No audio was captured.");
  });

  it("reports microphone and pipeline failures", async () => {
    const media = installMediaSessionMocks();
    media.getUserMedia.mockRejectedValueOnce(new Error("Permission denied"));
    const { hook } = renderSession();

    await act(async () => hook.result.current.start(createRequest()));
    expect(hook.result.current.error).toBe("Permission denied");

    vi.mocked(runTraditionalVoice).mockRejectedValueOnce("provider offline");
    await act(async () => hook.result.current.start(createRequest()));
    MockMediaRecorder.instances[0].emitData(new Blob(["audio"]));
    act(() => hook.result.current.stop());
    await waitFor(() => expect(hook.result.current.status).toBe("idle"));
    expect(hook.result.current.error).toBe(
      "Traditional Foundry voice pipeline failed.",
    );
  });

  it("covers optional pipeline metadata and remaining start guards", async () => {
    const resultWithoutProviderMetadata: TraditionalVoiceResult = {
      ...pipelineResult,
      transcription: {
        model: "stt-model",
        text: "Hello",
        duration_ms: 12,
      },
      results: [
        {
          model: "chat-model",
          content: "Hi there",
          guardrail_variant: "guarded",
          assistant_message: assistantMessage,
        },
      ],
    };
    vi.mocked(runTraditionalVoice).mockResolvedValueOnce({
      response: new Response(null, { status: 200 }),
      result: resultWithoutProviderMetadata,
    });
    const { hook, callbacks } = renderSession();
    const request = { ...createRequest(), conversation: null };

    await act(async () =>
      hook.result.current.start({
        ...request,
        tts: { model: "", voice: "alloy" },
      }),
    );
    expect(hook.result.current.error).toBe(
      "Select both an STT deployment and a TTS deployment.",
    );

    vi.stubGlobal("MediaRecorder", undefined);
    await act(async () => hook.result.current.start(request));
    expect(hook.result.current.error).toBe(
      "This browser does not support audio recording with MediaRecorder.",
    );

    installMediaSessionMocks();
    await act(async () => hook.result.current.start(request));
    MockMediaRecorder.instances[0].emitData(new Blob(["audio"]));
    await act(async () => hook.result.current.start(request));
    await waitFor(() => expect(hook.result.current.status).toBe("complete"));
    expect(callbacks.appendFoundryTrace).not.toHaveBeenCalled();
    expect(callbacks.appendFoundryResponseTrace).not.toHaveBeenCalled();
    expect(callbacks.appendApiTrace).toHaveBeenCalledTimes(2);

    act(() => hook.result.current.stop());
    act(() => hook.result.current.invalidate());
    expect(hook.result.current.status).toBe("idle");
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
    const { hook } = renderSession();

    await act(async () => hook.result.current.start(createRequest()));
    expect(media.streams[0].track.stop).toHaveBeenCalledOnce();
    expect(hook.result.current.error).toBe("Recorder unavailable");
  });
});
