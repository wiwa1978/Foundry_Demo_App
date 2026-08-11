import { Code2, X } from "lucide-react";

import type { UseCaseModule } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useModalDialog } from "@/hooks/useModalDialog";

type UseCaseDetailsPanelProps = {
  useCase: UseCaseModule;
  onClose: () => void;
};

export function UseCaseDetailsPanel({
  useCase,
  onClose,
}: UseCaseDetailsPanelProps) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#303033]/60 p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="use-case-details-title"
        tabIndex={-1}
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-[#606066] dark:bg-[#39393d]"
      >
        <header className="flex items-start justify-between gap-4 border-b px-6 py-5 dark:border-[#55555a]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{useCase.badge}</Badge>
              <Badge variant="secondary">
                {useCase.category === "agents" ? "Agents" : "Media"}
              </Badge>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Use-case implementation
              </span>
            </div>
            <h2
              id="use-case-details-title"
              className="mt-3 text-xl font-semibold tracking-tight"
            >
              {useCase.title}
            </h2>
            {useCase.typeLabel ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Badge>{useCase.typeLabel}</Badge>
                {useCase.frameworkLabel ? (
                  <Badge>{useCase.frameworkLabel}</Badge>
                ) : null}
              </div>
            ) : null}
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              {useCase.description}
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#45454a]"
            onClick={onClose}
            aria-label="Close use-case explanation"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-auto p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-[#606066] dark:bg-[#45454a]">
              <h3 className="text-sm font-semibold">How this use case works</h3>
              <ol className="mt-3 grid gap-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {useCase.implementation.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white dark:bg-violet-600">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-950 text-slate-100 shadow-sm dark:border-[#606066]">
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Code2 className="h-4 w-4 text-violet-300" />
                  <h3 className="truncate text-sm font-semibold">
                    {useCase.codeSnippet.title}
                  </h3>
                </div>
                <Badge variant="secondary">
                  {useCase.codeSnippet.language}
                </Badge>
              </div>
              <pre className="max-h-[28rem] overflow-auto p-4 text-xs leading-5">
                <code>{useCase.codeSnippet.code}</code>
              </pre>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
