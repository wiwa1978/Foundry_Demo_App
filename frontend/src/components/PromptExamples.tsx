import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PromptExample = {
  id: string;
  title: string;
  prompt: string;
  description?: string;
  answer?: string;
  badges?: readonly string[];
};

type PromptExamplesProps = {
  title: string;
  description: string;
  icon: ReactNode;
  examples: readonly PromptExample[];
  value: string;
  onSelect: (prompt: string) => void;
};

export function PromptExamples({
  title,
  description,
  icon,
  examples,
  value,
  onSelect,
}: PromptExamplesProps) {
  const [open, setOpen] = useState(false);
  const [visibleAnswers, setVisibleAnswers] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!open || !container) {
      return;
    }

    function updateScrollControls() {
      if (!container) {
        return;
      }
      setCanScrollLeft(container.scrollLeft > 1);
      setCanScrollRight(
        container.scrollLeft + container.clientWidth <
          container.scrollWidth - 1,
      );
    }

    updateScrollControls();
    container.addEventListener("scroll", updateScrollControls, {
      passive: true,
    });
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateScrollControls);
    resizeObserver?.observe(container);

    return () => {
      container.removeEventListener("scroll", updateScrollControls);
      resizeObserver?.disconnect();
    };
  }, [examples.length, open]);

  function scroll(direction: -1 | 1) {
    scrollContainerRef.current?.scrollBy({
      left:
        direction *
        Math.max(280, scrollContainerRef.current.clientWidth * 0.75),
      behavior: "smooth",
    });
  }

  return (
    <section className="shrink-0 border-b bg-white px-4 py-3 dark:border-[#55555a] dark:bg-[#39393d]">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3",
          open && "mb-3",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex items-start gap-2 text-left"
        >
          <span className="mt-0.5 text-slate-500 dark:text-slate-300">
            {icon}
          </span>
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              {title}
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition", open && "rotate-180")}
              />
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {description}
            </p>
          </div>
        </button>
        {open ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => scroll(-1)}
              disabled={!canScrollLeft}
              aria-label="Previous prompts"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => scroll(1)}
              disabled={!canScrollRight}
              aria-label="Next prompts"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>
      {open ? (
        <div
          ref={scrollContainerRef}
          className="prompt-carousel grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(15rem,20rem)] gap-2 overflow-x-auto overscroll-x-contain scroll-smooth"
        >
          {examples.map((example) => {
            const selected = value === example.prompt;
            const answerVisible = visibleAnswers.has(example.id);
            return (
              <article
                key={example.id}
                className={cn(
                  "group snap-start rounded-xl border bg-slate-50 p-3 text-left transition hover:border-slate-400 hover:bg-white dark:border-[#606066] dark:bg-[#29292c] dark:hover:border-[#77777d] dark:hover:bg-[#45454a]",
                  selected &&
                    "border-blue-400 ring-1 ring-blue-400 dark:border-[#8b8b92] dark:ring-[#8b8b92]",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{example.title}</span>
                  <button
                    type="button"
                    onClick={() => onSelect(example.prompt)}
                    className="text-[10px] font-medium uppercase tracking-wide text-blue-600 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                  >
                    {selected ? "Loaded" : "Use prompt"}
                  </button>
                </div>
                <p className="mt-2 line-clamp-2 font-mono text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                  {example.prompt}
                </p>
                {example.description ? (
                  <p className="mt-2 border-t pt-2 text-[11px] leading-4 text-slate-500 dark:border-[#55555a] dark:text-slate-400">
                    {example.description}
                  </p>
                ) : null}
                {example.badges?.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-medium">
                    {example.badges.map((badge, index) => (
                      <span
                        key={`${example.id}-${badge}`}
                        className={cn(
                          index === 0
                            ? "rounded-full bg-blue-50 px-2 py-1 text-blue-700 dark:bg-violet-500/15 dark:text-violet-200"
                            : "text-slate-500 dark:text-slate-400",
                        )}
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                ) : null}
                {example.answer ? (
                  <div className="mt-3 border-t pt-2 dark:border-[#55555a]">
                    <button
                      type="button"
                      onClick={() =>
                        setVisibleAnswers((current) => {
                          const next = new Set(current);
                          if (next.has(example.id)) {
                            next.delete(example.id);
                          } else {
                            next.add(example.id);
                          }
                          return next;
                        })
                      }
                      className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      aria-expanded={answerVisible}
                    >
                      {answerVisible ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {answerVisible ? "Hide answer" : "Show answer"}
                    </button>
                    {answerVisible ? (
                      <p className="mt-2 whitespace-pre-line text-[11px] leading-4 text-slate-600 dark:text-slate-300">
                        {example.answer}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
