import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadModelMetrics } from "@/api/metrics";
import type { FetchClient, ModelMetrics } from "@/api/types";

export type ModelMetricSnapshot = {
  model: string;
  metrics: ModelMetrics | null;
};

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function normalizeModels(models: readonly string[]) {
  return Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean)),
  ).sort((left, right) => left.localeCompare(right));
}

export function useModelMonitoring({
  fetchClient,
  enabled,
  models,
}: {
  fetchClient: FetchClient;
  enabled: boolean;
  models: readonly string[];
}) {
  const monitoredModels = useMemo(() => normalizeModels(models), [models]);
  const modelsKey = monitoredModels.join("\u0000");
  const [aggregateMetrics, setAggregateMetrics] = useState<ModelMetrics | null>(
    null,
  );
  const [modelMetrics, setModelMetrics] = useState<ModelMetricSnapshot[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    generationRef.current += 1;
    const generation = generationRef.current;
    const snapshotModels = modelsKey ? modelsKey.split("\u0000") : [];

    setLoading(true);
    setError("");

    try {
      const aggregate = await loadModelMetrics(
        fetchClient,
        days,
        "",
        controller.signal,
      );
      const perModel = await Promise.all(
        snapshotModels.map(async (model) => {
          try {
            return {
              model,
              metrics: await loadModelMetrics(
                fetchClient,
                days,
                model,
                controller.signal,
              ),
            };
          } catch (modelError) {
            if (isAbortError(modelError) || controller.signal.aborted) {
              throw modelError;
            }
            return { model, metrics: null };
          }
        }),
      );

      if (generation === generationRef.current && !controller.signal.aborted) {
        setAggregateMetrics(aggregate);
        setModelMetrics(perModel);
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
            : "Failed to load model monitoring metrics.",
        );
      }
    } finally {
      if (generation === generationRef.current) {
        setLoading(false);
      }
    }
  }, [days, enabled, fetchClient, modelsKey]);

  useEffect(() => {
    if (!enabled) {
      generationRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
      setLoading(false);
      return;
    }

    void refresh();
    return () => {
      generationRef.current += 1;
      controllerRef.current?.abort();
    };
  }, [enabled, refresh]);

  return {
    aggregateMetrics,
    modelMetrics,
    days,
    loading,
    error,
    setDays,
    refresh,
  };
}
