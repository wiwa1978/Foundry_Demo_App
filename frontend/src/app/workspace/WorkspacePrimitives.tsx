import {
  ArrowUp,
  Bot,
  FileText,
  LoaderCircle,
  Mic,
  Sparkles,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";

import type { UseCaseId } from "@/app/types";
import type { ConfigResponse } from "@/app/workspace/contracts";
import { formatModelName } from "@/app/workspace/formatters";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function FoundryStatusPill({
  config,
}: {
  config: ConfigResponse | null;
}) {
  if (config === null) {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-200"
        title="Loading Foundry configuration..."
      >
        <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
        Foundry
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:border-[#606066] dark:bg-[#45454a] dark:text-slate-200"
      title={config.endpoint ?? "Set FOUNDRY_PROJECT_ENDPOINT in .env."}
    >
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full",
          config.is_configured
            ? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]"
            : "bg-amber-500",
        )}
      />
      {config.is_configured ? "Foundry connected" : "Foundry not configured"}
    </span>
  );
}

export function SidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="palette-heading mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function ChatEmptyState({
  useCase,
  activeModel,
  onOpenUseCases,
}: {
  useCase: UseCaseId;
  activeModel: string;
  onOpenUseCases: () => void;
}) {
  const browserVoice = useCase === "browser_voice";
  const documentQa = useCase === "document_qa";
  return (
    <div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#606066] dark:bg-[#39393d]">
      <div className="palette-icon-surface mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
        {documentQa ? (
          <FileText className="h-7 w-7" />
        ) : browserVoice ? (
          <Mic className="h-7 w-7" />
        ) : (
          <Bot className="h-7 w-7" />
        )}
      </div>
      <h3 className="text-2xl font-semibold tracking-tight">
        {documentQa
          ? "Ask your documents"
          : browserVoice
            ? "Browser based voice"
            : "Start a chat session"}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
        {documentQa
          ? `Upload documents in the sidebar, then ask questions. The app retrieves context with Azure AI Search and answers with ${formatModelName(activeModel)}.`
          : browserVoice
            ? `Use browser dictation to fill the prompt, then send it to ${formatModelName(activeModel)}. Browser readback can speak the text response.`
            : `Ask anything with ${formatModelName(activeModel)}. Add voice, comparison, or realtime scenarios from the use-case marketplace when needed.`}
      </p>
      <Button
        type="button"
        variant="outline"
        className="palette-outline mt-5 rounded-full"
        onClick={onOpenUseCases}
      >
        <Sparkles className="h-4 w-4" />
        Browse use cases
      </Button>
    </div>
  );
}

export function ComposerSelect({
  id,
  ariaLabel,
  value,
  options,
  onChange,
  title,
  disabled = false,
}: {
  id: string;
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        title={title}
        className="composer-select h-8 w-auto max-w-[13rem] rounded-full py-0"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" side="top" align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function UseCaseComposer({
  ariaLabel,
  placeholder,
  value,
  disabled,
  submitting = false,
  disclaimer,
  error,
  leftControls,
  rightControls,
  onChange,
  onSubmit,
}: {
  ariaLabel: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  submitting?: boolean;
  disclaimer: string;
  error?: string;
  leftControls?: ReactNode;
  rightControls?: ReactNode;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const [inputHeight, setInputHeight] = useState(44);
  const resizeStartRef = useRef<{ pointerY: number; height: number } | null>(
    null,
  );

  function resizeInput(nextHeight: number) {
    setInputHeight(Math.min(280, Math.max(44, nextHeight)));
  }

  return (
    <div className="relative border-t bg-slate-50 px-4 py-3 dark:border-[#55555a] dark:bg-[#29292c]">
      <button
        type="button"
        aria-label={`Resize prompt input. Current height: ${inputHeight} pixels`}
        className="composer-resize-handle group absolute inset-x-0 top-0 z-10 flex h-3 -translate-y-1/2 cursor-ns-resize touch-none items-center justify-center border-0 bg-transparent p-0 outline-none"
        onPointerDown={(event) => {
          resizeStartRef.current = {
            pointerY: event.clientY,
            height: inputHeight,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const start = resizeStartRef.current;
          if (start) {
            resizeInput(start.height + start.pointerY - event.clientY);
          }
        }}
        onPointerUp={(event) => {
          resizeStartRef.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          resizeStartRef.current = null;
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            resizeInput(inputHeight + 24);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            resizeInput(inputHeight - 24);
          } else if (event.key === "Home") {
            event.preventDefault();
            resizeInput(44);
          } else if (event.key === "End") {
            event.preventDefault();
            resizeInput(280);
          }
        }}
      >
        <span className="h-1 w-12 rounded-full bg-slate-300 transition group-hover:w-16 group-hover:bg-current group-focus-visible:w-16 group-focus-visible:bg-current dark:bg-slate-600" />
      </button>
      <div className="palette-focus mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_1px_4px_rgba(15,23,42,0.16)] transition dark:border-[#606066] dark:bg-[#2f2f33] dark:shadow-none">
        <Textarea
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={value}
          rows={2}
          disabled={submitting}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (!disabled) {
                onSubmit();
              }
            }
          }}
          className="min-h-[44px] resize-none border-0 bg-transparent px-3 py-2 text-[15px] shadow-none placeholder:text-slate-400 focus-visible:ring-0 dark:bg-transparent dark:placeholder:text-slate-500"
          style={{ height: inputHeight }}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            {leftControls}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {rightControls}
            <Button
              type="button"
              size="icon"
              disabled={disabled}
              onClick={onSubmit}
              className="palette-action h-8 w-8 rounded-full shadow-none"
              aria-label={submitting ? "Submitting" : "Submit prompt"}
            >
              {submitting ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-center text-xs text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
        {disclaimer}
      </p>
    </div>
  );
}

export function ThinkingIndicator() {
  return (
    <div
      className="palette-thinking relative flex h-10 w-14 items-center justify-center overflow-hidden rounded-full border shadow-sm"
      role="status"
      aria-label="Generating response"
    >
      <span className="palette-thinking-pulse absolute h-6 w-6 animate-ping rounded-full motion-reduce:animate-none" />
      <span className="palette-thinking-ring absolute h-5 w-5 animate-spin rounded-full border border-transparent motion-reduce:animate-none" />
      <Sparkles className="palette-accent-text relative h-3.5 w-3.5 animate-pulse motion-reduce:animate-none" />
      <span className="sr-only">Generating response</span>
    </div>
  );
}
