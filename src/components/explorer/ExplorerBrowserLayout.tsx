import { useMemo, useState, type CSSProperties } from "react";
import { ChevronRight, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type ExplorerPathCrumb = {
  label: string;
  path: string;
};

export function ExplorerBrowserLayout({
  rootLabel,
  breadcrumbs,
  onSelectPath,
  toolbar,
  list,
  preview,
  className,
}: {
  rootLabel: string;
  breadcrumbs: ExplorerPathCrumb[];
  onSelectPath: (path: string) => void;
  toolbar?: React.ReactNode;
  list: React.ReactNode;
  preview: React.ReactNode;
  className?: string;
}) {
  const parentPath = breadcrumbs.at(-2)?.path || "";
  const [pinnedPane, setPinnedPane] = useState<"list" | "preview" | null>(null);
  const [hoveredPane, setHoveredPane] = useState<"preview" | null>(null);
  const activePane = hoveredPane ?? pinnedPane;
  const listWidth = activePane === "list" ? "32rem" : activePane === "preview" ? "22rem" : "26rem";
  const layoutStyle = useMemo(
    () =>
      ({
        "--explorer-list-width": listWidth,
      }) as CSSProperties,
    [listWidth],
  );

  return (
    <div className={cn("rounded-3xl border border-border/70 bg-card/80 shadow-[0_20px_80px_-40px_hsl(var(--foreground)/0.2)]", className)}>
      <div
        className="grid min-h-[720px] grid-cols-1 transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] xl:[grid-template-columns:minmax(20rem,var(--explorer-list-width))_minmax(0,1fr)]"
        style={layoutStyle}
      >
        <section
          className={cn(
            "border-b border-border/60 transition-colors duration-200 xl:border-b-0 xl:border-r",
            activePane === "list" && "bg-background/20",
          )}
          onPointerDown={() => setPinnedPane("list")}
          onFocusCapture={() => setPinnedPane("list")}
        >
          <div className="border-b border-border/60 p-3">
            <div className="overflow-x-auto rounded-2xl border border-border/70 bg-background/70">
              <div className="flex min-w-max items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelectPath(parentPath)}
                  disabled={breadcrumbs.length === 0}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-40"
                  aria-label="Up one folder"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onSelectPath("")}
                  className={cn(
                    "rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-secondary",
                    breadcrumbs.length === 0 && "bg-secondary text-foreground",
                  )}
                >
                  {rootLabel}
                </button>

                {breadcrumbs.map((crumb, index) => {
                  const active = index === breadcrumbs.length - 1;

                  return (
                    <div key={crumb.path} className="flex items-center gap-2">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <button
                        type="button"
                        onClick={() => onSelectPath(crumb.path)}
                        className={cn(
                          "rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-secondary",
                          active && "bg-secondary text-foreground",
                        )}
                      >
                        {crumb.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {toolbar ? <div className="mt-3">{toolbar}</div> : null}
          </div>

          <div className="max-h-[720px] overflow-auto p-2.5">{list}</div>
        </section>

        <aside
          className={cn(
            "bg-background/20 transition-colors duration-200",
            activePane === "preview" && "bg-background/35",
          )}
          onPointerDown={() => setPinnedPane("preview")}
          onFocusCapture={() => setPinnedPane("preview")}
          onMouseEnter={() => setHoveredPane("preview")}
          onMouseLeave={() => setHoveredPane(null)}
        >
          <div className="max-h-[720px] overflow-auto p-3.5 xl:p-5">{preview}</div>
        </aside>
      </div>
    </div>
  );
}
