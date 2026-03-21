import { useState, useEffect, useCallback } from "react";
import {
  Clock, Plus, Loader2, Play, Pause, Trash2, RotateCcw,
  ChevronDown, ChevronRight, AlertTriangle, Check, X, Timer, Zap
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Types ──
type CronJob = {
  id: string;
  name: string;
  schedule: string;
  function_name: string;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  config: Record<string, any> | null;
  created_at: string;
};

type CronJobRun = {
  id: string;
  job_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  error: string | null;
  result: Record<string, any> | null;
};

type LocalRuntimeServiceStatus = {
  healthy: boolean;
  status: string;
  message: string;
};

type LocalRuntimeStatus = {
  checked_at: string;
  healthy: boolean;
  interval_seconds: number;
  last_action: string;
  restart_count: number;
  frontend: LocalRuntimeServiceStatus;
  functions: LocalRuntimeServiceStatus;
  logs: {
    watchdog: string;
    frontend: string;
    functions: string;
  };
};

const SCHEDULE_PRESETS = [
  { label: "Every 5 min", cron: "*/5 * * * *", interval: "5m" },
  { label: "Every 15 min", cron: "*/15 * * * *", interval: "15m" },
  { label: "Every 30 min", cron: "*/30 * * * *", interval: "30m" },
  { label: "Every hour", cron: "0 * * * *", interval: "1h" },
  { label: "Every 8 hours", cron: "0 */8 * * *", interval: "8h" },
  { label: "Daily (9 AM)", cron: "0 9 * * *", interval: "1d" },
  { label: "Weekly (Mon 9 AM)", cron: "0 9 * * 1", interval: "1w" },
];

function humanSchedule(cron: string): string {
  const map: Record<string, string> = {
    "*/5 * * * *": "Every 5 minutes",
    "*/15 * * * *": "Every 15 minutes",
    "*/30 * * * *": "Every 30 minutes",
    "0 * * * *": "Every hour",
    "0 */8 * * *": "Every 8 hours",
    "0 9 * * *": "Daily at 9:00 AM",
    "0 9 * * 1": "Weekly on Monday at 9:00 AM",
  };
  return map[cron] || cron;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

// ══════════════════════════════════════════════
// CronJobsPage — OpenClaw-style scheduler UI
// ══════════════════════════════════════════════
export default function CronJobsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedJob, setExpandedJob] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, CronJobRun[]>>({});
  const [runningManual, setRunningManual] = useState<string | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<LocalRuntimeStatus | null>(null);
  const [runtimeStatusLoading, setRuntimeStatusLoading] = useState(true);
  const { toast } = useToast();

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase
      .from("cron_jobs")
      .select("*")
      .order("created_at", { ascending: false });
    setJobs((data as CronJob[]) || []);
    setLoading(false);
  }, []);

  const fetchRuntimeStatus = useCallback(async () => {
    try {
      const response = await fetch(`/runtime/watchdog-status.json?t=${Date.now()}`, {
        cache: "no-store",
      });

      if (response.status === 404) {
        setRuntimeStatus(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`Watchdog status request failed with ${response.status}`);
      }

      const payload = (await response.json()) as LocalRuntimeStatus;
      setRuntimeStatus(payload);
    } catch (error) {
      console.error("Failed to fetch runtime watchdog status", error);
      setRuntimeStatus(null);
    } finally {
      setRuntimeStatusLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);
  useEffect(() => {
    fetchRuntimeStatus();
    const intervalId = window.setInterval(fetchRuntimeStatus, 30000);
    return () => window.clearInterval(intervalId);
  }, [fetchRuntimeStatus]);

  const fetchRuns = async (jobId: string) => {
    const { data } = await supabase
      .from("cron_job_runs")
      .select("*")
      .eq("job_id", jobId)
      .order("started_at", { ascending: false })
      .limit(10);
    setRuns(prev => ({ ...prev, [jobId]: (data as CronJobRun[]) || [] }));
  };

  const toggleExpand = (jobId: string) => {
    if (expandedJob === jobId) {
      setExpandedJob(null);
    } else {
      setExpandedJob(jobId);
      fetchRuns(jobId);
    }
  };

  const toggleActive = async (job: CronJob) => {
    await supabase.from("cron_jobs").update({ is_active: !job.is_active }).eq("id", job.id);
    fetchJobs();
    toast({ title: job.is_active ? "Job paused" : "Job activated" });
  };

  const deleteJob = async (job: CronJob) => {
    await supabase.from("cron_jobs").update({ is_active: false }).eq("id", job.id);
    // Can't delete due to RLS, just deactivate
    fetchJobs();
    toast({ title: "Job removed" });
  };

  const runNow = async (job: CronJob) => {
    setRunningManual(job.id);
    try {
      // Create a run record
      const { data: run } = await supabase.from("cron_job_runs").insert({
        job_id: job.id, status: "running",
      }).select().single();

      // Invoke the cron-execute edge function
      const { error } = await supabase.functions.invoke("cron-execute", {
        body: { job_id: job.id, run_id: run?.id },
      });

      if (error) throw error;

      await supabase.from("cron_jobs").update({ last_run_at: new Date().toISOString() }).eq("id", job.id);
      toast({ title: "Job executed", description: `"${job.name}" ran successfully.` });
      fetchJobs();
      if (expandedJob === job.id) fetchRuns(job.id);
    } catch (e: any) {
      toast({ title: "Run failed", description: e.message, variant: "destructive" });
    } finally {
      setRunningManual(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground flex items-center gap-2">
            <Clock className="h-6 w-6 text-primary" />
            Cron Jobs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI cron jobs run recurring agent work inside your local app backend. App uptime is handled by the local watchdog below.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Job
        </button>
      </div>

      <LocalRuntimeCard
        status={runtimeStatus}
        loading={runtimeStatusLoading}
        onRefresh={fetchRuntimeStatus}
      />

      {/* Jobs List */}
      {loading ? (
        <div className="flex justify-center p-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : jobs.length === 0 ? (
        <EmptyState onAdd={() => setShowCreate(true)} />
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              expanded={expandedJob === job.id}
              runs={runs[job.id] || []}
              isRunning={runningManual === job.id}
              onToggleExpand={() => toggleExpand(job.id)}
              onToggleActive={() => toggleActive(job)}
              onDelete={() => deleteJob(job)}
              onRunNow={() => runNow(job)}
            />
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateJobModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchJobs(); }}
        />
      )}
    </div>
  );
}

function LocalRuntimeCard({
  status,
  loading,
  onRefresh,
}: {
  status: LocalRuntimeStatus | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const watchdogInterval = status ? formatInterval(status.interval_seconds) : "5m";
  const checkedAt = status?.checked_at ? new Date(status.checked_at).toLocaleString() : "Unavailable";
  const summaryLabel = status ? (status.healthy ? "Healthy" : "Recovering") : "Not connected";
  const summaryTone = status
    ? status.healthy
      ? "text-emerald-600 bg-emerald-500/10"
      : "text-amber-600 bg-amber-500/10"
    : "text-muted-foreground bg-secondary/70";

  return (
    <section className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">Local Watchdog</h2>
            <span className={cn("rounded-full px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em]", summaryTone)}>
              {summaryLabel}
            </span>
          </div>
          <p className="max-w-2xl text-sm text-foreground">
            This watchdog runs locally every {watchdogInterval}, checks the frontend and Edge Functions gateway, and restarts the app with the canonical launcher if either one is unhealthy.
          </p>
          <p className="text-xs text-muted-foreground">
            Use the AI cron jobs below for analysis, summaries, and recurring agent tasks. Keep operational recovery deterministic here.
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 self-start rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh status
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <RuntimeServiceCard
          title="Frontend"
          loading={loading}
          service={status?.frontend || null}
          fallbackMessage="Waiting for watchdog status from the local launcher."
        />
        <RuntimeServiceCard
          title="Functions gateway"
          loading={loading}
          service={status?.functions || null}
          fallbackMessage="Waiting for watchdog status from the local launcher."
        />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Last Action</div>
          <p className="mt-2 text-sm text-foreground">
            {status?.last_action || "Run the canonical launcher once to start the watchdog and publish live status here."}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>Last check: {checkedAt}</span>
            <span>Restart count: {status?.restart_count ?? 0}</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/70 bg-secondary/20 p-4">
          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Log Files</div>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <p className="font-mono text-[11px] text-foreground">{status?.logs.watchdog || "logs/app-watchdog.log"}</p>
            <p className="font-mono text-[11px] text-foreground">{status?.logs.frontend || "logs/app-frontend.log"}</p>
            <p className="font-mono text-[11px] text-foreground">{status?.logs.functions || "logs/app-backend.log"}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function RuntimeServiceCard({
  title,
  service,
  loading,
  fallbackMessage,
}: {
  title: string;
  service: LocalRuntimeServiceStatus | null;
  loading: boolean;
  fallbackMessage: string;
}) {
  const tone = service
    ? service.healthy
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-amber-500/30 bg-amber-500/5"
    : "border-border/70 bg-secondary/20";
  const badgeTone = service
    ? service.healthy
      ? "text-emerald-600 bg-emerald-500/10"
      : "text-amber-600 bg-amber-500/10"
    : "text-muted-foreground bg-secondary/70";

  return (
    <div className={cn("rounded-xl border p-4", tone)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-foreground">{title}</div>
          <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            {service?.status || (loading ? "loading" : "status unavailable")}
          </div>
        </div>
        <span className={cn("rounded-full px-2 py-1 text-[10px] font-mono uppercase tracking-[0.18em]", badgeTone)}>
          {service ? (service.healthy ? "OK" : "Restarting") : loading ? "Loading" : "Unavailable"}
        </span>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {service?.message || fallbackMessage}
      </p>
    </div>
  );
}

// ── Empty State ──
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-16 rounded-xl border border-dashed border-border bg-card/50 text-center">
      <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
        <Timer className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">No cron jobs yet</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4">
        Schedule recurring AI work here. Keep restarts and health checks in the local watchdog above.
        <br />
        Create one here or tell the chat:
        <br />
        <span className="font-mono text-xs text-primary">"Summarize my emails every morning at 9 AM"</span>
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Create First Job
      </button>
    </div>
  );
}

// ── Job Card ──
function JobCard({
  job, expanded, runs, isRunning,
  onToggleExpand, onToggleActive, onDelete, onRunNow,
}: {
  job: CronJob;
  expanded: boolean;
  runs: CronJobRun[];
  isRunning: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onRunNow: () => void;
}) {
  const prompt = job.config?.prompt || job.function_name;
  const lastRunOk = runs[0]?.status === "completed";
  const lastRunFailed = runs[0]?.status === "failed";

  return (
    <div className={cn(
      "rounded-xl border transition-all duration-200",
      job.is_active ? "border-border bg-card" : "border-border/50 bg-card/50 opacity-60",
    )}>
      {/* Header Row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggleExpand} className="text-muted-foreground hover:text-foreground transition-colors">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {/* Status dot */}
        <div className={cn(
          "h-2.5 w-2.5 rounded-full shrink-0",
          job.is_active ? "bg-emerald-500" : "bg-muted-foreground/30"
        )} />

        {/* Name + schedule */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{job.name}</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-secondary text-muted-foreground shrink-0">
              {humanSchedule(job.schedule)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5 max-w-lg">{prompt}</p>
        </div>

        {/* Last run */}
        <div className="hidden md:flex items-center gap-1.5 shrink-0">
          {job.last_run_at ? (
            <>
              {lastRunFailed ? (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              ) : lastRunOk ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : null}
              <span className="text-[11px] text-muted-foreground">{timeAgo(job.last_run_at)}</span>
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">Never run</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onRunNow}
            disabled={isRunning}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30"
            title="Run now"
          >
            {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onToggleActive}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={job.is_active ? "Pause" : "Activate"}
          >
            {job.is_active ? <Pause className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onDelete}
            className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded: Run History */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 bg-secondary/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Recent Runs</span>
            <span className="text-[10px] text-muted-foreground">{runs.length} shown</span>
          </div>
          {runs.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No runs recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {runs.map(run => (
                <RunRow key={run.id} run={run} />
              ))}
            </div>
          )}

          {/* Job config details */}
          {job.config?.prompt && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Prompt</span>
              <p className="text-xs text-foreground mt-1 bg-secondary/50 rounded-lg p-2 font-mono whitespace-pre-wrap">
                {job.config.prompt}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Run Row ──
function RunRow({ run }: { run: CronJobRun }) {
  const isOk = run.status === "completed";
  const isFailed = run.status === "failed";
  const isRunning = run.status === "running";

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={cn(
        "h-2 w-2 rounded-full shrink-0",
        isOk ? "bg-emerald-500" : isFailed ? "bg-destructive" : "bg-accent animate-pulse"
      )} />
      <span className="font-mono text-muted-foreground w-28 shrink-0">
        {new Date(run.started_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className={cn(
        "font-mono px-1.5 py-0.5 rounded-full text-[10px]",
        isOk ? "text-emerald-600 bg-emerald-500/10"
          : isFailed ? "text-destructive bg-destructive/10"
          : "text-accent bg-accent/10"
      )}>
        {isOk ? "OK" : isFailed ? "FAIL" : "RUN"}
      </span>
      {run.completed_at && (
        <span className="text-muted-foreground">
          {Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)}s
        </span>
      )}
      {run.error && <span className="text-destructive truncate flex-1">{run.error}</span>}
    </div>
  );
}

// ── Create Job Modal ──
function CreateJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedPreset, setSelectedPreset] = useState(SCHEDULE_PRESETS[3]); // default: every hour
  const [customCron, setCustomCron] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim()) {
      toast({ title: "Name and prompt are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const schedule = useCustom ? customCron : selectedPreset.cron;
    const { error } = await supabase.from("cron_jobs").insert({
      name: name.trim(),
      schedule,
      function_name: "cron-execute",
      is_active: true,
      config: { prompt: prompt.trim() },
    });
    setSaving(false);
    if (error) {
      toast({ title: "Failed to create job", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Job created", description: `"${name}" scheduled.` });
      onCreated();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">New AI Cron Job</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs font-medium text-foreground mb-1.5 block">Job Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Morning summary"
              className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Prompt */}
          <div>
            <label className="text-xs font-medium text-foreground mb-1.5 block">
              Prompt <span className="text-muted-foreground font-normal">— what the agent should do each run</span>
            </label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="e.g. Review the knowledge base and agent setup, then write a concise prioritized improvement brief."
              rows={3}
              className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Use this for AI analysis or summaries. The local watchdog already handles frontend/functions uptime.
            </p>
          </div>

          {/* Schedule */}
          <div>
            <label className="text-xs font-medium text-foreground mb-2 block">Schedule</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {SCHEDULE_PRESETS.map(preset => (
                <button
                  key={preset.cron}
                  onClick={() => { setSelectedPreset(preset); setUseCustom(false); }}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    !useCustom && selectedPreset.cron === preset.cron
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:border-primary/30"
                  )}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setUseCustom(true)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  useCustom
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:border-primary/30"
                )}
              >
                Custom
              </button>
            </div>
            {useCustom && (
              <input
                value={customCron}
                onChange={e => setCustomCron(e.target.value)}
                placeholder="*/10 * * * *"
                className="w-full rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            )}
            <p className="text-[10px] text-muted-foreground mt-1.5">
              {useCustom ? "Standard 5-field cron expression" : humanSchedule(selectedPreset.cron)}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !prompt.trim()}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Job
          </button>
        </div>
      </div>
    </div>
  );
}
