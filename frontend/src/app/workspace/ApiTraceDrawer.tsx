import { CheckCircle2, Copy, Network, X } from "lucide-react";
import { useState } from "react";

import type { ApiTraceEntry, ApiTraceFilter } from "@/app/workspace/contracts";
import {
  formatTraceDirection,
  formatTraceTimestamp,
  formatTraceValue,
  isMessageTraceEntry,
} from "@/app/workspace/traceUtils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ApiTraceDrawer({
  open,
  entries,
  filter,
  onClose,
  onClear,
  onFilterChange,
}: {
  open: boolean;
  entries: ApiTraceEntry[];
  filter: ApiTraceFilter;
  onClose: () => void;
  onClear: () => void;
  onFilterChange: (filter: ApiTraceFilter) => void;
}) {
  const messageEntries = entries.filter(isMessageTraceEntry);
  const visibleEntries = filter === "messages" ? messageEntries : entries;

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        "fixed inset-y-0 right-0 z-40 flex w-full max-w-2xl transform flex-col border-l bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-[#606066] dark:bg-[#39393d]",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <header className="flex items-start justify-between gap-4 border-b px-5 py-4 dark:border-[#55555a]">
        <div>
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-blue-600 dark:text-violet-300" />
            <h2 className="font-semibold">API call trace</h2>
            <Badge variant="outline">{visibleEntries.length}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Frontend-to-API calls plus the exact Foundry payloads sent and
            received.
          </p>
          <div className="mt-3 inline-flex rounded-md border bg-slate-100 p-1 dark:border-[#606066] dark:bg-[#29292c]">
            {[
              {
                value: "messages" as const,
                label: "Messages only",
                count: messageEntries.length,
              },
              {
                value: "all" as const,
                label: "All calls",
                count: entries.length,
              },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onFilterChange(option.value)}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium transition",
                  filter === option.value
                    ? "bg-white text-slate-950 shadow-sm dark:bg-[#45454a] dark:text-slate-50"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
                )}
              >
                {option.label} ({option.count})
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClear}
            disabled={!entries.length}
          >
            Clear
          </Button>
          <button
            type="button"
            className="rounded p-1 hover:bg-slate-100 dark:hover:bg-[#45454a]"
            onClick={onClose}
            aria-label="Close API trace"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-[#303033]">
        {visibleEntries.length ? (
          <div className="grid gap-3">
            {visibleEntries.map((entry, index) => (
              <ApiTraceCard key={entry.id} entry={entry} index={index + 1} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-sm">
              <Network className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-[#77777d]" />
              <h3 className="text-sm font-semibold">
                No API calls captured yet
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {filter === "messages"
                  ? "Send a chat prompt or run a comparison to capture message payloads."
                  : "Send a chat prompt or run a comparison to capture API and Foundry payloads."}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function ApiTraceCard({
  entry,
  index,
}: {
  entry: ApiTraceEntry;
  index: number;
}) {
  const statusTone =
    entry.error || (entry.status && entry.status >= 400)
      ? "text-red-600 dark:text-red-300"
      : "text-emerald-600 dark:text-emerald-300";

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                entry.direction === "api_foundry" ? "default" : "secondary"
              }
            >
              {formatTraceDirection(entry.direction)}
            </Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              #{index} - {formatTraceTimestamp(entry.timestamp)}
            </span>
          </div>
          <h3 className="mt-2 truncate text-sm font-semibold">{entry.label}</h3>
          <p className="mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">
            {entry.method} {entry.url}
          </p>
        </div>
        <div className="text-right text-xs">
          {entry.status ? (
            <div className={statusTone}>HTTP {entry.status}</div>
          ) : null}
          {entry.durationMs !== undefined ? (
            <div className="mt-1 text-slate-500 dark:text-slate-400">
              {entry.durationMs} ms
            </div>
          ) : null}
          {entry.error ? <div className={statusTone}>{entry.error}</div> : null}
        </div>
      </div>

      {entry.request !== undefined ? (
        <JsonBlock title="Request payload" value={entry.request} />
      ) : null}
      {entry.response !== undefined ? (
        <JsonBlock title="Response" value={entry.response} />
      ) : null}
    </section>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const [copied, setCopied] = useState(false);
  const formattedValue = formatTraceValue(value);

  async function copyValue() {
    await navigator.clipboard.writeText(formattedValue);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </h4>
        <button
          type="button"
          onClick={() => void copyValue()}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#45454a] dark:hover:text-slate-100"
          aria-label={`Copy ${title.toLowerCase()}`}
          title={`Copy ${title.toLowerCase()}`}
        >
          {copied ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
        {formattedValue}
      </pre>
    </div>
  );
}
