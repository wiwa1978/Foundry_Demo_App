import { useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";

import { captionMedia, type CaptioningResult } from "./api";

export function useCaptioning({
  fetchClient,
  defaultTranscriptionModel = "",
}: {
  fetchClient: FetchClient;
  defaultTranscriptionModel?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en-US");
  const [transcriptionModel, setTranscriptionModel] = useState(
    defaultTranscriptionModel,
  );
  const [result, setResult] = useState<CaptioningResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function caption() {
    if (!file || loading) return;
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await captionMedia(
          fetchClient,
          file,
          { language, transcriptionModel },
          next.signal,
        ),
      );
    } catch (e) {
      if (!next.signal.aborted)
        setError(e instanceof Error ? e.message : "Captioning failed.");
    } finally {
      if (controller.current === next) {
        controller.current = null;
        setLoading(false);
      }
    }
  }
  function reset() {
    controller.current?.abort();
    setResult(null);
    setError("");
    setLoading(false);
  }
  return {
    file,
    language,
    transcriptionModel,
    result,
    loading,
    error,
    setFile,
    setLanguage,
    setTranscriptionModel,
    caption,
    reset,
  };
}
