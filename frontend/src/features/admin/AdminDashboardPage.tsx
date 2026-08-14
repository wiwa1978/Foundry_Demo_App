import { BarChart3, FlaskConical } from "lucide-react";

import type { UseCaseId } from "@/app/types";
import { cn } from "@/lib/utils";

import { EvaluationManagementPage } from "@/features/evaluations/EvaluationManagementPage";
import type { FetchClient, ModelMetrics } from "@/api/types";

import {
  ModelMonitoringPage,
  type ModelMetricSnapshot,
  type ModelUsageSummary,
} from "./ModelMonitoringPage";

export type AdminDashboardTab = "evaluations" | "monitoring";

type EvaluationAdminViewModel = {
  fetchClient: FetchClient;
  useCases: readonly { id: UseCaseId; title: string }[];
  models: string[];
  agents: string[];
};

type MonitoringViewModel = {
  modelUsages: ModelUsageSummary[];
  aggregateMetrics: ModelMetrics | null;
  modelMetrics: ModelMetricSnapshot[];
  days: number;
  loading: boolean;
  error: string;
  onDaysChange: (days: number) => void;
  onRefresh: () => void;
};

type AdminDashboardPageProps = {
  activeTab: AdminDashboardTab;
  evaluations: EvaluationAdminViewModel;
  monitoring: MonitoringViewModel;
  onTabChange: (tab: AdminDashboardTab) => void;
};

const tabs: Array<{
  value: AdminDashboardTab;
  label: string;
  description: string;
  icon: typeof FlaskConical;
}> = [
  {
    value: "evaluations",
    label: "Evaluations",
    description: "Inspect and rerun Foundry evaluation runs.",
    icon: FlaskConical,
  },
  {
    value: "monitoring",
    label: "Monitoring",
    description: "Track model usage, tokens, latency, and cost.",
    icon: BarChart3,
  },
];

export function AdminDashboardPage({
  activeTab,
  evaluations,
  monitoring,
  onTabChange,
}: AdminDashboardPageProps) {
  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-5 dark:bg-[#303033]">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
          <div>
            <p className="text-sm font-medium text-violet-600 dark:text-violet-300">
              Administrator dashboard
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Foundry operations
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-300">
              Manage evaluation runs and monitor the model deployments used by
              the registered app use cases.
            </p>
          </div>
          <div
            className="mt-5 grid gap-3 md:grid-cols-2"
            role="tablist"
            aria-label="Admin dashboard sections"
          >
            {tabs.map(({ value, label, description, icon: Icon }) => {
              const selected = activeTab === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onTabChange(value)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                    selected
                      ? "border-violet-300 bg-violet-50 text-violet-950 shadow-sm dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-100"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-200 dark:hover:bg-[#505056]",
                  )}
                >
                  <div className="flex items-center gap-2 font-semibold">
                    <Icon className="h-4 w-4" />
                    {label}
                  </div>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                    {description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {activeTab === "evaluations" ? (
          <EvaluationManagementPage {...evaluations} embedded />
        ) : (
          <ModelMonitoringPage {...monitoring} />
        )}
      </div>
    </div>
  );
}
