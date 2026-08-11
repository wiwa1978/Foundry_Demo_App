import { useEffect, useRef, useState } from "react";

import type { FetchClient } from "@/api/types";
import type {
  FoundryRequestTrace,
  FoundryResponseTrace,
} from "@/features/textChat/types";

import { summarizeYouTubeVideo } from "./api";
import type { YouTubeSummaryResult } from "./types";

export function useYouTubeSummary({
  fetchClient,
  appendFoundryTrace,
  appendFoundryResponseTrace,
}: {
  fetchClient: FetchClient;
  appendFoundryTrace: (trace: FoundryRequestTrace, label: string) => void;
  appendFoundryResponseTrace: (
    trace: FoundryResponseTrace,
    label: string,
  ) => void;
}) {
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("en");
  const [result, setResult] = useState<YouTubeSummaryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function summarize(
    model: string,
    transcriptionModel: string | null,
    reasoningEffort: string | null,
  ) {
    const normalizedUrl = url.trim();
    if (!normalizedUrl || !model || loading) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const nextResult = await summarizeYouTubeVideo({
        fetchClient,
        url: normalizedUrl,
        model,
        transcriptionModel,
        language,
        reasoningEffort,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setResult(nextResult);
      nextResult.foundry_requests.forEach((trace, index) =>
        appendFoundryTrace(trace, `YouTube summary request ${index + 1}`),
      );
      nextResult.foundry_responses.forEach((trace, index) =>
        appendFoundryResponseTrace(
          trace,
          `YouTube summary response ${index + 1}`,
        ),
      );
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to summarize video.",
        );
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }

  function invalidate() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
  }

  return {
    url,
    setUrl,
    language,
    setLanguage,
    result,
    loading,
    error,
    summarize,
    invalidate,
  };
}
