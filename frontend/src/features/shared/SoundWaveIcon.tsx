import { cn } from "@/lib/utils";

export function SoundWaveIcon({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex h-4 items-center gap-0.5", className)} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <span
          key={index}
          className="h-3 w-1 animate-pulse rounded-full bg-current odd:h-5"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </span>
  );
}
