import {
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Play,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef } from "react";

import { formatConfiguredGuardrail } from "@/app/workspace/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type {
  GuardrailBatchOutcome,
  GuardrailBatchPolicyResult,
  GuardrailBatchStatementResult,
} from "./batchTypes";
import { downloadCsv, extractStatements, toCsv } from "./csv";
import { summarizeBatch, type GuardrailBatchState } from "./useGuardrailBatch";

export type GuardrailBatchViewModel = GuardrailBatchState & {
  loadStatements: (fileName: string, statements: string[]) => void;
  run: () => void;
  cancel: () => void;
  clear: () => void;
};

const sampleCsvPath = "/samples/guardrail-batch-nl.csv";

const templateRows = [
  ["statement"],
  ["Replace this line with your first statement."],
  ["Statements with a comma, a colon: or quotes are quoted automatically."],
  ['To include a literal quote, double it: ""like this"".'],
];

function downloadTemplate() {
  downloadCsv("guardrail-batch-template.csv", toCsv(templateRows));
}

const outcomeLabels: Record<GuardrailBatchOutcome, string> = {
  blocked: "Blocked",
  flagged: "Allowed (flagged)",
  allowed: "Allowed",
  error: "Error",
};

const outcomeStyles: Record<GuardrailBatchOutcome, string> = {
  blocked:
    "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200",
  flagged:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200",
  allowed:
    "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  error:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-[#66666c] dark:bg-[#3d3d42] dark:text-slate-200",
};

