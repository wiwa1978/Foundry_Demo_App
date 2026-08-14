import {
  BarChart3,
  CalendarDays,
  ChevronsUpDown,
  HelpCircle,
  RotateCcw,
} from "lucide-react";

import type { MetricsDay, ModelMetrics } from "@/app/workspace/contracts";
import {
  formatAxisNumber,
  formatCompactNumber,
  formatCurrency,
  formatModelName,
} from "@/app/workspace/formatters";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ModelMetricsDashboardProps = {
  models: string[];
  metrics: ModelMetrics | null;
  selectedModel: string;
  days: number;
  loading: boolean;
  error: string;
  onModelChange: (model: string) => void;
  onDaysChange: (days: number) => void;
  onRefresh: () => void;
};

export function ModelMetricsDashboard({
  models,
  metrics,
  selectedModel,
  days,
  loading,
  error,
  onModelChange,
  onDaysChange,
  onRefresh,
}: ModelMetricsDashboardProps) {
  const modelOptions = Array.from(
    new Set([...models, ...(metrics?.models ?? [])]),
  );
  const summary = metrics?.summary;
  const metricDays = metrics?.days ?? [];

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-5 dark:bg-[#303033]">
      <div className="mx-auto grid max-w-7xl gap-4">
        <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-[#606066] dark:bg-[#39393d]">
          <div>
            <h3 className="text-base font-semibold">Model metrics</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tracks app-recorded requests saved by this app, using token usage
              returned on Foundry responses.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <select
                aria-label="Metrics model filter"
                value={selectedModel}
                onChange={(event) => onModelChange(event.target.value)}
                className="h-9 min-w-44 appearance-none rounded-md border border-slate-300 bg-white px-3 py-1 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:border-[#606066] dark:bg-[#29292c] dark:text-slate-100"
              >
                <option value="">All models</option>
                {modelOptions.map((model) => (
                  <option key={model} value={model}>
                    {formatModelName(model)}
                  </option>
                ))}
              </select>
              <ChevronsUpDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-500 dark:text-slate-400" />
            </div>
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
              size="icon"
              onClick={onRefresh}
              disabled={loading}
            >
              <RotateCcw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricSummaryCard
            label="App-recorded requests"
            value={summary ? formatCompactNumber(summary.requests) : "-"}
            helper="Saved assistant responses"
          />
          <MetricSummaryCard
            label="App-recorded tokens"
            value={summary ? formatCompactNumber(summary.total_tokens) : "-"}
            helper={`${formatCompactNumber(summary?.avg_total_tokens ?? 0)} avg per saved request`}
          />
          <MetricSummaryCard
            label="Estimated app cost"
            value={summary ? formatCurrency(summary.estimated_cost) : "-"}
            helper="Set local token rates in .env to estimate cost"
            info
          />
          <MetricSummaryCard
            label="Input tokens"
            value={summary ? formatCompactNumber(summary.prompt_tokens) : "-"}
            helper={`${formatCompactNumber(summary?.avg_prompt_tokens ?? 0)} avg per request`}
          />
          <MetricSummaryCard
            label="Output tokens"
            value={
              summary ? formatCompactNumber(summary.completion_tokens) : "-"
            }
            helper={`${formatCompactNumber(summary?.avg_completion_tokens ?? 0)} avg per request`}
          />
        </div>

        {!loading && summary?.requests === 0 ? (
          <div className="rounded-2xl border bg-white p-6 text-center text-sm text-slate-500 shadow-sm dark:border-[#606066] dark:bg-[#39393d] dark:text-slate-400">
            No model usage has been saved for this date range yet. Send a chat
            prompt and this dashboard will populate automatically.
          </div>
        ) : null}

        <MetricsChartCard
          title="Estimated cost"
          yLabel="Cost"
          days={metricDays}
          footer="Estimated from configured input and output token rates."
          series={[
            {
              label: "Estimated cost",
              color: "#b88a00",
              values: metricDays.map((item) => item.estimated_cost),
            },
          ]}
        />

        <div className="grid gap-4 xl:grid-cols-2">
          <MetricsChartCard
            title="Input vs output vs total tokens"
            description="Track token usage trends across input, output, and total."
            yLabel="Tokens"
            days={metricDays}
            footer={`Total: ${formatCompactNumber(summary?.total_tokens ?? 0)} tokens`}
            series={[
              {
                label: "Input tokens",
                color: "#5973ff",
                values: metricDays.map((item) => item.prompt_tokens),
              },
              {
                label: "Output tokens",
                color: "#ec6bd8",
                values: metricDays.map((item) => item.completion_tokens),
              },
              {
                label: "Total tokens",
                color: "#31c7b7",
                values: metricDays.map((item) => item.total_tokens),
              },
            ]}
          />
          <MetricsChartCard
            title="Number of requests"
            description="Shows how often this deployment was triggered."
            yLabel="Requests"
            days={metricDays}
            footer={`Total: ${formatCompactNumber(summary?.requests ?? 0)} requests`}
            area
            series={[
              {
                label: "Requests",
                color: "#5973ff",
                values: metricDays.map((item) => item.requests),
              },
            ]}
          />
          <MetricsChartCard
            title="App-measured response latency (ms)"
            description="Shows app-observed completion duration after each request."
            yLabel="Milliseconds"
            days={metricDays}
            footer={`Average: ${formatCompactNumber(summary?.avg_duration_ms ?? 0)} ms`}
            series={[
              {
                label: "Average latency",
                color: "#8b5cf6",
                values: metricDays.map((item) => item.avg_duration_ms),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function MetricSummaryCard({
  label,
  value,
  helper,
  info = false,
}: {
  label: string;
  value: string;
  helper: string;
  info?: boolean;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <CardContent className="p-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {label}
          {info ? <HelpCircle className="h-3.5 w-3.5 text-slate-400" /> : null}
        </div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">
          {value}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {helper}
        </p>
      </CardContent>
    </Card>
  );
}

type ChartSeries = {
  label: string;
  color: string;
  values: number[];
};

function MetricsChartCard({
  title,
  description,
  yLabel,
  days,
  series,
  footer,
  area = false,
}: {
  title: string;
  description?: string;
  yLabel: string;
  days: MetricsDay[];
  series: ChartSeries[];
  footer: string;
  area?: boolean;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 p-4 pb-0">
        <div>
          <CardTitle className="text-sm">{title}</CardTitle>
          {description ? (
            <CardDescription className="mt-1 text-xs">
              {description}
            </CardDescription>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
          <CalendarDays className="h-4 w-4" />
          <BarChart3 className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <MetricsLineChart
          yLabel={yLabel}
          days={days}
          series={series}
          area={area}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>{footer}</span>
          <div className="flex flex-wrap items-center gap-3">
            {series.map((item) => (
              <span
                key={item.label}
                className="inline-flex items-center gap-1.5"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricsLineChart({
  yLabel,
  days,
  series,
  area,
}: {
  yLabel: string;
  days: MetricsDay[];
  series: ChartSeries[];
  area: boolean;
}) {
  const width = 760;
  const height = 260;
  const padding = { top: 18, right: 20, bottom: 44, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...series.flatMap((item) => item.values));
  const tickStep = days.length > 14 ? 4 : days.length > 8 ? 2 : 1;
  const xForIndex = (index: number) =>
    padding.left +
    (days.length <= 1 ? 0 : (index / (days.length - 1)) * plotWidth);
  const yForValue = (value: number) =>
    padding.top + (1 - value / maxValue) * plotHeight;

  return (
    <svg
      className="h-64 w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
    >
      <title>{yLabel} over time</title>
      {[0, 0.5, 1].map((tick) => {
        const y = padding.top + tick * plotHeight;
        const value = maxValue * (1 - tick);
        return (
          <g key={tick}>
            <line
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-600"
            />
            <text
              x={padding.left - 12}
              y={y + 4}
              textAnchor="end"
              className="fill-slate-500 text-[11px] dark:fill-slate-400"
            >
              {formatAxisNumber(value)}
            </text>
          </g>
        );
      })}

      <text
        x={18}
        y={padding.top + plotHeight / 2}
        transform={`rotate(-90 18 ${padding.top + plotHeight / 2})`}
        textAnchor="middle"
        className="fill-slate-500 text-[11px] font-medium dark:fill-slate-400"
      >
        {yLabel}
      </text>

      {series.map((item, seriesIndex) => {
        const points = item.values.map((value, index) => ({
          x: xForIndex(index),
          y: yForValue(value),
        }));
        const linePoints = points
          .map((point) => `${point.x},${point.y}`)
          .join(" ");
        const areaPoints = [
          `${padding.left},${padding.top + plotHeight}`,
          ...points.map((point) => `${point.x},${point.y}`),
          `${padding.left + plotWidth},${padding.top + plotHeight}`,
        ].join(" ");
        return (
          <g key={item.label}>
            {area && seriesIndex === 0 ? (
              <polygon points={areaPoints} fill={item.color} opacity="0.25" />
            ) : null}
            <polyline
              points={linePoints}
              fill="none"
              stroke={item.color}
              strokeWidth="2.5"
            />
            {points.map((point, index) => (
              <circle
                key={`${item.label}-${index}`}
                cx={point.x}
                cy={point.y}
                r="2.5"
                fill={item.color}
              />
            ))}
          </g>
        );
      })}

      <line
        x1={padding.left}
        y1={padding.top + plotHeight}
        x2={width - padding.right}
        y2={padding.top + plotHeight}
        stroke="currentColor"
        className="text-slate-200 dark:text-slate-600"
      />
      {days.map((day, index) =>
        index % tickStep === 0 || index === days.length - 1 ? (
          <text
            key={day.date}
            x={xForIndex(index)}
            y={height - 18}
            textAnchor="middle"
            className="fill-slate-500 text-[11px] dark:fill-slate-400"
          >
            {day.label}
          </text>
        ) : null,
      )}
      <text
        x={padding.left + plotWidth / 2}
        y={height - 2}
        textAnchor="middle"
        className="fill-slate-500 text-[11px] dark:fill-slate-400"
      >
        Date (MM/DD)
      </text>
    </svg>
  );
}
