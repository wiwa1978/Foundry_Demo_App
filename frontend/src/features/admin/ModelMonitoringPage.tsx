import { Fragment, useState } from "react";

import { BarChart3, Database, RefreshCw } from "lucide-react";

import type { ModelMetrics } from "@/api/types";
import {
  formatCompactNumber,
  formatCurrency,
  formatModelName,
} from "@/app/workspace/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ModelUsageSummary = {
  model: string;
  useCases: string[];
  roles: string[];
};

export type ModelMetricSnapshot = {
  model: string;
  metrics: ModelMetrics | null;
};

type ModelMonitoringPageProps = {
  modelUsages: ModelUsageSummary[];
  aggregateMetrics: ModelMetrics | null;
  modelMetrics: ModelMetricSnapshot[];
  days: number;
  loading: boolean;
  error: string;
  onDaysChange: (days: number) => void;
  onRefresh: () => void;
};

export function ModelMonitoringPage({
  modelUsages,
  aggregateMetrics,
  modelMetrics,
  days,
  loading,
  error,
  onDaysChange,
  onRefresh,
}: ModelMonitoringPageProps) {
  const metricByModel = new Map(
    modelMetrics.map((snapshot) => [snapshot.model, snapshot.metrics]),
  );
  const aggregate = aggregateMetrics?.summary;
  const aggregateRequests = aggregate?.requests ?? 0;
  const aggregateTokens = aggregate?.total_tokens ?? 0;
  const aggregateLatency = aggregate?.avg_duration_ms ?? 0;
  const aggregateCost = aggregate?.estimated_cost ?? 0;
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const rows = modelUsages
    .map((usage) => ({
      ...usage,
      metrics: metricByModel.get(usage.model) ?? null,
      requests: metricByModel.get(usage.model)?.summary.requests ?? 0,
    }))
    .sort(
      (left, right) =>
        right.requests - left.requests || left.model.localeCompare(right.model),
    );
  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-4 rounded-2xl border bg-white p-5 shadow-sm dark:border-[#606066] dark:bg-[#39393d] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-300">
            <BarChart3 className="h-4 w-4" />
            Foundry model monitoring
          </div>
          <h3 className="mt-1 text-lg font-semibold">Model usage overview</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-300">
            Shows configured deployments used by the app's use cases with
            app-recorded request, token, latency, and estimated-cost metrics.
            These are not Foundry-native platform metrics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border bg-slate-100 p-1 dark:border-[#606066] dark:bg-[#29292c]">
            {[7, 30].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onDaysChange(option)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition",
                  days === option
                    ? "bg-white text-slate-950 shadow-sm dark:bg-[#45454a] dark:text-slate-50"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
                )}
              >
                {option}D
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="App-recorded models"
          value={formatCompactNumber(modelUsages.length)}
          helper="Configured by use cases"
        />
        <MetricCard
          label="App-recorded requests"
          value={formatCompactNumber(aggregateRequests)}
          helper={`Saved app traffic across ${days} days`}
        />
        <MetricCard
          label="App-recorded tokens"
          value={formatCompactNumber(aggregateTokens)}
          helper={`${formatCompactNumber(aggregate?.avg_total_tokens ?? 0)} avg per saved request`}
        />
        <MetricCard
          label="App-measured latency"
          value={`${formatCompactNumber(aggregateLatency)} ms`}
          helper="Measured by this app"
        />
        <MetricCard
          label="Estimated app cost"
          value={formatCurrency(aggregateCost)}
          helper="From local token-rate settings"
        />
      </div>

      <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            Models used by use cases
          </CardTitle>
          <CardDescription>
            Sorted by app-recorded request volume. Expand a model to compare
            latest 7D requests and tokens on separate scales.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {modelUsages.length ? (
            <div className="overflow-auto rounded-xl border dark:border-[#606066]">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-[#606066]">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-[#29292c] dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Model</th>
                    <th className="px-4 py-3 font-semibold">Function</th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Requests
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Tokens
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">
                      Avg latency
                    </th>
                    <th className="px-4 py-3 text-right font-semibold">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#55555a]">
                  {rows.map((usage) => {
                    const summary = usage.metrics?.summary;
                    const expanded = expandedModel === usage.model;
                    return (
                      <Fragment key={usage.model}>
                        <tr className="align-top">
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-50">
                            <div className="grid gap-1">
                              <span>{formatModelName(usage.model)}</span>
                              <button
                                type="button"
                                className="w-fit text-xs font-medium text-violet-600 hover:underline dark:text-violet-300"
                                aria-expanded={expanded}
                                onClick={() =>
                                  setExpandedModel(
                                    expanded ? null : usage.model,
                                  )
                                }
                              >
                                {expanded ? "Hide 7D graphs" : "Show 7D graphs"}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {usage.roles.map((role) => (
                                <Badge key={role} variant="outline">
                                  {role}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <MetricCell
                            value={formatCompactNumber(summary?.requests ?? 0)}
                          />
                          <MetricCell
                            value={formatCompactNumber(
                              summary?.total_tokens ?? 0,
                            )}
                          />
                          <MetricCell
                            value={`${formatCompactNumber(summary?.avg_duration_ms ?? 0)} ms`}
                          />
                          <MetricCell
                            value={formatCurrency(summary?.estimated_cost ?? 0)}
                          />
                        </tr>
                        {expanded ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="bg-slate-50 px-4 py-4 dark:bg-[#29292c]"
                            >
                              <SevenDayModelCharts metrics={usage.metrics} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500 dark:border-[#606066] dark:text-slate-400">
              No configured model deployments were found for the registered use
              cases.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SevenDayModelCharts({ metrics }: { metrics: ModelMetrics | null }) {
  const days = (metrics?.days ?? []).slice(-7);
  const labels = days.map((day) => day.label);
  const requestValues = days.map((day) => day.requests);
  const tokenValues = days.map((day) => day.total_tokens);
  const requestTotal = requestValues.reduce((total, value) => total + value, 0);
  const tokenTotal = tokenValues.reduce((total, value) => total + value, 0);

  if (!days.length) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-slate-500 dark:border-[#606066] dark:text-slate-400">
        No 7D app metrics
      </div>
    );
  }

  return (
    <div
      className="grid gap-4 md:grid-cols-2"
      aria-label="Latest 7D app-recorded requests and tokens"
    >
      <SevenDayMetricGraph
        color="#5973ff"
        days={labels}
        label="Requests"
        total={requestTotal}
        values={requestValues}
      />
      <SevenDayMetricGraph
        color="#31c7b7"
        days={labels}
        label="Tokens"
        total={tokenTotal}
        values={tokenValues}
      />
    </div>
  );
}

function SevenDayMetricGraph({
  color,
  days,
  label,
  total,
  values,
}: {
  color: string;
  days: string[];
  label: string;
  total: number;
  values: number[];
}) {
  const maxValue = Math.max(...values, 1);
  const points = chartPoints(values, maxValue);

  return (
    <div className="rounded-xl border bg-white p-3 dark:border-[#606066] dark:bg-[#39393d]">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-1 font-medium">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          7D {label.toLowerCase()}
        </span>
        <span className="tabular-nums text-slate-500 dark:text-slate-400">
          {formatCompactNumber(total)}
        </span>
      </div>
      <svg
        className="h-32 w-full overflow-visible rounded-lg bg-slate-50 p-2 dark:bg-[#29292c]"
        viewBox="0 0 240 112"
        role="img"
        aria-label={`Latest 7D ${label.toLowerCase()} ${total}`}
      >
        <line
          stroke="currentColor"
          strokeOpacity="0.35"
          x1="28"
          x2="28"
          y1="8"
          y2="84"
        />
        <line
          stroke="currentColor"
          strokeOpacity="0.35"
          x1="28"
          x2="232"
          y1="84"
          y2="84"
        />
        <text
          className="fill-slate-500 text-[9px] dark:fill-slate-400"
          x="0"
          y="12"
        >
          {formatCompactNumber(maxValue)}
        </text>
        <text
          className="fill-slate-500 text-[9px] dark:fill-slate-400"
          x="14"
          y="87"
        >
          0
        </text>
        <text
          className="fill-slate-500 text-[9px] dark:fill-slate-400"
          x="28"
          y="104"
        >
          {days[0] ?? ""}
        </text>
        <text
          className="fill-slate-500 text-[9px] dark:fill-slate-400"
          textAnchor="end"
          x="232"
          y="104"
        >
          {days.at(-1) ?? ""}
        </text>
        <polyline
          fill="none"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {points.map((point, index) => (
          <circle
            key={`${label}-${days[index] ?? index}`}
            cx={point.x}
            cy={point.y}
            fill={color}
            r="3.5"
          >
            <title>{`${days[index] ?? `Day ${index + 1}`}: ${formatCompactNumber(point.value)} ${label.toLowerCase()}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}

function chartPoints(values: number[], maxValue: number) {
  if (!values.length) {
    return [];
  }
  const left = 28;
  const width = 204;
  const height = 76;
  const top = 8;
  if (values.length === 1) {
    const y = top + height - (values[0] / maxValue) * height;
    return [
      { x: left, y, value: values[0] },
      { x: left + width, y, value: values[0] },
    ];
  }
  return values.map((value, index) => {
    const x = left + (index / (values.length - 1)) * width;
    const y = top + height - (value / maxValue) * height;
    return { x, y, value };
  });
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {helper}
        </p>
      </CardContent>
    </Card>
  );
}

function MetricCell({ value }: { value: string }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-200">
      {value}
    </td>
  );
}
