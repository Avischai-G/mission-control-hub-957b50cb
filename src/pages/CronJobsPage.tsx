import { Clock, Plus } from "lucide-react";

export default function CronJobsPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Cron Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Scheduled tasks including nightly maintenance, knowledge processing, and index refresh.
          </p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Job
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-5 gap-4 border-b border-border bg-secondary/30 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>Job</span>
          <span>Schedule</span>
          <span>Last Run</span>
          <span>Status</span>
          <span>Next Run</span>
        </div>
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No cron jobs configured.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            The nightly pipeline (D-3 processing, dedupe, taxonomy normalization) will appear here once the backend is connected.
          </p>
        </div>
      </div>
    </div>
  );
}
