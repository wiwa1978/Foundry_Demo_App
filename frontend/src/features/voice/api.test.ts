import { describe, expect, it, vi } from "vitest";

import {
  createRealtimeSession,
  createRealtimeTranscriptionSession,
  createRealtimeTranslationSession,
  liveInterpreterUrl,
  realtimeTranscriptionWebSocketUrl,
  realtimeTranslationWebSocketUrl,
  voiceLiveUrl,
} from "./api";

describe("Voice API", () => {
  it("creates a realtime session through the canonical endpoint", async () => {
    const fetchClient = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await createRealtimeSession(fetchClient, {
      model: "realtime",
      instructions: "Be concise",
      voice: "alloy",
    });
    expect(fetchClient).toHaveBeenCalledWith(
      "/api/realtime/session",
      expect.objectContaining({ method: "POST" }),
      expect.any(Object),
    );
  });

  it("sends the selected realtime transcription model and turn detection", async () => {
    const fetchClient = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await createRealtimeTranscriptionSession(fetchClient, {
      model: "gpt-live-transcribe",
      language: "en",
      delay: null,
      turn_detection: "semantic_vad",
    });

    expect(fetchClient).toHaveBeenCalledWith(
      "/api/realtime-transcription/session",
      expect.objectContaining({
        body: JSON.stringify({
          model: "gpt-live-transcribe",
          language: "en",
          delay: null,
          turn_detection: "semantic_vad",
        }),
      }),
      expect.any(Object),
    );
    expect(
      realtimeTranscriptionWebSocketUrl({
        model: "gpt-live-transcribe",
        turnDetection: "semantic_vad",
      }),
    ).toContain("model=gpt-live-transcribe");
    expect(
      realtimeTranscriptionWebSocketUrl({
        model: "gpt-live-transcribe",
        turnDetection: "semantic_vad",
      }),
    ).toContain("turnDetection=semantic_vad");
    expect(
      realtimeTranslationWebSocketUrl({
        targetLanguage: "fr",
        sourceLanguage: "en",
        model: "gpt-realtime-translate-preview",
        transcriptionModel: "gpt-realtime-whisper",
      }),
    ).toContain("sourceLanguage=en");
    expect(
      realtimeTranslationWebSocketUrl({
        targetLanguage: "fr",
        sourceLanguage: "en",
        model: "gpt-realtime-translate-preview",
        transcriptionModel: "gpt-realtime-whisper",
      }),
    ).toContain("transcriptionModel=gpt-realtime-whisper");
    expect(
      realtimeTranslationWebSocketUrl({
        targetLanguage: "fr",
        sourceLanguage: "auto",
        model: "gpt-realtime-translate-preview",
      }),
    ).not.toContain("sourceLanguage");
  });

  it("creates a realtime translation WebRTC session with selected languages", async () => {
    const fetchClient = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    await createRealtimeTranslationSession(fetchClient, {
      model: "gpt-realtime-translate-preview",
      sourceLanguage: "en",
      targetLanguage: "nl",
      transcriptionModel: "gpt-realtime-whisper",
    });

    expect(fetchClient).toHaveBeenCalledWith(
      "/api/realtime-translation/session",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          model: "gpt-realtime-translate-preview",
          source_language: "en",
          target_language: "nl",
          transcription_model: "gpt-realtime-whisper",
        }),
      }),
      expect.any(Object),
    );
  });
  it("builds same-origin secure websocket URLs", () => {
    expect(voiceLiveUrl()).toContain("/api/voice-live");
    expect(liveInterpreterUrl()).toContain("/api/live-interpreter");
  });
});
