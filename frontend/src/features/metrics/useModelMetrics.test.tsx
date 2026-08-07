import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FetchClient, ModelMetrics } from "@/api/types";

import { useModelMetrics } from "./useModelMetrics";
import { loadModelMetrics } from "../../api/metrics";

vi.mock("../../api/metrics", () => ({ loadModelMetrics: vi.fn() }));

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

describe("useModelMetrics", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only while enabled and reloads for filters", async () => {
    vi.mocked(loadModelMetrics)
      .mockResolvedValueOnce(metrics(1))
      .mockResolvedValueOnce(metrics(2))
      .mockResolvedValueOnce(metrics(3));
    const { result, rerender } = renderHook(
      ({ enabled }) => useModelMetrics({ fetchClient, enabled }),
      { initialProps: { enabled: false } },
    );

    expect(loadModelMetrics).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.metrics).toEqual(metrics(1)));

    act(() => result.current.setDays(30));
    await waitFor(() => expect(result.current.metrics).toEqual(metrics(2)));
    act(() => result.current.setModel("gpt-4.1"));
    await waitFor(() => expect(result.current.metrics).toEqual(metrics(3)));

    expect(loadModelMetrics).toHaveBeenLastCalledWith(
      fetchClient,
      30,
      "gpt-4.1",
      expect.any(AbortSignal),
    );
  });

  it("aborts overlap and prevents an older response from overwriting newer data", async () => {
    let resolveFirst: (value: ModelMetrics) => void = () => undefined;
    let resolveSecond: (value: ModelMetrics) => void = () => undefined;
    vi.mocked(loadModelMetrics)
      .mockImplementationOnce(
        (_client, _days, _model, signal) =>
          new Promise((resolve) => {
            expect(signal?.aborted).toBe(false);
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const { result } = renderHook(() =>
      useModelMetrics({ fetchClient, enabled: true }),
    );
    await waitFor(() => expect(loadModelMetrics).toHaveBeenCalledOnce());
    const firstSignal = vi.mocked(loadModelMetrics).mock.calls[0][3];

    act(() => result.current.setDays(30));
    await waitFor(() => expect(loadModelMetrics).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => resolveSecond(metrics(2)));
    expect(result.current.metrics).toEqual(metrics(2));
    await act(async () => resolveFirst(metrics(1)));
    expect(result.current.metrics).toEqual(metrics(2));
    expect(result.current.loading).toBe(false);
  });

  it("reports failures and clears loading when disabled", async () => {
    vi.mocked(loadModelMetrics).mockRejectedValueOnce("offline");
    const { result, rerender } = renderHook(
      ({ enabled }) => useModelMetrics({ fetchClient, enabled }),
      { initialProps: { enabled: true } },
    );

    await waitFor(() =>
      expect(result.current.error).toBe("Failed to load model metrics."),
    );
    rerender({ enabled: false });
    expect(result.current.loading).toBe(false);
  });

  it("does not publish a request that completes after unmount", async () => {
    let resolveRequest: (value: ModelMetrics) => void = () => undefined;
    vi.mocked(loadModelMetrics).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRequest = resolve)),
    );
    const { result, unmount } = renderHook(() =>
      useModelMetrics({ fetchClient, enabled: true }),
    );
    await waitFor(() => expect(result.current.loading).toBe(true));
    const signal = vi.mocked(loadModelMetrics).mock.calls[0][3];

    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => resolveRequest(metrics(1)));
  });
});
