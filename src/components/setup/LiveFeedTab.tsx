import { useEffect, useState } from "react";
import { Loader2, Radio } from "lucide-react";
import { getRecentRunSummaries } from "@/lib/workspace-files";
import { SmartPath } from "@/components/path/SmartPath";

type SummaryItem = {
  fileName: string;
  path: string;
  modifiedAt: string | null;
  size: number;
  objective: string;
  result: string;
  blockers: string;
};

export function LiveFeedTab() {
  const [summaries, setSummaries] = useState<SummaryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { summaries: nextSummaries } = await getRecentRunSummaries(80);
        if (!cancelled) {
          setSummaries(nextSummaries);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    const interval = window.setInterval(() => { void load(); }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full bg-success/10 border border-success/20 px-2.5 py-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="font-mono text-[10px] text-success uppercase">Summaries</span>
        </div>
        <span className="text-xs text-muted-foreground">{summaries.length} recent items</span>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : summaries.length === 0 ? (
        <div className="rounded-lg border border-border bg-secondary/20 p-12 text-center">
          <Radio className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No run summaries yet. Newest summaries will appear here first.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {summaries.map((summary) => (
            <article key={summary.path} className="rounded-2xl border border-border bg-card px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{summary.fileName}</div>
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <SmartPath path={summary.path} className="w-full" />
                  </div>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">
                  {summary.modifiedAt ? new Date(summary.modifiedAt).toLocaleString() : "Unknown time"}
                </div>
              </div>

              <div className="mt-3 space-y-3 text-sm">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Objective</div>
                  <p className="mt-1 text-foreground">{summary.objective || "No objective stored."}</p>
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Result</div>
                  <p className="mt-1 text-foreground whitespace-pre-wrap">{summary.result || "No result stored."}</p>
                </div>
                {summary.blockers ? (
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Blockers</div>
                    <p className="mt-1 text-muted-foreground whitespace-pre-wrap">{summary.blockers}</p>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
