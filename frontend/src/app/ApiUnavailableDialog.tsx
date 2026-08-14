import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ApiUnavailableDialog({
  reason,
  onRetry,
}: {
  reason: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="api-unavailable-title"
        aria-describedby="api-unavailable-description"
        className="w-full max-w-2xl rounded-3xl border border-amber-300 bg-white p-8 text-center shadow-2xl dark:border-amber-400/50 dark:bg-[#39393d]"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
          <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2
          id="api-unavailable-title"
          className="mt-5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50"
        >
          API unavailable
        </h2>
        <p
          id="api-unavailable-description"
          className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300"
        >
          The frontend cannot contact the Foundry Chat API. Use cases are
          blocked until the backend is running and reachable.
        </p>
        {reason ? (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs text-slate-600 dark:border-[#606066] dark:bg-[#303033] dark:text-slate-300">
            {reason}
          </p>
        ) : null}
        <div className="mt-6 flex justify-center">
          <Button type="button" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry connection
          </Button>
        </div>
      </section>
    </div>
  );
}
