import { cn } from "@/lib/utils";
import { contextIndicatorTone } from "@/lib/context-indicator";

export function ContextIndicatorPill({
  usedTokens,
  windowTokens,
  className,
}: {
  usedTokens: number;
  windowTokens: number;
  className?: string;
}) {
  const ratio = windowTokens > 0 ? usedTokens / windowTokens : 0;
  const tone = contextIndicatorTone(ratio);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-mono",
        tone === "warning" && "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
        tone === "warm" && "border-orange-400/35 bg-orange-400/10 text-orange-700 dark:text-orange-300",
        tone === "neutral" && "border-border/70 bg-secondary/60 text-muted-foreground",
        className,
      )}
    >
      <span>~{formatTokenCount(usedTokens)}</span>
      <span className="opacity-60">/</span>
      <span>{formatTokenCount(windowTokens)}</span>
    </span>
  );
}

function formatTokenCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}
