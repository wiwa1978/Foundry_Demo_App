import { useCallback, useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";
import { getImageSample, listImageSamples } from "@/features/images/api";
import type { ImageSample } from "@/features/images/api";

import { extractContent } from "./api";
import {
  getContentExtractorSample,
  listContentExtractorSamples,
} from "./samplesApi";
import {
  contentExtractorDefaultDocumentAnalyzer,
  type ContentExtractorDocumentAnalyzer,
  type ContentExtractorMode,
  type ContentExtractorResult,
  type ContentExtractorSample,
} from "./types";

export function useContentExtractor({
  fetchClient,
}: {
  fetchClient: FetchClient;
}) {
  const [mode, setMode] = useState<ContentExtractorMode>("image");
  const [analyzer, setAnalyzer] = useState<ContentExtractorDocumentAnalyzer>(
    contentExtractorDefaultDocumentAnalyzer,
  );
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ContentExtractorResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [samples, setSamples] = useState<ImageSample[]>([]);
  const [contentSamples, setContentSamples] = useState<
    ContentExtractorSample[]
  >([]);
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
          { mode, file: nextFile, analyzer },
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
    [analyzer, fetchClient, mode],
  );

  const extract = useCallback(async () => {
    await runExtraction(file);
  }, [file, runExtraction]);

  const selectSample = useCallback(
    async (sample: ImageSample | ContentExtractorSample) => {
      setSamplesLoading(true);
      setSampleError("");
      try {
        const sampleFile =
          "image_url" in sample
            ? await getImageSample(fetchClient, sample)
            : await getContentExtractorSample(fetchClient, sample);
        await runExtraction(sampleFile);
      } catch (caught) {
        setSampleError(
          caught instanceof Error
            ? caught.message
            : "Could not load Content Extractor sample.",
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

  useEffect(() => {
    if (mode === "image") {
      setContentSamples([]);
      return;
    }
    const controller = new AbortController();
    setSamplesLoading(true);
    setSampleError("");
    void listContentExtractorSamples(fetchClient, mode, controller.signal)
      .then(setContentSamples)
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        setSampleError(
          caught instanceof Error
            ? caught.message
            : `Could not load ${mode} samples.`,
        );
      })
      .finally(() => setSamplesLoading(false));
    return () => controller.abort();
  }, [fetchClient, mode]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    mode,
    analyzer,
    file,
    result,
    loading,
    error,
    samples,
    contentSamples,
    samplesLoading,
    sampleError,
    setMode,
    setAnalyzer,
    setFile,
    extractFile: runExtraction,
    selectSample,
    extract,
    reset,
  };
}
