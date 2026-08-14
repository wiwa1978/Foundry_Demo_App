import { useCallback, useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";
import { getImageSample, listImageSamples } from "@/features/images/api";
import type { ImageSample } from "@/features/images/api";

import { extractContent } from "./api";
import type { ContentExtractorMode, ContentExtractorResult } from "./types";

export function useContentExtractor({
  fetchClient,
}: {
  fetchClient: FetchClient;
}) {
  const [mode, setMode] = useState<ContentExtractorMode>("image");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ContentExtractorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [samples, setSamples] = useState<ImageSample[]>([]);
  const [samplesLoading, setSamplesLoading] = useState(true);
  const [sampleError, setSampleError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setFile(null);
    setResult(null);
    setError("");
    setLoading(false);
  }, []);

  const runExtraction = useCallback(
    async (nextFile: File | null) => {
      setFile(nextFile);
      setResult(null);
      if (mode !== "image") {
        setError("Only image extraction is available right now.");
        return;
      }
      if (!nextFile) {
        setError("");
        return;
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError("");
      try {
        const nextResult = await extractContent(
          fetchClient,
          { mode, file: nextFile },
          controller.signal,
        );
        setResult(nextResult);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setError(
          caught instanceof Error
            ? caught.message
            : "Content extraction failed.",
        );
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setLoading(false);
        }
      }
    },
    [fetchClient, mode],
  );

  const extract = useCallback(async () => {
    await runExtraction(file);
  }, [file, runExtraction]);

  const selectSample = useCallback(
    async (sample: ImageSample) => {
      setSamplesLoading(true);
      setSampleError("");
      try {
        const sampleFile = await getImageSample(fetchClient, sample);
        await runExtraction(sampleFile);
      } catch (caught) {
        setSampleError(
          caught instanceof Error
            ? caught.message
            : "Could not load image sample.",
        );
      } finally {
        setSamplesLoading(false);
      }
    },
    [fetchClient, runExtraction],
  );

  useEffect(() => {
    const controller = new AbortController();
    setSamplesLoading(true);
    setSampleError("");
    void listImageSamples(fetchClient, controller.signal)
      .then(setSamples)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        setSampleError(
          caught instanceof Error
            ? caught.message
            : "Could not load image samples.",
        );
      })
      .finally(() => setSamplesLoading(false));
    return () => controller.abort();
  }, [fetchClient]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    mode,
    file,
    result,
    loading,
    error,
    samples,
    samplesLoading,
    sampleError,
    setMode,
    setFile,
    extractFile: runExtraction,
    selectSample,
    extract,
    reset,
  };
}
