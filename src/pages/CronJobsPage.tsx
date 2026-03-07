import { useState, useEffect } from "react";
import { Clock, Plus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type CronJob = {
  id: string;
  name: string;
  schedule: string;
  function_name: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
};

export default function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = async () => {
      const { data } = await supabase.from("cron_jobs").select("*").order("created_at", { ascending: false });
      setJobs((data as CronJob[]) || []);
      setLoading(false);
    };
    fetch_();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Cron Jobs</h1>
          <p className="text-sm text-muted-foreground mt-1">Scheduled tasks including nightly maintenance, knowledge processing, and index refresh.</p>
        </div>
        <button className="flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          Add Job
        </button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-5 gap-4 border-b border-border bg-secondary/30 px-4 py-2.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>Job</span><span>Schedule</span><span>Last Run</span><span>Status</span><span>Next Run</span>
        </div>
        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No cron jobs configured.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">The nightly pipeline will appear here once configured.</p>
          </div>
        ) : (
          jobs.map(j => (
            <div key={j.id} className="grid grid-cols-5 gap-4 border-b border-border px-4 py-3 text-sm">
              <span className="font-mono text-xs text-foreground">{j.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{j.schedule}</span>
              <span className="text-xs text-muted-foreground">{j.last_run_at ? new Date(j.last_run_at).toLocaleString() : '—'}</span>
              <span className={`text-xs font-mono ${j.is_active ? 'text-success' : 'text-muted-foreground'}`}>{j.is_active ? 'Active' : 'Inactive'}</span>
              <span className="text-xs text-muted-foreground">{j.next_run_at ? new Date(j.next_run_at).toLocaleString() : '—'}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