export function GuardrailBatchPanel({
  model,
  batch,
  policyNames,
  deploymentPolicyName,
}: {
  model: string;
  batch: GuardrailBatchViewModel;
  policyNames: string[];
  deploymentPolicyName?: string | null;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const evaluatedModel = batch.model || model;
  const columnNames =
    batch.policyNames.length === 2 ? batch.policyNames : policyNames;
  const summary = summarizeBatch(batch.results);
  const allEvaluationsComplete =
    batch.total > 0 &&
    batch.completed === batch.total &&
    batch.results.length === batch.total &&
    batch.results.every((entry) => entry.results.length === 2);

  async function onFileSelected(file: File | undefined) {
    if (!file) {
      return;
    }
    const text = await file.text();
    batch.loadStatements(file.name, extractStatements(text));
  }

  async function loadSample() {
    const response = await fetch(sampleCsvPath);
    if (!response.ok) {
      return;
    }
    const text = await response.text();
    batch.loadStatements("guardrail-batch-nl.csv", extractStatements(text));
  }

  function exportResults() {
    const rows: Array<Array<string | number>> = [
      [
        "#",
        "Model",
        "Statement",
        `${columnNames[0] ?? "Guardrail 1"} outcome`,
        `${columnNames[0] ?? "Guardrail 1"} triggered filters`,
        `${columnNames[0] ?? "Guardrail 1"} response`,
        `${columnNames[1] ?? "Guardrail 2"} outcome`,
        `${columnNames[1] ?? "Guardrail 2"} triggered filters`,
        `${columnNames[1] ?? "Guardrail 2"} response`,
        "Differs",
      ],
      ...batch.results.map((entry) => {
        const [first, second] = entry.results;
        return [
          entry.index + 1,
          evaluatedModel,
          entry.statement,
          outcomeLabels[first?.outcome ?? "error"],
          first?.triggered_filters.join(" | ") ?? "",
          first?.response ?? "",
          outcomeLabels[second?.outcome ?? "error"],
          second?.triggered_filters.join(" | ") ?? "",
          second?.response ?? "",
          first && second && first.blocked !== second.blocked ? "yes" : "no",
        ];
      }),
    ];
    downloadCsv("guardrail-batch-results.csv", toCsv(rows));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-white p-3 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(event) => {
            void onFileSelected(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={batch.isRunning}
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadSample()}
          disabled={batch.isRunning}
        >
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          Load sample
        </Button>
        <Button type="button" variant="ghost" onClick={downloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Template
        </Button>
        <Button
          type="button"
          onClick={batch.run}
          disabled={batch.isRunning || !batch.statements.length}
        >
          {batch.isRunning ? (
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Run {batch.statements.length || ""} statements
        </Button>
        {batch.isRunning ? (
          <Button type="button" variant="outline" onClick={batch.cancel}>
            <X className="mr-2 h-4 w-4" />
            Stop
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={exportResults}
          disabled={!allEvaluationsComplete}
        >
          <Download className="mr-2 h-4 w-4" />
          Export results
        </Button>
        {batch.statements.length ? (
          <Button
            type="button"
            variant="ghost"
            onClick={batch.clear}
            disabled={batch.isRunning}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          {batch.fileName ? (
            <span className="inline-flex items-center gap-1">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {batch.fileName}
            </span>
          ) : (
            <span>One statement per line, or a “statement” column.</span>
          )}
          {batch.total ? (
            <span>
              {batch.completed}/{batch.total} evaluated
            </span>
          ) : null}
        </div>
      </div>

      {batch.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {batch.error}
        </p>
      ) : null}

      {batch.results.length ? (
        <div className="grid gap-2 sm:grid-cols-3">
          <SummaryCard
            title={formatConfiguredGuardrail(
              columnNames[0] ?? "Guardrail 1",
              deploymentPolicyName,
            )}
            counts={summary.policy1}
          />
          <SummaryCard
            title={formatConfiguredGuardrail(
              columnNames[1] ?? "Guardrail 2",
              deploymentPolicyName,
            )}
            counts={summary.policy2}
          />
          <div className="rounded-2xl border bg-white p-3 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Different verdicts
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {summary.differences}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Statements one policy blocked and the other did not.
            </p>
          </div>
        </div>
      ) : null}

      <div className="overflow-auto rounded-2xl border bg-white shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-[#303033] dark:text-slate-400">
            <tr>
              <th className="w-10 px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Statement</th>
              <th className="w-64 px-3 py-2 font-semibold">
                {formatConfiguredGuardrail(
                  columnNames[0] ?? "Guardrail 1",
                  deploymentPolicyName,
                )}
              </th>
              <th className="w-64 px-3 py-2 font-semibold">
                {formatConfiguredGuardrail(
                  columnNames[1] ?? "Guardrail 2",
                  deploymentPolicyName,
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {batch.results.length ? (
              batch.results.map((entry) => (
                <ResultRow key={entry.index} entry={entry} />
              ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-10 text-center text-xs text-slate-500 dark:text-slate-400"
                >
                  {batch.statements.length
                    ? `${batch.statements.length} statements loaded. Select Run to evaluate them against both policies.`
                    : "Upload a CSV of statements to compare both guardrail policies row by row."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  counts,
}: {
  title: string;
  counts: Record<GuardrailBatchOutcome, number>;
}) {
  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <div className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
        {title}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {(
          ["blocked", "flagged", "allowed", "error"] as GuardrailBatchOutcome[]
        ).map((outcome) => (
          <Badge
            key={outcome}
            variant="outline"
            className={cn("font-medium", outcomeStyles[outcome])}
          >
            {counts[outcome]} {outcomeLabels[outcome].toLowerCase()}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ResultRow({ entry }: { entry: GuardrailBatchStatementResult }) {
  const [first, second] = entry.results;
  const differs = first && second && first.blocked !== second.blocked;
  return (
    <tr
      className={cn(
        "border-t align-top dark:border-[#55555a]",
        differs && "bg-amber-50/70 dark:bg-amber-950/20",
      )}
    >
      <td className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">
        {entry.index + 1}
      </td>
      <td className="px-3 py-2">{entry.statement}</td>
      <td className="px-3 py-2">
        <OutcomeCell result={first} />
      </td>
      <td className="px-3 py-2">
        <OutcomeCell result={second} />
      </td>
    </tr>
  );
}

function OutcomeCell({ result }: { result?: GuardrailBatchPolicyResult }) {
  if (!result) {
    return (
      <span className="text-xs text-slate-500 dark:text-slate-400">—</span>
    );
  }
  return (
    <div className="grid gap-1">
      <Badge
        variant="outline"
        className={cn("w-fit font-medium", outcomeStyles[result.outcome])}
      >
        {outcomeLabels[result.outcome]}
      </Badge>
      {result.triggered_filters.length ? (
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {result.triggered_filters.join(", ")}
        </span>
      ) : null}
      {result.message ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {result.message}
        </span>
      ) : null}
      {result.response_preview ? (
        <details className="text-xs text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer">Response</summary>
          <p className="mt-1 whitespace-pre-wrap">{result.response_preview}</p>
        </details>
      ) : null}
    </div>
  );
}
