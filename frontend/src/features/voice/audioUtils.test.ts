import { afterEach, describe, expect, it, vi } from "vitest";

import type { TraditionalVoiceResult } from "@/app/workspace/contracts";
import {
  convertAudioToWav,
  downloadText,
  encodePcmWav,
  summarizeTraditionalVoiceResult,
} from "@/features/voice/audioUtils";

function readBlob(blob: Blob) {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () =>
      resolve(reader.result as ArrayBuffer),
    );
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsArrayBuffer(blob);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("voice audio utilities", () => {
  it("encodes a valid mono 16-bit PCM WAV and clamps out-of-range samples", async () => {
    const wav = encodePcmWav(
      new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]),
      16_000,
    );
    const view = new DataView(await readBlob(wav));
    const text = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(view.buffer, offset, length));

    expect(wav.type).toBe("audio/wav");
    expect(wav.size).toBe(58);
    expect(text(0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(50);
    expect(text(8, 4)).toBe("WAVE");
    expect(text(12, 4)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(28, true)).toBe(32_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(14);
    expect(
      Array.from({ length: 7 }, (_, index) =>
        view.getInt16(44 + index * 2, true),
      ),
    ).toEqual([-32768, -32768, -16384, 0, 16383, 32767, 32767]);
  });

  it("mixes decoded channels to mono, resamples to 16 kHz, and closes the decoder", async () => {
    const decoded = {
      duration: 2 / 16_000,
      length: 2,
      sampleRate: 48_000,
      numberOfChannels: 2,
      getChannelData: (channel: number) =>
        channel === 0 ? new Float32Array([1, -1]) : new Float32Array([0, 0.5]),
    };
    const decodeAudioData = vi.fn().mockResolvedValue(decoded);
    const close = vi.fn().mockResolvedValue(undefined);
    const monoData = new Float32Array(2);
    const createBuffer = vi.fn().mockReturnValue({
      getChannelData: () => monoData,
    });
    const connect = vi.fn();
    const start = vi.fn();
    const createBufferSource = vi
      .fn()
      .mockReturnValue({ buffer: null, connect, start });
    const startRendering = vi.fn().mockImplementation(async () => ({
      getChannelData: () => monoData,
    }));
    const offlineConstructor = vi.fn();

    class MockAudioContext {
      decodeAudioData = decodeAudioData;
      close = close;
    }

    class MockOfflineAudioContext {
      destination = { kind: "destination" };
      createBuffer = createBuffer;
      createBufferSource = createBufferSource;
      startRendering = startRendering;

      constructor(channels: number, frameCount: number, sampleRate: number) {
        offlineConstructor(channels, frameCount, sampleRate);
      }
    }

    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("OfflineAudioContext", MockOfflineAudioContext);
    const encodedInput = new ArrayBuffer(8);
    const source = new Blob(["encoded audio"]);
    Object.defineProperty(source, "arrayBuffer", {
      configurable: true,
      value: vi.fn().mockResolvedValue(encodedInput),
    });

    const result = await convertAudioToWav(source);
    const resultView = new DataView(await readBlob(result));

    expect(decodeAudioData).toHaveBeenCalledWith(encodedInput);
    expect(offlineConstructor).toHaveBeenCalledWith(1, 2, 16_000);
    expect(createBuffer).toHaveBeenCalledWith(1, 2, 48_000);
    expect(Array.from(monoData)).toEqual([0.5, -0.25]);
    expect(connect).toHaveBeenCalledWith({ kind: "destination" });
    expect(start).toHaveBeenCalledOnce();
    expect(startRendering).toHaveBeenCalledOnce();
    expect(resultView.getInt16(44, true)).toBe(16383);
    expect(resultView.getInt16(46, true)).toBe(-8192);
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the audio context when decoding fails", async () => {
    const decodeError = new Error("unsupported audio");
    const close = vi.fn().mockResolvedValue(undefined);

    class MockAudioContext {
      decodeAudioData = vi.fn().mockRejectedValue(decodeError);
      close = close;
    }

    vi.stubGlobal("AudioContext", MockAudioContext);
    const source = new Blob(["invalid audio"]);
    Object.defineProperty(source, "arrayBuffer", {
      configurable: true,
      value: vi.fn().mockResolvedValue(new ArrayBuffer(1)),
    });

    await expect(convertAudioToWav(source)).rejects.toBe(decodeError);
    expect(close).toHaveBeenCalledOnce();
  });

  it("downloads text through a temporary object URL and revokes it", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:download");
    const revokeObjectURL = vi.fn();
    const link = document.createElement("a");
    const click = vi.spyOn(link, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    vi.spyOn(document, "createElement").mockReturnValue(link);

    downloadText("trace output", "trace.txt");

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob).toMatchObject({ size: 12, type: "text/plain;charset=utf-8" });
    expect(link.href).toBe("blob:download");
    expect(link.download).toBe("trace.txt");
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:download");
  });

  it("summarizes voice results without retaining raw audio or Foundry payloads", () => {
    const result: TraditionalVoiceResult = {
      model: "gpt-4o-audio",
      transcription: {
        model: "whisper",
        text: "Hello",
        duration_ms: 25,
        foundry_request: { payload: { audio: "raw input" } },
      },
      results: [
        {
          model: "gpt-4.1",
          content: "Hi there",
          api_surface: "responses",
          duration_ms: 50,
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
          guardrail_variant: "guarded",
          guardrail_policy_name: "Strict",
          guardrail_results: { safe: true },
          assistant_message: {
            id: "assistant-1",
            conversation_id: "conversation-1",
            role: "assistant",
            content: "Hi there",
            model: "gpt-4.1",
            api_surface: "responses",
            duration_ms: 50,
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
            error: null,
            guardrail_variant: "guarded",
            guardrail_policy_name: "Strict",
            guardrail_results: { safe: true },
            created_at: "2025-01-01T00:00:01.000Z",
          },
          foundry_response: {
            api_surface: "responses",
            payload: { content: "raw model output" },
          },
          speech: {
            model: "tts-1",
            voice: "alloy",
            audio_base64: "private-audio",
            audio_mime_type: "audio/mpeg",
            duration_ms: 30,
            foundry_response: { payload: { audio: "raw speech payload" } },
          },
        },
        {
          model: "gpt-4.1-mini",
          content: "Unable to synthesize",
          error: "model error",
          speech_error: "speech error",
          assistant_message: {
            id: "assistant-2",
            conversation_id: "conversation-1",
            role: "assistant",
            content: "Unable to synthesize",
            model: "gpt-4.1-mini",
            api_surface: null,
            duration_ms: null,
            usage: null,
            error: "model error",
            guardrail_variant: null,
            guardrail_policy_name: null,
            guardrail_results: null,
            created_at: "2025-01-01T00:00:02.000Z",
          },
        },
      ],
      conversation: {
        id: "conversation-1",
        title: "Voice chat",
        use_case: "traditional_voice",
        created_at: "2025-01-01T00:00:00.000Z",
        updated_at: "2025-01-01T00:00:02.000Z",
      },
      user_message: {
        id: "user-1",
        conversation_id: "conversation-1",
        role: "user",
        content: "Hello",
        model: null,
        api_surface: null,
        duration_ms: null,
        usage: null,
        error: null,
        guardrail_variant: null,
        guardrail_policy_name: null,
        guardrail_results: null,
        created_at: "2025-01-01T00:00:00.000Z",
      },
    };

    const summary = summarizeTraditionalVoiceResult(result);

    expect(summary.results[0].speech).toEqual({
      model: "tts-1",
      voice: "alloy",
      audio_mime_type: "audio/mpeg",
      audio_base64_bytes: 13,
      duration_ms: 30,
    });
    expect(summary.results[1].speech).toBeNull();
    expect(summary.results[1].speech_error).toBe("speech error");
    expect(summary.transcription).toEqual({
      model: "whisper",
      text: "Hello",
      duration_ms: 25,
    });
    expect(summary.conversation).toBe(result.conversation);
    expect(JSON.stringify(summary)).not.toContain("private-audio");
    expect(JSON.stringify(summary)).not.toContain("raw speech payload");
    expect(JSON.stringify(summary)).not.toContain("raw model output");
  });
});
