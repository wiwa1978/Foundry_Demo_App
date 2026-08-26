import { describe, expect, it } from "vitest";

import type { UseCaseModule } from "./types";
import { registerUseCases, useCaseModules } from "./useCaseRegistry";

describe("useCaseModules", () => {
  it("registers each use case exactly once", () => {
    const ids = useCaseModules.map((useCase) => useCase.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("text_chat");
    expect(ids).toContain("youtube_summary");
  });

  it("provides complete marketplace metadata", () => {
    for (const useCase of useCaseModules) {
      expect(useCase.title).not.toBe("");
      expect(useCase.modalities.length).toBeGreaterThan(0);
      expect(useCase.implementation.length).toBeGreaterThan(0);
      expect(useCase.codeSnippet.code).not.toBe("");
    }
  });

  it("rejects duplicate and incomplete registrations", () => {
    const module = useCaseModules[0];
    expect(() => registerUseCases([module, module])).toThrow(
      "Duplicate use-case registration",
    );
    expect(() =>
      registerUseCases([{ ...module, title: "" } as UseCaseModule]),
    ).toThrow("Incomplete use-case registration");
  });

  it("uses the requested media labels", () => {
    const mediaLabels = useCaseModules
      .filter((useCase) => (useCase.category ?? "media") === "media")
      .map((useCase) => ({
        id: useCase.id,
        title: useCase.title,
        badge: useCase.badge,
        typeLabel: useCase.typeLabel ?? null,
      }));

    expect(mediaLabels).toEqual([
      { id: "text_chat", title: "Text Chat", badge: "Text", typeLabel: null },
      {
        id: "comparison",
        title: "Side by Side – Text Chat",
        badge: "Text",
        typeLabel: null,
      },
      {
        id: "reasoning_comparison",
        title: "Reasoning Arena",
        badge: "Text",
        typeLabel: "Reasoning",
      },
      {
        id: "document_qa",
        title: "Document Q&A",
        badge: "Text",
        typeLabel: null,
      },
      {
        id: "content_extractor",
        title: "Content Extractor",
        badge: "Text",
        typeLabel: "Content Understanding",
      },
      {
        id: "text_translation",
        title: "Azure Translator",
        badge: "Text",
        typeLabel: "Detection + Translation",
      },
      {
        id: "pii_redaction",
        title: "Azure Language",
        badge: "Text",
        typeLabel: "PII Redaction",
      },
      {
        id: "text_analytics_health",
        title: "Azure Language",
        badge: "Text",
        typeLabel: "Text Analytics for Health",
      },
      {
        id: "text_to_image",
        title: "Text to Image",
        badge: "Image",
        typeLabel: null,
      },
      {
        id: "image_comparison",
        title: "Side by Side – Text Image",
        badge: "Image",
        typeLabel: null,
      },
      {
        id: "image_to_image",
        title: "Image to Image",
        badge: "Image",
        typeLabel: null,
      },
      {
        id: "youtube_summary",
        title: "Youtube Video Summarization",
        badge: "Audio",
        typeLabel: "Transcription",
      },
      {
        id: "youtube_realtime_transcription",
        title: "Youtube Video Transcription",
        badge: "Audio",
        typeLabel: "Realtime Transcription",
      },
      {
        id: "captioning",
        title: "Captioning",
        badge: "Video",
        typeLabel: "Timed captions",
      },
      {
        id: "dubbing",
        title: "Dubbing",
        badge: "Audio",
        typeLabel: "Translated audio",
      },
      {
        id: "video_translation",
        title: "Video Translation",
        badge: "Video",
        typeLabel: "Prototype translated video",
      },
      {
        id: "browser_voice",
        title: "Browser based Voice",
        badge: "Audio",
        typeLabel: null,
      },
      {
        id: "traditional_voice",
        title: "STT-Chat-TTS",
        badge: "Audio",
        typeLabel: null,
      },
      {
        id: "language_learning",
        title: "Language Learning",
        badge: "Speech AI",
        typeLabel: null,
      },
      {
        id: "azure_speech_tts",
        title: "Azure Speech Text to Speech",
        badge: "Audio",
        typeLabel: null,
      },
      {
        id: "text_to_speech_avatar",
        title: "Azure Speech Text to Speech Avatar",
        badge: "Video",
        typeLabel: "Text to Speech Avatar",
      },
      {
        id: "foundry_gpt_audio",
        title: "Foundry GPT Audio",
        badge: "Audio",
        typeLabel: null,
      },
      {
        id: "transcribe",
        title: "Recorded Audio Transcription",
        badge: "Audio",
        typeLabel: "Transcription",
      },
      {
        id: "transcription_comparison",
        title: "Side by Side Recorded Audio Transcription",
        badge: "Audio",
        typeLabel: "Transcription",
      },
      {
        id: "realtime_transcription_webrtc",
        title: "Realtime Transcription webrtc",
        badge: "Audio",
        typeLabel: "Realtime Transcription",
      },
      {
        id: "realtime_transcription_websocket",
        title: "Realtime Transcription websockets",
        badge: "Audio",
        typeLabel: "Realtime Transcription",
      },
      {
        id: "realtime_translation_webrtc",
        title: "GPT Realtime Translation webrtc",
        badge: "Audio",
        typeLabel: "Foundry Realtime Translation",
      },
      {
        id: "realtime_translation_websocket",
        title: "GPT Realtime Translation websockets",
        badge: "Audio",
        typeLabel: "Foundry Realtime Translation",
      },
      {
        id: "live_translation",
        title: "Azure Speech Live Translation",
        badge: "Audio",
        typeLabel: "Azure Speech Translation",
      },
      {
        id: "realtime_voice",
        title: "Realtime Speech in / Speech Out",
        badge: "Audio",
        typeLabel: null,
      },
      {
        id: "voice_live",
        title: "Voice Live travel Concierge",
        badge: "Audio",
        typeLabel: null,
      },
      {
        id: "live_chat_avatar",
        title: "Live Chat Avatar",
        badge: "Audio + video",
        typeLabel: null,
      },
    ]);
  });
});
