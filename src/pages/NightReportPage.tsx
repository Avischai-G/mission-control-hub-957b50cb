import { useState, useEffect } from "react";
import { FileText, Moon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Report = {
  id: string;
  report_date: string;
  processing_date: string;
  status: string;
  files_created: number | null;
  files_updated: number | null;
  files_split: number | null;
  dedup_count: number | null;
  summary: string | null;
  errors: string[] | null;
  completed_at: string | null;
};

export default function NightReportPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      const { data } = await supabase
        .from("night_reports")
        .select("*")
        .order("report_date", { ascending: false })
        .limit(30);
      setReports((data as Report[]) || []);
      setLoading(false);
    };
    fetch_();
  }, []);

  const statusColor = (s: string) => {
    switch (s) {
      case "completed": return "text-success";
      case "failed": return "text-destructive";
      case "running": return "text-warning";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">Night Report</h1>
        <Moon className="h-5 w-5 text-accent" />
      </div>
      <p className="text-sm text-muted-foreground">Nightly D-3 processing results and knowledge system maintenance.</p>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No night reports yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Reports are generated after each nightly pipeline run.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <div key={r.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-sm text-foreground">{r.report_date}</span>
                <span className={`font-mono text-xs uppercase ${statusColor(r.status)}`}>{r.status}</span>
              </div>
              {r.summary && <p className="text-sm text-muted-foreground mb-2">{r.summary}</p>}
              <div className="flex gap-4 text-xs text-muted-foreground font-mono">
                <span>Created: {r.files_created ?? 0}</span>
                <span>Updated: {r.files_updated ?? 0}</span>
                <span>Split: {r.files_split ?? 0}</span>
                <span>Deduped: {r.dedup_count ?? 0}</span>
              </div>
              {r.errors?.length ? (
                <div className="mt-2 text-xs text-destructive font-mono">
                  {r.errors.map((e, i) => <div key={i}>⚠ {e}</div>)}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
