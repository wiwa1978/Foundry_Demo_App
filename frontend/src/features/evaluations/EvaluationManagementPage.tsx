import { Ban, CircleAlert, FlaskConical, Play, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { FetchClient } from "@/api/types";
import type { UseCaseId } from "@/app/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  cancelEvaluationRun,
  loadAdminEvaluations,
  rerunEvaluation,
} from "./api";
import type { EvaluationListResponse, EvaluationRun } from "./types";

type EvaluationUseCaseOption = {
  id: UseCaseId;
  title: string;
};

type EvaluationManagementPageProps = {
  fetchClient: FetchClient;
  useCases: readonly EvaluationUseCaseOption[];
  models: string[];
  agents: string[];
  embedded?: boolean;
};

type TargetType = "model" | "agent";

const activeStatuses = new Set(["queued", "in_progress"]);
const terminalStatuses = new Set(["completed", "failed", "canceled"]);

function statusClass(status: string) {
  if (status === "completed") return "bg-emerald-100 text-emerald-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  if (status === "canceled") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

function formatDate(timestamp: number) {
  return new Date(timestamp * 1000).toLocaleString();
}

export function EvaluationManagementPage({
  fetchClient,
  useCases,
  models,
  agents,
  embedded = false,
}: EvaluationManagementPageProps) {
  const [useCase, setUseCase] = useState<UseCaseId>(
    useCases[0]?.id ?? "text_chat",
  );
  const [targetType, setTargetType] = useState<TargetType>("model");
  const targetOptions = targetType === "model" ? models : agents;
  const [targetName, setTargetName] = useState(models[0] ?? "");
  const [data, setData] = useState<EvaluationListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionKey, setActionKey] = useState("");

  useEffect(() => {
    if (!targetOptions.includes(targetName)) {
      setTargetName(targetOptions[0] ?? "");
    }
  }, [targetName, targetOptions]);

  const refresh = useCallback(
    async (signal?: AbortSignal, quiet = false) => {
      if (!quiet) setLoading(true);
      setError("");
      try {
        setData(await loadAdminEvaluations(fetchClient, useCase, signal));
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load evaluation administration.",
        );
      } finally {
        if (!signal?.aborted && !quiet) setLoading(false);
      }
    },
    [fetchClient, useCase],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const hasActiveRuns =
    data?.evaluations.some((evaluation) =>
      evaluation.runs.some((run) => activeStatuses.has(run.status)),
    ) ?? false;

  useEffect(() => {
    if (!hasActiveRuns) return;
    const interval = window.setInterval(
      () => void refresh(undefined, true),
      5000,
    );
    return () => window.clearInterval(interval);
  }, [hasActiveRuns, refresh]);

  const evaluations = useMemo(() => {
    if (!data) return [];
    if (!targetName) return data.evaluations;
    return data.evaluations
      .map((evaluation) => ({
        ...evaluation,
        runs: evaluation.runs.filter(
          (run) =>
            run.target_type === targetType && run.target_name === targetName,
        ),
      }))
      .filter((evaluation) => evaluation.runs.length > 0);
  }, [data, targetName, targetType]);

  async function runAction(key: string, action: () => Promise<EvaluationRun>) {
    setActionKey(key);
    setError("");
    try {
      await action();
      await refresh(undefined, true);
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "The evaluation operation failed.",
      );
    } finally {
      setActionKey("");
    }
  }

  return (
    <div
      className={cn(
        "flex-1 overflow-auto bg-slate-50 dark:bg-[#303033]",
        embedded ? "" : "p-5",
      )}
    >
      <div className="mx-auto grid max-w-6xl gap-5">
        <section className="rounded-2xl border bg-white p-5 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-300">
                <FlaskConical className="h-4 w-4" />
                Administrator control plane
              </div>
              <h3 className="mt-1 text-lg font-semibold">
                Evaluation management
              </h3>
              <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-300">
                Select a use case and Foundry target, then inspect, rerun, or
                cancel its evaluation runs.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className="grid gap-1.5 text-sm font-medium">
              Use case
              <select
                value={useCase}
                onChange={(event) =>
                  setUseCase(event.target.value as UseCaseId)
                }
                className="h-10 rounded-md border bg-white px-3 font-normal dark:border-[#606066] dark:bg-[#303033]"
              >
                {useCases.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Target type
              <select
                value={targetType}
                onChange={(event) =>
                  setTargetType(event.target.value as TargetType)
                }
                className="h-10 rounded-md border bg-white px-3 font-normal dark:border-[#606066] dark:bg-[#303033]"
              >
                <option value="model" disabled={!models.length}>
                  Model deployment
                </option>
                <option value="agent" disabled={!agents.length}>
                  Foundry agent
                </option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              Target
              <select
                value={targetName}
                disabled={!targetOptions.length}
                onChange={(event) => setTargetName(event.target.value)}
                className="h-10 rounded-md border bg-white px-3 font-normal disabled:opacity-60 dark:border-[#606066] dark:bg-[#303033]"
              >
                {!targetOptions.length ? (
                  <option value="">No targets configured</option>
                ) : null}
                {targetOptions.map((target) => (
                  <option key={target} value={target}>
                    {target}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Evaluation management error</p>
              <p>{error}</p>
            </div>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500 dark:border-[#606066] dark:bg-[#39393d]">
            Loading Foundry evaluations…
          </div>
        ) : evaluations.length ? (
          evaluations.map((evaluation) => (
            <section
              key={evaluation.id}
              className="rounded-2xl border bg-white p-5 shadow-sm dark:border-[#606066] dark:bg-[#39393d]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{evaluation.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Created {formatDate(evaluation.created_at)}
                  </p>
                </div>
                <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">
                  {evaluation.criteria.length} evaluators
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                {evaluation.runs.map((run) => {
                  const key = `${evaluation.id}:${run.id}`;
                  const busy = actionKey === key;
                  return (
                    <article
                      key={run.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4 dark:border-[#55555a]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{run.name}</p>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-medium",
                              statusClass(run.status),
                            )}
                          >
                            {run.status.replace("_", " ")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {run.target_name ?? "Unknown target"} ·{" "}
                          {formatDate(run.created_at)}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          {run.result_counts.total
                            ? `${run.result_counts.passed} passed · ${run.result_counts.failed} failed · ${run.result_counts.errored} errored`
                            : "No results produced"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {terminalStatuses.has(run.status) ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void runAction(key, () =>
                                rerunEvaluation(
                                  fetchClient,
                                  evaluation.id,
                                  run.id,
                                  `Rerun of ${run.name}`,
                                ),
                              )
                            }
                          >
                            <Play className="h-4 w-4" />
                            Rerun
                          </Button>
                        ) : null}
                        {activeStatuses.has(run.status) ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void runAction(key, () =>
                                cancelEvaluationRun(
                                  fetchClient,
                                  evaluation.id,
                                  run.id,
                                ),
                              )
                            }
                          >
                            <Ban className="h-4 w-4" />
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500 dark:border-[#606066] dark:bg-[#39393d]">
            No evaluations with runs match this use case and target.
          </div>
        )}
      </div>
    </div>
  );
}
