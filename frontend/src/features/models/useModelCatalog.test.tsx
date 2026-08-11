import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { discoverModels, registerModel } from "@/api/models";
import type { ConfigResponse, FetchClient, ModelsResponse } from "@/api/types";
import type { UseCaseWorkspace } from "@/app/types";

import { useModelCatalog } from "./useModelCatalog";

const { toastInfo } = vi.hoisted(() => ({ toastInfo: vi.fn() }));

vi.mock("sonner", () => ({ toast: { info: toastInfo } }));
vi.mock("@/api/models", () => ({
  discoverModels: vi.fn(),
  registerModel: vi.fn(),
}));

const fetchClient = vi.fn<FetchClient>();

function config(overrides: Partial<ConfigResponse> = {}): ConfigResponse {
  return {
    entra_auth_enabled: false,
    is_configured: true,
    endpoint: "https://example.openai.azure.com",
    models: ["text-a", "text-b"],
    is_realtime_configured: false,
    realtime_endpoint: null,
    realtime_model: null,
    embedding_model: null,
    is_document_rag_configured: false,
    search_endpoint: null,
    search_index_name: null,
    storage_account_url: null,
    storage_container_name: null,
    is_traditional_voice_configured: true,
    transcription_model: "whisper-configured",
    tts_model: "tts-configured",
    tts_voice: "nova",
    is_speech_transcription_configured: true,
    speech_transcription_model: "mai-transcribe-configured",
    is_voice_live_configured: false,
    voice_live_model: null,
    voice_live_voice: null,
    is_live_interpreter_configured: false,
    ...overrides,
  };
}

function discovery(overrides: Partial<ModelsResponse> = {}): ModelsResponse {
  return {
    models: ["discovered-a"],
    transcription_models: ["transcribe-a"],
    traditional_transcription_models: ["whisper-a"],
    tts_models: ["tts-a"],
    model_modalities: { "discovered-a": ["text"] },
    discovery_error: null,
    ...overrides,
  };
}

type HookProps = {
  config: ConfigResponse | null;
  canUseProtectedApis: boolean;
  workspace: UseCaseWorkspace;
};

