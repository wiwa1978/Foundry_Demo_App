import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadModelMetrics } from "@/api/metrics";
import type { FetchClient, ModelMetrics } from "@/api/types";

import { useModelMonitoring } from "./useModelMonitoring";

vi.mock("@/api/metrics", () => ({ loadModelMetrics: vi.fn() }));

const fetchClient = vi.fn<FetchClient>();

function metrics(requests: number): ModelMetrics {
  return {
    days: [],
    models: [],
    summary: {
      requests,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
      estimated_cost: 0,
      avg_prompt_tokens: 0,
      avg_completion_tokens: 0,
      avg_total_tokens: 0,
      avg_duration_ms: 0,
    },
  };
}

describe("useModelMonitoring", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps aggregate metrics when one per-model request fails", async () => {
    vi.mocked(loadModelMetrics)
      .mockResolvedValueOnce(metrics(10))
      .mockResolvedValueOnce(metrics(4))
      .mockRejectedValueOnce(new Error("model not found"));

    const { result } = renderHook(() =>
      useModelMonitoring({
        fetchClient,
        enabled: true,
        models: ["model-a", "model-b"],
      }),
    );

    await waitFor(() =>
      expect(result.current.aggregateMetrics).toEqual(metrics(10)),
    );
    expect(result.current.modelMetrics).toEqual([
      { model: "model-a", metrics: metrics(4) },
      { model: "model-b", metrics: null },
    ]);
    expect(result.current.error).toBe("");
  });
});
