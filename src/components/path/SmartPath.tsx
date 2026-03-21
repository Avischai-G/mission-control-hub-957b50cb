import { useEffect, useMemo, useRef } from "react";
import { buildAbsolutePathCrumbs } from "@/lib/path-utils";
import { cn } from "@/lib/utils";

type SmartPathProps = {
  path: string;
  className?: string;
  segmentClassName?: string;
  separatorClassName?: string;
  title?: string;
  onNavigate?: (path: string) => void;
};

type ParsedCrumb = {
  label: string;
  path: string;
};

const AUTO_RESET_DELAY_MS = 2000;

export function SmartPath({
  path,
  className,
  segmentClassName,
  separatorClassName,
  title,
  onNavigate,
}: SmartPathProps) {
  const normalizedPath = path || "";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const crumbs = useMemo(() => parsePath(normalizedPath), [normalizedPath]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      node.scrollTo({ left: node.scrollWidth, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [normalizedPath]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: "auto" });
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const clearResetTimer = () => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const scheduleTailReset = () => {
    clearResetTimer();
    resetTimerRef.current = window.setTimeout(() => {
      if (!scrollRef.current) return;
      scrollRef.current.scrollTo({ left: scrollRef.current.scrollWidth, behavior: "smooth" });
      resetTimerRef.current = null;
    }, AUTO_RESET_DELAY_MS);
  };

  if (!normalizedPath) {
    return <span className={className}>-</span>;
  }

  return (
    <div
      className={cn("min-w-0 max-w-full overflow-hidden", className)}
      title={title || normalizedPath}
      onMouseEnter={clearResetTimer}
      onMouseLeave={scheduleTailReset}
      onFocus={clearResetTimer}
      onBlur={scheduleTailReset}
    >
      <div
        ref={scrollRef}
        className={cn(
          "overflow-x-auto overflow-y-hidden whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
        onWheel={(event) => {
          const node = scrollRef.current;
          if (!node) return;
          if (node.scrollWidth <= node.clientWidth) return;

          const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
          if (delta === 0) return;
          event.preventDefault();
          node.scrollLeft += delta;
        }}
      >
        <div className="inline-flex min-w-max items-center">
          {crumbs.map((segment, index) => (
            <span
              key={`${segment.path}-${index}`}
              className="inline-flex min-w-0 items-center"
            >
              {index > 0 ? (
                <span className={cn("mx-2 shrink-0 text-muted-foreground/60", separatorClassName)}>
                  ›
                </span>
              ) : null}
              {onNavigate ? (
                <button
                  type="button"
                  onClick={() => onNavigate(segment.path)}
                  className={cn(
                    "shrink-0 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-secondary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    segmentClassName,
                  )}
                >
                  {segment.label}
                </button>
              ) : (
                <span className={cn("shrink-0", segmentClassName)}>{segment.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function parsePath(inputPath: string): ParsedCrumb[] {
  const crumbs = buildAbsolutePathCrumbs(inputPath);
  if (crumbs.length > 0) {
    return crumbs;
  }

  return [{ label: inputPath, path: inputPath }];
}