function setup(initialProps: Partial<HookProps> = {}) {
  const props: HookProps = {
    config: config(),
    canUseProtectedApis: false,
    workspace: "chat",
    ...initialProps,
  };
  return renderHook(
    (currentProps: HookProps) =>
      useModelCatalog({ fetchClient, ...currentProps }),
    { initialProps: props },
  );
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("useModelCatalog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("bootstraps catalog defaults after config loads", async () => {
    const { result, rerender } = setup({ config: null });
    expect(result.current.models).toEqual([]);

    rerender({
      config: config({ models: [] }),
      canUseProtectedApis: false,
      workspace: "chat",
    });

    await waitFor(() => expect(result.current.models).toEqual(["gpt-4o-mini"]));
    expect(result.current.activeModel).toBe("gpt-4o-mini");
    expect(result.current.selected).toEqual(["gpt-4o-mini"]);
    expect(result.current.transcriptionModels).toEqual([
      "mai-transcribe-configured",
      "whisper-configured",
    ]);
    expect(result.current.traditionalTranscriptionModel).toBe(
      "whisper-configured",
    );
    expect(result.current.ttsModel).toBe("tts-configured");
    expect(result.current.ttsVoice).toBe("nova");
  });

  it("merges discovery with configured models through the canonical reconciliation", async () => {
    vi.mocked(discoverModels).mockResolvedValue(
      discovery({
        models: ["dynamic-text", "dynamic-image"],
        model_modalities: {
          "dynamic-text": ["text"],
          "dynamic-image": ["image"],
        },
      }),
    );
    const { result } = setup({ canUseProtectedApis: true });

    await waitFor(() =>
      expect(result.current.models).toEqual([
        "dynamic-text",
        "dynamic-image",
        "text-a",
        "text-b",
      ]),
    );
    expect(result.current.modelModalities["dynamic-image"]).toEqual(["image"]);
    expect(result.current.activeModel).toBe("text-a");
    expect(result.current.selected).toEqual(["text-a", "text-b"]);
  });

  it("ignores stale discovery results even when an aborted request resolves", async () => {
    vi.useFakeTimers();
    const stale = deferred<ModelsResponse>();
    const fresh = deferred<ModelsResponse>();
    vi.mocked(discoverModels)
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise);
    const { result } = setup({ canUseProtectedApis: true });
    const staleSignal = vi.mocked(discoverModels).mock.calls[0][1];

    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(staleSignal.aborted).toBe(true);
    await act(async () => {
      fresh.resolve(
        discovery({
          models: ["fresh"],
          model_modalities: { fresh: ["text"] },
        }),
      );
    });
    await act(async () => {
      stale.resolve(
        discovery({
          models: ["stale"],
          model_modalities: { stale: ["text"] },
        }),
      );
    });

    expect(result.current.models).toContain("fresh");
    expect(result.current.models).not.toContain("stale");
  });

  it("aborts discovery when disabled and when unmounted", () => {
    vi.mocked(discoverModels).mockImplementation(
      () => new Promise<ModelsResponse>(() => undefined),
    );
    const first = setup({ canUseProtectedApis: true });
    const disabledSignal = vi.mocked(discoverModels).mock.calls[0][1];

    first.rerender({
      config: config(),
      canUseProtectedApis: false,
      workspace: "chat",
    });
    expect(disabledSignal.aborted).toBe(true);

    const second = setup({ canUseProtectedApis: true });
    const unmountedSignal = vi.mocked(discoverModels).mock.calls[1][1];
    second.unmount();
    expect(unmountedSignal.aborted).toBe(true);
  });

  it("refreshes on the timer and only when the document becomes visible", async () => {
    vi.useFakeTimers();
    vi.mocked(discoverModels).mockResolvedValue(discovery());
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState",
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    const { unmount } = setup({ canUseProtectedApis: true });
    await flushPromises();
    expect(discoverModels).toHaveBeenCalledTimes(1);

    document.dispatchEvent(new Event("visibilitychange"));
    expect(discoverModels).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(discoverModels).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(discoverModels).toHaveBeenCalledTimes(3);

    unmount();
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(discoverModels).toHaveBeenCalledTimes(3);
    if (visibilityDescriptor) {
      Object.defineProperty(document, "visibilityState", visibilityDescriptor);
    }
  });

  it("registers a model and applies its modalities immediately", async () => {
    vi.mocked(registerModel).mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: {
        models: ["text-a", "text-b", "registered"],
        settings: { model: "registered", modalities: ["text", "voice"] },
      },
    });
    const { result } = setup();
    act(() => result.current.setNewModel(" registered "));
    await act(async () => result.current.addModel());

    expect(registerModel).toHaveBeenCalledWith(fetchClient, "registered");
    expect(result.current.modelModalities.registered).toEqual([
      "text",
      "voice",
    ]);
    expect(result.current.activeModel).toBe("registered");
    expect(result.current.newModel).toBe("");
    expect(result.current.modelEndpointMessage).toEqual({
      type: "success",
      text: "Saved registered to the local model registry.",
    });
  });

  it("reports registration response and request failures without changing the catalog", async () => {
    vi.mocked(registerModel).mockResolvedValueOnce({
      response: new Response(null, { status: 409 }),
      data: {
        detail: "Registration rejected",
        settings: { model: "rejected", modalities: ["text"] },
      },
    });
    const { result } = setup();
    act(() => result.current.setNewModel("rejected"));
    await act(async () => result.current.addModel());
    expect(result.current.models).toEqual(["text-a", "text-b"]);
    expect(result.current.modelEndpointMessage?.text).toBe(
      "Registration rejected",
    );

    vi.mocked(registerModel).mockRejectedValueOnce(new Error("Network down"));
    act(() => result.current.setNewModel("network-error"));
    await act(async () => result.current.addModel());
    expect(result.current.modelEndpointMessage?.text).toBe("Network down");
  });

  it("upserts modalities and reconciles active and comparison text models", async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.activeModel).toBe("text-a"));
    act(() => result.current.setActiveModel("text-b"));
    act(() => result.current.upsertModel("text-b", ["image"]));

    expect(result.current.modelModalities["text-b"]).toEqual(["image"]);
    expect(result.current.activeModel).toBe("text-a");
    expect(result.current.textModels).toEqual(["text-a"]);
    expect(result.current.selected).toEqual(["text-a"]);

    act(() => result.current.upsertModel("new-voice-model", ["text", "voice"]));
    expect(result.current.models).toContain("new-voice-model");
    expect(result.current.modelModalities["new-voice-model"]).toEqual([
      "text",
      "voice",
    ]);
    act(() => result.current.activateModel("new-voice-model"));
    expect(result.current.activeModel).toBe("new-voice-model");
    expect(result.current.selected).toEqual(["text-a", "new-voice-model"]);
    act(() => result.current.activateModel("text-b"));
    expect(result.current.activeModel).toBe("new-voice-model");
    act(() => result.current.upsertModel("   ", ["text"]));
    expect(result.current.models).not.toContain("");
  });

  it("enforces the comparison limit and replaces selected models", async () => {
    const { result } = setup({
      config: config({ models: ["one", "two", "three", "four"] }),
    });
    await waitFor(() =>
      expect(result.current.selected).toEqual(["one", "two"]),
    );

    act(() => result.current.toggleModel("three"));
    expect(result.current.selected).toEqual(["one", "two", "three"]);
    expect(toastInfo).toHaveBeenCalledWith("Comparison limit reached", {
      description: "You can compare up to 3 models at a time.",
    });
    act(() => result.current.toggleModel("four"));
    expect(result.current.selected).toEqual(["one", "two", "three"]);
    act(() => result.current.replaceComparisonModel("two", "four"));
    expect(result.current.selected).toEqual(["one", "three", "four"]);
    act(() => result.current.replaceComparisonModel("four", "four"));
    expect(result.current.selected).toEqual(["one", "three", "four"]);
    act(() => result.current.toggleModel("three"));
    expect(result.current.selected).toEqual(["one", "four"]);
  });

  it("falls back when transcription and TTS choices disappear", async () => {
    vi.useFakeTimers();
    vi.mocked(discoverModels)
      .mockResolvedValueOnce(
        discovery({
          transcription_models: ["transcribe-a", "transcribe-b"],
          traditional_transcription_models: ["whisper-a", "whisper-b"],
          tts_models: ["tts-a", "tts-b"],
        }),
      )
      .mockResolvedValueOnce(
        discovery({
          transcription_models: ["transcribe-next"],
          traditional_transcription_models: ["whisper-next"],
          tts_models: ["tts-next"],
        }),
      );
    const { result } = setup({ canUseProtectedApis: true });
    await flushPromises();
    act(() => {
      result.current.setTranscriptionModel("transcribe-b");
      result.current.setTraditionalTranscriptionModel("whisper-b");
      result.current.setTtsModel("tts-b");
    });

    act(() => vi.advanceTimersByTime(5 * 60_000));
    await flushPromises();
    expect(result.current.transcriptionModel).toBe("transcribe-next");
    expect(result.current.traditionalTranscriptionModel).toBe("whisper-next");
    expect(result.current.ttsModel).toBe("tts-next");
  });
});
