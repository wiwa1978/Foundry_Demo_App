import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ModelMetrics } from "@/api/types";

import {
  ModelMonitoringPage,
  type ModelUsageSummary,
} from "./ModelMonitoringPage";

function metrics(requests: number, tokens: number): ModelMetrics {
  return {
    days: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-08-${String(index + 1).padStart(2, "0")}`,
      label: `${String(index + 1).padStart(2, "0")}/08`,
      requests: index === 6 ? requests : index + 1,
      prompt_tokens: Math.floor(tokens / 2),
      completion_tokens: Math.ceil(tokens / 2),
      total_tokens: index === 6 ? tokens : (index + 1) * 10,
      estimated_cost: 0,
      total_duration_ms: 100,
      duration_count: 1,
      avg_duration_ms: 100,
    })),
    models: [],
    summary: {
      requests,
      prompt_tokens: Math.floor(tokens / 2),
      completion_tokens: Math.ceil(tokens / 2),
      total_tokens: tokens,
      estimated_cost: 0.01,
      avg_prompt_tokens: 10,
      avg_completion_tokens: 10,
      avg_total_tokens: 20,
      avg_duration_ms: 100,
    },
  };
}

const usages: ModelUsageSummary[] = [
  {
    model: "quiet-model",
    useCases: ["Text Chat"],
    roles: ["Chat completion"],
  },
  {
    model: "busy-model",
    useCases: ["Youtube Video Summarization"],
    roles: ["Summarization"],
  },
];

describe("ModelMonitoringPage", () => {
  it("uses app-recorded labels, removes the use-case column, sorts by requests, and expands separate 7D graphs", async () => {
    const user = userEvent.setup();
    render(
      <ModelMonitoringPage
        modelUsages={usages}
        aggregateMetrics={metrics(12, 240)}
        modelMetrics={[
          { model: "quiet-model", metrics: metrics(2, 40) },
          { model: "busy-model", metrics: metrics(10, 200) },
        ]}
        days={7}
        loading={false}
        error=""
        onDaysChange={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("App-recorded requests")).toBeInTheDocument();
    expect(screen.getByText("App-recorded tokens")).toBeInTheDocument();
    expect(screen.getByText("App-measured latency")).toBeInTheDocument();
    expect(screen.getByText("Estimated app cost")).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Use cases" }),
    ).not.toBeInTheDocument();

    const rows = screen.getAllByRole("row");
    expect(within(rows[1]).getByText("BUSY-MODEL")).toBeInTheDocument();
    expect(within(rows[2]).getByText("QUIET-MODEL")).toBeInTheDocument();
    expect(screen.queryByText("7D requests")).not.toBeInTheDocument();

    await user.click(
      within(rows[1]).getByRole("button", { name: "Show 7D graphs" }),
    );

    expect(screen.getByText("7D requests")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("7D tokens")).toBeInTheDocument();
    expect(screen.getByText("410")).toBeInTheDocument();
    expect(screen.getAllByText("01/08").length).toBe(2);
    expect(screen.getAllByText("07/08").length).toBe(2);
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("img", { name: "Latest 7D requests 31" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Latest 7D tokens 410" }),
    ).toBeInTheDocument();
    expect(screen.getByText("07/08: 10 requests")).toBeInTheDocument();
    expect(screen.getByText("07/08: 200 tokens")).toBeInTheDocument();
  });
});
