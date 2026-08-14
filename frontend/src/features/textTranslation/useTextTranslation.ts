import { useCallback, useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";

import { translateText } from "./api";
import type { TextTranslationResult } from "./types";

const defaultSourceText =
  "Doctor is available next Monday. Do you want to schedule an appointment?";

export function useTextTranslation({ fetchClient }: { fetchClient: FetchClient }) {
  const [sourceText, setSourceText] = useState(defaultSourceText);
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [result, setResult] = useState<TextTranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
    setError("");
    setResult(null);
  }, []);

  const translate = useCallback(async () => {
    const text = sourceText.trim();
    if (!text) {
      setError("Enter source text to translate.");
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
  }, [fetchClient, sourceLanguage, sourceText, targetLanguage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    sourceText,
    sourceLanguage,
    targetLanguage,
    result,
    loading,
    error,
    setSourceText,
    setSourceLanguage,
    setTargetLanguage,
    translate,
    reset,
  };
}
