import {
  AudioLines,
  Bot,
  FileText,
  GitCompareArrows,
  Image,
  Mic,
  Sparkles,
  Type,
  Video,
  X,
} from "lucide-react";
import { useState } from "react";

import type { UseCaseId, UseCaseModality, UseCaseModule } from "@/app/types";
import { Badge } from "@/components/ui/badge";
import { SoundWaveIcon } from "@/features/shared/SoundWaveIcon";
import { useModalDialog } from "@/hooks/useModalDialog";
import { cn } from "@/lib/utils";

type UseCaseMarketplaceProps = {
  activeUseCase: UseCaseId;
  useCases: readonly UseCaseModule[];
  onSelect: (useCase: UseCaseId) => void;
  onClose: () => void;
};

const modalityOptions: {
  value: UseCaseModality;
  label: string;
  icon: typeof Type;
}[] = [
  { value: "text", label: "Text", icon: Type },
  { value: "image", label: "Image", icon: Image },
  { value: "audio", label: "Audio", icon: AudioLines },
  { value: "video", label: "Video", icon: Video },
];

export function UseCaseMarketplace({
  activeUseCase,
  useCases,
  onSelect,
  onClose,
}: UseCaseMarketplaceProps) {
  const dialogRef = useModalDialog<HTMLDivElement>(onClose);
  const [selectedModalities, setSelectedModalities] = useState<
    UseCaseModality[]
  >([]);
  const filteredUseCases = selectedModalities.length
    ? useCases.filter((useCase) =>
        useCase.modalities.some((modality) =>
          selectedModalities.includes(modality),
        ),
      )
    : useCases;

  function toggleModality(modality: UseCaseModality) {
    setSelectedModalities((selected) =>
      selected.includes(modality)
        ? selected.filter((item) => item !== modality)
        : [...selected, modality],
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#303033]/60 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="use-case-marketplace-title"
        tabIndex={-1}
        className="w-full max-w-6xl rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-[#606066] dark:bg-[#39393d]"
      >
        <header className="flex items-start justify-between gap-4 border-b px-6 py-5 dark:border-[#55555a]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 dark:border-violet-500/40 dark:bg-violet-500/15 dark:text-violet-200">
              <Sparkles className="h-3.5 w-3.5" />
              Marketplace
            </div>
            <h2
              id="use-case-marketplace-title"
              className="mt-3 text-xl font-semibold tracking-tight"
            >
              Choose a use case
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
              Tune the workspace for a focused scenario. The app always opens in
              Text Chat by default; other use cases are session-level presets.
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-[#45454a]"
            onClick={onClose}
            aria-label="Close use-case marketplace"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <fieldset className="px-5 pt-5">
          <legend className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            Filter by modality
          </legend>
          <div className="flex flex-wrap justify-center gap-2">
            {modalityOptions.map(({ value, label, icon: Icon }) => {
              const checked = selectedModalities.includes(value);
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
                    checked
                      ? "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500/60 dark:bg-violet-500/15 dark:text-violet-200"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-white dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-300 dark:hover:bg-[#505056]",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModality(value)}
                    className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                  />
                  <Icon className="h-4 w-4" />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-4">
          {filteredUseCases.map((useCase) => {
            const selected = useCase.id === activeUseCase;
            return (
              <button
                key={useCase.id}
                type="button"
                onClick={() => onSelect(useCase.id)}
                className={cn(
                  "flex min-h-56 flex-col rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                  selected
                    ? "border-blue-300 bg-blue-50 shadow-sm dark:border-violet-500/60 dark:bg-violet-500/15"
                    : "border-slate-200 bg-slate-50 hover:bg-white dark:border-[#606066] dark:bg-[#45454a] dark:hover:bg-[#505056]",
                )}
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <UseCaseIcon useCase={useCase} />
                  <Badge variant={selected ? "default" : "secondary"}>
                    {selected ? "Active" : useCase.badge}
                  </Badge>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {useCase.title}
                </h3>
                <p className="mt-2 flex-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {useCase.description}
                </p>
                <span className="mt-4 text-xs font-medium text-blue-700 dark:text-violet-200">
                  {selected ? "Currently selected" : "Use this mode"}
                </span>
              </button>
            );
          })}
          {filteredUseCases.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center dark:border-[#606066]">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                No use cases match these modalities
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Try another option or clear all filters to see every use case.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UseCaseIcon({ useCase }: { useCase: UseCaseModule }) {
  const className = "h-5 w-5";
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm dark:bg-[#303033] dark:text-violet-200">
      {useCase.icon === "comparison" ? (
        <GitCompareArrows className={className} />
      ) : useCase.icon === "browserVoice" ? (
        <Mic className={className} />
      ) : useCase.icon === "documents" ? (
        <FileText className={className} />
      ) : useCase.icon === "image" ? (
        <Image className={className} />
      ) : useCase.icon === "voiceWave" ? (
        <SoundWaveIcon className="h-5" />
      ) : (
        <Bot className={className} />
      )}
    </span>
  );
}
