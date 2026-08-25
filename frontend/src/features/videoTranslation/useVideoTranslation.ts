import { useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";

import { translateVideo, type VideoTranslationResult } from "./api";

export function useVideoTranslation({ fetchClient, defaultTranscriptionModel = "" }: {
  fetchClient: FetchClient; defaultTranscriptionModel?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("es");
  const [voice, setVoice] = useState("es-ES-ElviraNeural");
  const [transcriptionModel, setTranscriptionModel] = useState(defaultTranscriptionModel);
  const [result, setResult] = useState<VideoTranslationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function translate() {
    if (!file || loading) return;
    controller.current?.abort(); const next = new AbortController(); controller.current = next;
    setLoading(true); setError(""); setResult(null);
    try { setResult(await translateVideo(fetchClient, file, { sourceLanguage, targetLanguage, voice, transcriptionModel }, next.signal)); }
    catch (e) { if (!next.signal.aborted) setError(e instanceof Error ? e.message : "Video translation failed."); }
    finally { if (controller.current === next) { controller.current = null; setLoading(false); } }
  }
  function reset() { controller.current?.abort(); setResult(null); setError(""); setLoading(false); }
  return { file, sourceLanguage, targetLanguage, voice, transcriptionModel, result, loading, error,
    setFile, setSourceLanguage, setTargetLanguage, setVoice, setTranscriptionModel, translate, reset };
}
