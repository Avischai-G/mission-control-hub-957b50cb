import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ExplorerListItem({
  icon,
  title,
  subtitle,
  kindLabel,
  selected = false,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  kindLabel: string;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${kindLabel} ${title}`}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left text-foreground transition-all duration-200 ease-out active:scale-[0.992]",
        selected
          ? "border-primary/30 bg-primary/10 shadow-[0_16px_30px_-24px_hsl(var(--primary)/0.9)]"
          : "border-transparent hover:-translate-y-px hover:border-border/70 hover:bg-secondary/70",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-secondary/80 transition-colors",
          selected && "bg-primary/12 text-primary",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {subtitle ? <div className="min-w-0 text-xs text-muted-foreground">{subtitle}</div> : null}
      </div>
      <ChevronRight
        className={cn(
          "h-4 w-4 shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-0.5",
          selected && "translate-x-0.5 text-primary",
        )}
      />
    </button>
  );
}
