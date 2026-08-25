import { ExternalLink, FileText, X } from "lucide-react";

import type { UseCaseModule } from "@/app/types";
import { Button } from "@/components/ui/button";
import { useModalDialog } from "@/hooks/useModalDialog";

type UseCaseDocumentationPanelProps = {
  useCase: UseCaseModule;
  onClose: () => void;
};

export function UseCaseDocumentationPanel({
  useCase,
  onClose,
}: UseCaseDocumentationPanelProps) {
  const dialogRef = useModalDialog<HTMLElement>(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#303033]/60 p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="use-case-documentation-title"
        tabIndex={-1}
        className="flex max-h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-[#606066] dark:bg-[#39393d]"
      >
        <header className="flex items-start justify-between gap-4 border-b px-6 py-5 dark:border-[#55555a]">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-blue-600 dark:text-violet-300" />
              Relevant documentation
            </div>
            <h2
              id="use-case-documentation-title"
              className="mt-2 text-xl font-semibold tracking-tight"
            >
              {useCase.title}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Microsoft Learn references for this use case.
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#45454a]"
            onClick={onClose}
            aria-label="Close documentation"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-auto p-6">
          <div className="grid gap-3">
            {useCase.documentation?.map((doc) => (
              <a
                key={doc.url}
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="group rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50 dark:border-[#606066] dark:bg-[#45454a] dark:hover:border-violet-400 dark:hover:bg-violet-500/10"
              >
                <span className="flex items-center justify-between gap-3 font-medium text-slate-800 dark:text-slate-100">
                  {doc.title}
                  <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-blue-600 dark:group-hover:text-violet-300" />
                </span>
                {doc.description ? (
                  <span className="mt-1 block text-sm leading-5 text-slate-500 dark:text-slate-400">
                    {doc.description}
                  </span>
                ) : null}
              </a>
            ))}
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
