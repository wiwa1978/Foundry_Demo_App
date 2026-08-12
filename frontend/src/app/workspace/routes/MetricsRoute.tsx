import { ModelMetricsDashboard } from "@/app/workspace/ModelMetricsDashboard";

import type { WorkspaceMetricsViewModel } from "./contracts";

export function MetricsRoute({
  metrics,
}: {
  metrics: WorkspaceMetricsViewModel;
}) {
  return (
    <ModelMetricsDashboard
      models={metrics.models}
      metrics={metrics.metrics}
      selectedModel={metrics.model}
      days={metrics.days}
      loading={metrics.loading}
      error={metrics.error}
      onModelChange={metrics.setModel}
      onDaysChange={metrics.setDays}
      onRefresh={() => void metrics.refresh()}
    />
  );
}
