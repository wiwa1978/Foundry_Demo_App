import { useCallback, useEffect, useRef, useState } from "react";

import { loadModelMetrics } from "@/api/metrics";
import type { FetchClient, ModelMetrics } from "@/api/types";

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function useModelMetrics({
  fetchClient,
  enabled,
}: {
  fetchClient: FetchClient;
  enabled: boolean;
}) {
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [days, setDays] = useState(7);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled) {
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    generationRef.current += 1;
    const generation = generationRef.current;
    setLoading(true);
    setError("");

    try {
      const result = await loadModelMetrics(
        fetchClient,
        days,
        model,
        controller.signal,
      );
      if (generation === generationRef.current && !controller.signal.aborted) {
        setMetrics(result);
      }
    } catch (loadError) {
      if (
        generation === generationRef.current &&
        !controller.signal.aborted &&
        !isAbortError(loadError)
      ) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load model metrics.",
        );
      }
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
      }
    }
  }, [days, enabled, fetchClient, model]);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      setLoading(false);
      return;
    }

    void load();
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [enabled, load]);

  return {
    metrics,
    days,
    model,
    loading,
    error,
    setDays,
    setModel,
    load,
    refresh: load,
  };
}
