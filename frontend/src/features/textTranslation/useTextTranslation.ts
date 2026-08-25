import { useCallback, useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";
import type { UseCaseId } from "@/app/types";

import { synthesizeText, translateText } from "./api";
import {
  AZURE_MT_ENGINE,
  azureMtModelOption,
  defaultModeByUseCase,
  isLanguageServiceUseCase,
  modeOptionsByUseCase,
  type LanguageServiceMode,
  type LanguageServiceUseCaseId,
  type TextTranslationResult,
  type TranslationModelOption,
} from "./types";

const speechSettingsByLanguage: Record<
  string,
  { language: string; voice: string }
> = {
  en: { language: "en-US", voice: "en-US-JennyNeural" },
  es: { language: "es-ES", voice: "es-ES-ElviraNeural" },
  fr: { language: "fr-FR", voice: "fr-FR-DeniseNeural" },
  de: { language: "de-DE", voice: "de-DE-KatjaNeural" },
  nl: { language: "nl-NL", voice: "nl-NL-ColetteNeural" },
  it: { language: "it-IT", voice: "it-IT-ElsaNeural" },
  pt: { language: "pt-BR", voice: "pt-BR-FranciscaNeural" },
  "zh-Hans": { language: "zh-CN", voice: "zh-CN-XiaoxiaoNeural" },
  ja: { language: "ja-JP", voice: "ja-JP-NanamiNeural" },
  ko: { language: "ko-KR", voice: "ko-KR-SunHiNeural" },
  ar: { language: "ar-SA", voice: "ar-SA-ZariyahNeural" },
  hi: { language: "hi-IN", voice: "hi-IN-SwaraNeural" },
};

export function useTextTranslation({
  fetchClient,
  activeUseCase,
  textModels = [],
}: {
  fetchClient: FetchClient;
  activeUseCase: UseCaseId;
  textModels?: string[];
}) {
  const [sourceText, setSourceText] = useState("");
  const [draftText, setDraftText] = useState("");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [model, setModel] = useState(AZURE_MT_ENGINE);
  const [modeByUseCase, setModeByUseCase] = useState<
    Record<LanguageServiceUseCaseId, LanguageServiceMode>
  >({
    ...defaultModeByUseCase,
  });
  const [result, setResult] = useState<TextTranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [audioEnabled, setAudioEnabledState] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const speechAbortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const resolvedUseCase: LanguageServiceUseCaseId = isLanguageServiceUseCase(
    activeUseCase,
  )
    ? activeUseCase
    : "text_translation";
  const modeOptions = modeOptionsByUseCase[resolvedUseCase];
  const mode = modeByUseCase[resolvedUseCase];
  const activeModeOption = modeOptions.find((option) => option.value === mode);
  const modeImplemented = activeModeOption?.implemented ?? false;
  const modelOptions: TranslationModelOption[] = [
    azureMtModelOption,
    ...textModels.map((name) => ({ value: name, label: name })),
  ];

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setError("");
    setResult(null);
  }, []);

  const stopSpeaking = useCallback(() => {
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setSpeaking(false);
  }, []);

  const setAudioEnabled = useCallback(
    (enabled: boolean) => {
      setAudioEnabledState(enabled);
      if (!enabled) {
        stopSpeaking();
      }
    },
    [stopSpeaking],
  );

  const translate = useCallback(async () => {
    const text = draftText.trim();
    if (!text) {
      setError(
        mode === "translator_text"
          ? "Enter source text to translate."
          : "Enter source text to analyze.",
      );
      return;
    }
    setSourceText(text);
    stopSpeaking();
    if (!modeImplemented) {
      setError(
        `${activeModeOption?.label ?? "This mode"} requires an input type that is not available in the text composer.`,
      );
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const nextResult = await translateText(
        fetchClient,
        {
          text,
          source_language: sourceLanguage === "auto" ? null : sourceLanguage,
          target_language: targetLanguage,
          model,
          mode,
        },
        controller.signal,
      );
      setResult(nextResult);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }
      setError(
        caught instanceof Error ? caught.message : "Text translation failed.",
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, [
    activeModeOption?.label,
    draftText,
    fetchClient,
    mode,
    modeImplemented,
    model,
    sourceLanguage,
    stopSpeaking,
    targetLanguage,
  ]);

  const speakTranslation = useCallback(async () => {
    const text = result?.translated_text.trim();
    if (!audioEnabled || !text) {
      return;
    }
    const currentAudio = audioRef.current;
    if (currentAudio) {
      if (currentAudio.paused) {
        await currentAudio.play();
      } else {
        currentAudio.pause();
      }
      return;
    }

    const controller = new AbortController();
    speechAbortRef.current = controller;
    try {
      const speechSettings =
        speechSettingsByLanguage[targetLanguage] ?? speechSettingsByLanguage.en;
      const payload = await synthesizeText(
        fetchClient,
        {
          text,
          language: speechSettings.language,
          voice: speechSettings.voice,
        },
        controller.signal,
      );
      const binary = Uint8Array.from(atob(payload.audio_base64), (character) =>
        character.charCodeAt(0),
      );
      const audioUrl = URL.createObjectURL(
        new Blob([binary], {
          type: payload.audio_mime_type ?? "audio/mpeg",
        }),
      );
      const player = new Audio(audioUrl);
      player.onplay = () => setSpeaking(true);
      player.onpause = () => setSpeaking(false);
      player.onended = () => {
        setSpeaking(false);
        audioRef.current = null;
        URL.revokeObjectURL(audioUrl);
        audioUrlRef.current = null;
      };
      audioRef.current = player;
      audioUrlRef.current = audioUrl;
      await player.play();
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Azure Speech synthesis failed.",
        );
      }
    } finally {
      if (speechAbortRef.current === controller) {
        speechAbortRef.current = null;
      }
    }
  }, [audioEnabled, fetchClient, result, targetLanguage]);

  const setMode = useCallback(
    (nextMode: LanguageServiceMode) => {
      setModeByUseCase((current) => ({
        ...current,
        [resolvedUseCase]: nextMode,
      }));
      setResult(null);
      setError("");
    },
    [resolvedUseCase],
  );

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSourceText("");
    setDraftText("");
    setResult(null);
    setError("");
    setLoading(false);
    stopSpeaking();
  }, [resolvedUseCase, stopSpeaking]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopSpeaking();
    },
    [stopSpeaking],
  );

  return {
    useCase: resolvedUseCase,
    mode,
    modeOptions,
    modeImplemented,
    sourceText,
    draftText,
    sourceLanguage,
    targetLanguage,
    model,
    modelOptions,
    result,
    loading,
    error,
    audioEnabled,
    speaking,
    setDraftText,
    setAudioEnabled,
    setSourceLanguage,
    setTargetLanguage,
    setModel,
    setMode,
    translate,
    speakTranslation,
    reset,
  };
}
