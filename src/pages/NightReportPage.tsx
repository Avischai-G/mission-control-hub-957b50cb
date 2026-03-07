import { FileText, Moon } from "lucide-react";

export default function NightReportPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">Night Report</h1>
        <Moon className="h-5 w-5 text-accent" />
      </div>
      <p className="text-sm text-muted-foreground">
        Nightly maintenance results: D-3 chat extraction, knowledge merges, dedupe stats, taxonomy normalization, and index refresh outcomes.
      </p>

      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No night reports yet.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Reports are generated after each nightly pipeline run. The pipeline processes exactly D-3 chat and is idempotent and restart-safe.
        </p>
      </div>
    </div>
  );
}
