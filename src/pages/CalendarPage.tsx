import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
  Play,
} from "lucide-react";
import {
  addDays,
  addMinutes,
  addWeeks,
  endOfDay,
  format,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
  subWeeks,
} from "date-fns";
import { AgentConfigModal } from "@/components/AgentConfigModal";
import { AgentPreviewSummary } from "@/components/agents/AgentPreviewSummary";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { buildContextEstimate } from "@/lib/context-indicator";
import { cn } from "@/lib/utils";
import { readAgentPromptPreview, type AgentPromptPreview } from "@/lib/workspace-files";

type ScheduleMode =
  | "draft"
  | "once"
  | "15m"
  | "30m"
  | "1h"
  | "2h"
  | "4h"
  | "8h"
  | "12h"
  | "1d"
  | "2d"
  | "1w";

type CalendarView = "day" | "week";

type AgentRow = Database["public"]["Tables"]["agents"]["Row"];
type CronJobRow = Database["public"]["Tables"]["cron_jobs"]["Row"];

type CronJobConfig = {
  agent_id?: string | null;
  agent_name?: string | null;
  model_id?: string | null;
  prompt?: string | null;
};

type CalendarJob = Omit<CronJobRow, "config"> & {
  config: CronJobConfig | null;
};

type Occurrence = {
  job: CalendarJob;
  start: Date;
  agentId: string | null;
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DEFAULT_AGENT_SCHEDULE_PROMPT = "Run your scheduled work according to your instructions and the current project state. If there is nothing meaningful to do, return a concise status update.";

const REPEAT_OPTIONS: Array<{ value: Exclude<ScheduleMode, "draft">; label: string; helper: string }> = [
  { value: "once", label: "Does not repeat", helper: "Runs once at the selected slot." },
  { value: "15m", label: "Every 15 min", helper: "Repeats every 15 minutes from the selected slot." },
  { value: "30m", label: "Every 30 min", helper: "Repeats every 30 minutes from the selected slot." },
  { value: "1h", label: "Every hour", helper: "Repeats hourly from the selected minute." },
  { value: "2h", label: "Every 2 hours", helper: "Repeats every 2 hours from the selected minute." },
  { value: "4h", label: "Every 4 hours", helper: "Repeats every 4 hours from the selected minute." },
  { value: "8h", label: "Every 8 hours", helper: "Repeats every 8 hours from the selected minute." },
  { value: "12h", label: "Every 12 hours", helper: "Repeats every 12 hours from the selected minute." },
  { value: "1d", label: "Every day", helper: "Repeats daily at the selected local time." },
  { value: "2d", label: "Every 2 days", helper: "Repeats every 2 days from the selected date and time." },
  { value: "1w", label: "Every week", helper: "Repeats weekly on the same weekday and time." },
];

const KNOWN_MODES = new Set<ScheduleMode>(["draft", ...REPEAT_OPTIONS.map((option) => option.value)]);

function normalizeCronJobConfig(config: Json | null): CronJobConfig | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  return config as CronJobConfig;
}

function configuredAgentId(config: CronJobConfig | null | undefined) {
  return typeof config?.agent_id === "string" && config.agent_id.trim() ? config.agent_id.trim() : null;
}

function roundToHour(value: Date) {
  const next = new Date(value);
  next.setMinutes(0, 0, 0);
  return next;
}

function scheduleModeLabel(mode: ScheduleMode) {
  if (mode === "draft") return "Draft";
  return REPEAT_OPTIONS.find((option) => option.value === mode)?.label || mode;
}

function scheduleModeHelper(mode: Exclude<ScheduleMode, "draft">) {
  return REPEAT_OPTIONS.find((option) => option.value === mode)?.helper || "";
}

function resolvedRepeatMode(mode: ScheduleMode | null | undefined): Exclude<ScheduleMode, "draft"> {
  if (mode && mode !== "draft") return mode;
  return "once";
}

function inferScheduleMode(job: Pick<CalendarJob, "schedule_mode" | "schedule" | "recurrence_rule">): ScheduleMode {
  const explicit = job.schedule_mode;
  if (typeof explicit === "string" && KNOWN_MODES.has(explicit as ScheduleMode)) {
    return explicit as ScheduleMode;
  }

  const recurrenceRule = typeof job.recurrence_rule === "string" ? job.recurrence_rule.toLowerCase() : "";
  if (KNOWN_MODES.has(recurrenceRule as ScheduleMode)) {
    return recurrenceRule as ScheduleMode;
  }

  const schedule = (job.schedule || "").trim().toLowerCase();
  if (schedule === "draft") return "draft";
  if (schedule.startsWith("*/15 ")) return "15m";
  if (schedule.startsWith("*/30 ")) return "30m";
  if (/^\d+\s\*\/2\s\*\s\*\s\*$/.test(schedule)) return "2h";
  if (/^\d+\s\*\/4\s\*\s\*\s\*$/.test(schedule)) return "4h";
  if (/^\d+\s\*\/8\s\*\s\*\s\*$/.test(schedule)) return "8h";
  if (/^\d+\s\*\/12\s\*\s\*\s\*$/.test(schedule)) return "12h";
  if (/^\d+\s\*\s\*\s\*\s\*$/.test(schedule)) return "1h";
  if (/^\d+\s\d+\s\*\/2\s\*\s\*$/.test(schedule)) return "2d";
  if (/^\d+\s\d+\s\*\s\*\s\d+$/.test(schedule)) return "1w";
  if (/^\d+\s\d+\s\*\s\*\s\*$/.test(schedule)) return "1d";
  return "once";
}

function buildScheduleExpression(startsAt: Date, mode: ScheduleMode) {
  if (mode === "draft") return "draft";

  const minute = startsAt.getMinutes();
  const hour = startsAt.getHours();
  const day = startsAt.getDate();
  const month = startsAt.getMonth() + 1;
  const weekday = startsAt.getDay();

  switch (mode) {
    case "once":
      return `${minute} ${hour} ${day} ${month} *`;
    case "15m":
      return "*/15 * * * *";
    case "30m":
      return "*/30 * * * *";
    case "1h":
      return `${minute} * * * *`;
    case "2h":
      return `${minute} */2 * * *`;
    case "4h":
      return `${minute} */4 * * *`;
    case "8h":
      return `${minute} */8 * * *`;
    case "12h":
      return `${minute} */12 * * *`;
    case "1d":
      return `${minute} ${hour} * * *`;
    case "2d":
      return `${minute} ${hour} */2 * *`;
    case "1w":
      return `${minute} ${hour} * * ${weekday}`;
    default:
      return "draft";
  }
}

function intervalMinutesForMode(mode: ScheduleMode) {
  switch (mode) {
    case "15m":
      return 15;
    case "30m":
      return 30;
    case "1h":
      return 60;
    case "2h":
      return 120;
    case "4h":
      return 240;
    case "8h":
      return 480;
    case "12h":
      return 720;
    case "1d":
      return 1440;
    case "2d":
      return 2880;
    case "1w":
      return 10080;
    default:
      return null;
  }
}

function defaultDurationMinutes(mode: ScheduleMode) {
  switch (mode) {
    case "15m":
      return 15;
    case "30m":
      return 30;
    case "1h":
      return 45;
    default:
      return 60;
  }
}

function isRenderableJob(job: CalendarJob) {
  return job.is_active && inferScheduleMode(job) !== "draft" && Boolean(job.starts_at);
}

function buildOccurrences(job: CalendarJob, rangeStart: Date, rangeEnd: Date): Date[] {
  if (!isRenderableJob(job) || !job.starts_at) return [];

  const startsAt = parseISO(job.starts_at);
  if (startsAt > rangeEnd) return [];

  const mode = inferScheduleMode(job);
  if (mode === "once") {
    return startsAt >= rangeStart && startsAt <= rangeEnd ? [startsAt] : [];
  }

  const intervalMinutes = intervalMinutesForMode(mode);
  if (!intervalMinutes) return [];

  const occurrences: Date[] = [];
  let cursor = new Date(startsAt);

  while (cursor < rangeStart) {
    cursor = addMinutes(cursor, intervalMinutes);
  }

  while (cursor <= rangeEnd) {
    occurrences.push(new Date(cursor));
    cursor = addMinutes(cursor, intervalMinutes);
    if (occurrences.length > 1500) break;
  }

  return occurrences;
}

function hourLabel(hour: number) {
  const sample = new Date();
  sample.setHours(hour, 0, 0, 0);
  return format(sample, "ha");
}

function viewRangeLabel(view: CalendarView, visibleDays: Date[]) {
  if (view === "day") return format(visibleDays[0], "EEEE, MMM d");

  const first = visibleDays[0];
  const last = visibleDays[visibleDays.length - 1];
  if (format(first, "MMM yyyy") === format(last, "MMM yyyy")) {
    return `${format(first, "MMM d")} - ${format(last, "d, yyyy")}`;
  }
  return `${format(first, "MMM d")} - ${format(last, "MMM d, yyyy")}`;
}

function slotLabel(value: Date) {
  return format(value, "EEE, MMM d 'at' HH:mm");
}

export default function CalendarPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<CalendarJob[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [view, setView] = useState<CalendarView>("week");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState(() => roundToHour(new Date()));
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [repeatDrafts, setRepeatDrafts] = useState<Record<string, Exclude<ScheduleMode, "draft">>>({});
  const [search, setSearch] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<AgentPromptPreview | null>(null);
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [settingsAgent, setSettingsAgent] = useState<AgentRow | null>(null);

  const deferredSearch = useDeferredValue(search);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: jobRows, error: jobsError },
        { data: agentRows, error: agentsError },
      ] = await Promise.all([
        supabase
          .from("cron_jobs")
          .select("id, name, schedule, schedule_mode, function_name, is_active, last_run_at, next_run_at, owner_user_id, recurrence_rule, starts_at, duration_minutes, timezone, updated_at, created_at, config")
          .order("created_at", { ascending: true }),
        supabase
          .from("agents")
          .select("id, agent_id, name, role, purpose, is_active, capability_tags, model, group_id, identity_yaml, instructions_md, created_at, updated_at")
          .order("is_active", { ascending: false })
          .order("name", { ascending: true }),
      ]);

      if (jobsError) throw jobsError;
      if (agentsError) throw agentsError;

      const nextJobs = ((jobRows as CronJobRow[]) || []).map((job) => ({
        ...job,
        config: normalizeCronJobConfig(job.config),
      }));

      const nextAgents = (agentRows as AgentRow[]) || [];

      setJobs(nextJobs);
      setAgents(nextAgents);
      setRepeatDrafts((current) => {
        const next = { ...current };
        for (const job of nextJobs) {
          const agentId = configuredAgentId(job.config);
          const mode = inferScheduleMode(job);
          if (agentId && mode !== "draft") next[agentId] = mode;
        }
        return next;
      });
    } catch (error) {
      toast({
        title: "Cron jobs could not load",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadAgentPreview = useCallback(async (agentId: string) => {
    setPreviewLoading(true);
    try {
      const { agent } = await readAgentPromptPreview(agentId);
      setSelectedPreview(agent);
    } catch (error) {
      setSelectedPreview(null);
      toast({
        title: "Could not load agent preview",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (agents.length === 0) {
      setSelectedAgentId(null);
      return;
    }

    if (!selectedAgentId || !agents.some((agent) => agent.agent_id === selectedAgentId)) {
      setSelectedAgentId(agents[0].agent_id);
    }
  }, [agents, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) {
      setSelectedPreview(null);
      return;
    }
    void loadAgentPreview(selectedAgentId);
  }, [loadAgentPreview, selectedAgentId]);

  const visibleDays = useMemo(() => {
    if (view === "day") return [startOfDay(anchorDate)];
    const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset));
  }, [anchorDate, view]);

  const agentsById = useMemo(
    () => new Map(agents.map((agent) => [agent.agent_id, agent])),
    [agents],
  );

  const jobsByAgentId = useMemo(() => {
    const sorted = [...jobs].sort((left, right) => {
      const leftScore = Number(isRenderableJob(left));
      const rightScore = Number(isRenderableJob(right));
      if (leftScore !== rightScore) return rightScore - leftScore;
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    });

    const map = new Map<string, CalendarJob>();
    for (const job of sorted) {
      const agentId = configuredAgentId(job.config);
      if (!agentId || map.has(agentId)) continue;
      map.set(agentId, job);
    }
    return map;
  }, [jobs]);

  const visibleRangeStart = startOfDay(visibleDays[0]);
  const visibleRangeEnd = endOfDay(visibleDays[visibleDays.length - 1]);

  const occurrenceMap = useMemo(() => {
    const map = new Map<string, Occurrence[]>();

    for (const job of jobs) {
      for (const occurrence of buildOccurrences(job, visibleRangeStart, visibleRangeEnd)) {
        const key = `${format(occurrence, "yyyy-MM-dd")}-${occurrence.getHours()}`;
        const next = map.get(key) || [];
        next.push({
          job,
          start: occurrence,
          agentId: configuredAgentId(job.config),
        });
        map.set(key, next);
      }
    }

    for (const entries of map.values()) {
      entries.sort((left, right) => left.start.getTime() - right.start.getTime());
    }

    return map;
  }, [jobs, visibleRangeEnd, visibleRangeStart]);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.agent_id === selectedAgentId) || null,
    [agents, selectedAgentId],
  );

  const selectedJob = selectedAgent ? jobsByAgentId.get(selectedAgent.agent_id) || null : null;

  const selectedRepeatMode = selectedAgent
    ? repeatDrafts[selectedAgent.agent_id] || resolvedRepeatMode(selectedJob ? inferScheduleMode(selectedJob) : "once")
    : "once";

  const selectedPreviewEstimate = useMemo(() => {
    if (!selectedPreview) return null;
    return buildContextEstimate({
      promptContent: selectedPreview.prompt_content,
      agentContextContent: [
        selectedPreview.allowed_tools.join("\n"),
        selectedPreview.recent_task_domains.join("\n"),
      ].join("\n"),
      contextWindowTokens: selectedPreview.model_meta?.context_window_tokens ?? null,
      defaultOutputTokens: selectedPreview.model_meta?.default_output_tokens ?? null,
      modelId: selectedPreview.model,
    });
  }, [selectedPreview]);

  const filteredAgents = useMemo(() => {
    const normalized = deferredSearch.trim().toLowerCase();
    if (!normalized) return agents;

    return agents.filter((agent) =>
      [agent.name, agent.agent_id, agent.role, agent.purpose, agent.model || ""]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [agents, deferredSearch]);

  const scheduledAgentsCount = useMemo(
    () => Array.from(jobsByAgentId.values()).filter((job) => isRenderableJob(job)).length,
    [jobsByAgentId],
  );

  const legacyActiveJobsCount = useMemo(
    () => jobs.filter((job) => isRenderableJob(job) && !configuredAgentId(job.config)).length,
    [jobs],
  );

  const selectSlot = (slot: Date) => {
    setSelectedSlot(slot);
    setAnchorDate(slot);
  };

  const handleScheduleAgent = async (agent: AgentRow) => {
    const repeatMode = repeatDrafts[agent.agent_id] || "once";
    const existingJob = jobsByAgentId.get(agent.agent_id) || null;
    const existingConfig = existingJob?.config || null;

    setSavingAgentId(agent.agent_id);
    try {
      const payload = {
        name: existingJob?.name || `agent:${agent.agent_id}`,
        schedule: buildScheduleExpression(selectedSlot, repeatMode),
        schedule_mode: repeatMode,
        function_name: "cron-execute",
        is_active: true,
        starts_at: selectedSlot.toISOString(),
        duration_minutes: defaultDurationMinutes(repeatMode),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        recurrence_rule: repeatMode,
        next_run_at: selectedSlot.toISOString(),
        config: {
          ...existingConfig,
          agent_id: agent.agent_id,
          agent_name: agent.name,
          prompt: typeof existingConfig?.prompt === "string" && existingConfig.prompt.trim()
            ? existingConfig.prompt
            : DEFAULT_AGENT_SCHEDULE_PROMPT,
        },
      };

      if (existingJob) {
        const { error } = await supabase.from("cron_jobs").update(payload).eq("id", existingJob.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cron_jobs").insert(payload);
        if (error) throw error;
      }

      setSelectedAgentId(agent.agent_id);
      toast({
        title: "Agent scheduled",
        description: `${agent.name} will run ${scheduleModeLabel(repeatMode).toLowerCase()} from ${slotLabel(selectedSlot)}.`,
      });
      await fetchData();
    } catch (error) {
      toast({
        title: "Could not schedule agent",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingAgentId(null);
    }
  };

  const handleUnscheduleAgent = async (agent: AgentRow) => {
    const job = jobsByAgentId.get(agent.agent_id);
    if (!job) return;

    setSavingAgentId(agent.agent_id);
    try {
      const { error } = await supabase
        .from("cron_jobs")
        .update({
          is_active: false,
          schedule: "draft",
          schedule_mode: "draft",
          recurrence_rule: "draft",
          next_run_at: null,
        })
        .eq("id", job.id);

      if (error) throw error;

      toast({ title: "Agent unscheduled", description: `${agent.name} is no longer on the calendar.` });
      await fetchData();
    } catch (error) {
      toast({
        title: "Could not unschedule agent",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSavingAgentId(null);
    }
  };

  const runNow = async (job: CalendarJob) => {
    setRunningJobId(job.id);
    try {
      const { data: run, error: insertError } = await supabase
        .from("cron_job_runs")
        .insert({
          job_id: job.id,
          status: "running",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const { error } = await supabase.functions.invoke("cron-execute", {
        body: { job_id: job.id, run_id: run?.id },
      });

      if (error) throw error;

      toast({ title: "Agent run started", description: "The scheduled agent is running now." });
      await fetchData();
    } catch (error) {
      toast({
        title: "Run failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRunningJobId(null);
    }
  };

  const currentPeriodLabel = view === "day" ? "Current Day" : "Current Week";
  const rangeLabel = viewRangeLabel(view, visibleDays);

  return (
    <>
      <div className="flex h-[calc(100vh-44px)] flex-col overflow-hidden xl:flex-row">
        <section className="flex min-h-0 flex-1 flex-col border-b border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_45%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--background)))] xl:border-b-0 xl:border-r">
          <div className="border-b border-border/70 px-5 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-primary/20 bg-primary/10 p-2">
                    <CalendarDays className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h1 className="font-display text-2xl font-semibold text-foreground">Cron Jobs</h1>
                    <p className="text-sm text-muted-foreground">
                      Schedule agents directly from a clean day or week calendar.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{scheduledAgentsCount} scheduled</span>
                  <span className="h-1 w-1 rounded-full bg-border" />
                  <span>{Math.max(agents.length - scheduledAgentsCount, 0)} unscheduled</span>
                  {legacyActiveJobsCount > 0 ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-border" />
                      <span>{legacyActiveJobsCount} legacy job{legacyActiveJobsCount === 1 ? "" : "s"} still visible on the calendar</span>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-border/70 bg-card/80 p-1 shadow-sm">
                  {(["day", "week"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setView(option)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                        view === option ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option === "day" ? "Day" : "Week"}
                    </button>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    const now = new Date();
                    setAnchorDate(now);
                    setSelectedSlot(roundToHour(now));
                  }}
                >
                  {currentPeriodLabel}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setAnchorDate((current) => (view === "day" ? subDays(current, 1) : subWeeks(current, 1)))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="rounded-full"
                  onClick={() => setAnchorDate((current) => (view === "day" ? addDays(current, 1) : addWeeks(current, 1)))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4 rounded-[1.75rem] border border-border/70 bg-card/70 px-4 py-3 shadow-[0_20px_80px_-48px_hsl(var(--foreground)/0.22)]">
              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Calendar Window</div>
                <div className="mt-1 text-sm font-medium text-foreground">{rangeLabel}</div>
              </div>

              <div className="hidden h-10 w-px bg-border/70 sm:block" />

              <div>
                <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Selected Slot</div>
                <div className="mt-1 text-sm font-medium text-foreground">{slotLabel(selectedSlot)}</div>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto px-4 py-5 sm:px-6">
            <div className={cn(
              "rounded-[2rem] border border-border/70 bg-card/65 shadow-[0_20px_80px_-48px_hsl(var(--foreground)/0.24)]",
              view === "week" ? "min-w-[980px]" : "min-w-[360px]",
            )}>
              {loading ? (
                <div className="flex min-h-[640px] items-center justify-center">
                  <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div
                    className="sticky top-0 z-10 grid border-b border-border/70 bg-background/95 backdrop-blur"
                    style={{ gridTemplateColumns: `74px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
                  >
                    <div className="border-r border-border/70 px-3 py-4" />
                    {visibleDays.map((day) => {
                      const today = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          onClick={() => selectSlot(new Date(day.getFullYear(), day.getMonth(), day.getDate(), selectedSlot.getHours(), 0, 0, 0))}
                          className={cn(
                            "border-r border-border/70 px-3 py-4 text-left last:border-r-0",
                            today && "bg-primary/8",
                          )}
                        >
                          <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{format(day, "EEE")}</div>
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold",
                                today ? "bg-primary text-primary-foreground" : "bg-secondary/70 text-foreground",
                              )}
                            >
                              {format(day, "d")}
                            </span>
                            {today ? <span className="text-xs font-medium text-primary">Today</span> : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `74px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
                  >
                    {HOURS.map((hour) => (
                      <div key={hour} className="contents">
                        <div className="border-r border-b border-border/70 px-3 py-4 text-right text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                          {hourLabel(hour)}
                        </div>

                        {visibleDays.map((day) => {
                          const slot = new Date(day);
                          slot.setHours(hour, 0, 0, 0);
                          const slotKey = `${format(day, "yyyy-MM-dd")}-${hour}`;
                          const slotOccurrences = occurrenceMap.get(slotKey) || [];
                          const isSelected = format(slot, "yyyy-MM-dd-HH") === format(selectedSlot, "yyyy-MM-dd-HH");
                          const today = format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");

                          return (
                            <div
                              key={slotKey}
                              role="button"
                              tabIndex={0}
                              onClick={() => selectSlot(slot)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  selectSlot(slot);
                                }
                              }}
                              className={cn(
                                "min-h-[86px] border-r border-b border-border/70 px-2 py-2 transition-colors last:border-r-0",
                                today && "bg-primary/[0.035]",
                                isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/40",
                              )}
                            >
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                                  {slotOccurrences.length > 0 ? `${slotOccurrences.length} event${slotOccurrences.length === 1 ? "" : "s"}` : ""}
                                </span>
                                {isSelected ? (
                                  <span className="text-[10px] font-medium text-primary">Selected</span>
                                ) : null}
                              </div>

                              <div className="space-y-1">
                                {slotOccurrences.slice(0, 4).map((occurrence) => {
                                  const agent = occurrence.agentId ? agentsById.get(occurrence.agentId) || null : null;
                                  const occurrenceMode = inferScheduleMode(occurrence.job);
                                  const isAgentEvent = Boolean(agent);
                                  const isHighlighted = isAgentEvent
                                    && selectedAgentId === occurrence.agentId
                                    && occurrence.start.getTime() === selectedSlot.getTime();

                                  return (
                                    <button
                                      key={`${occurrence.job.id}-${occurrence.start.toISOString()}`}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        if (!occurrence.agentId) {
                                          toast({
                                            title: "Legacy cron job",
                                            description: "Only agent-backed schedules can be edited from the new sidebar.",
                                          });
                                          return;
                                        }
                                        setSelectedAgentId(occurrence.agentId);
                                        selectSlot(new Date(occurrence.start));
                                      }}
                                      className={cn(
                                        "w-full rounded-2xl border px-2.5 py-2 text-left shadow-sm transition-colors",
                                        isAgentEvent
                                          ? "border-primary/25 bg-primary/10 text-foreground hover:bg-primary/15"
                                          : "border-border/70 bg-secondary/50 text-muted-foreground hover:bg-secondary/70",
                                        isHighlighted && "ring-1 ring-inset ring-primary/50",
                                      )}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-xs font-medium">
                                          {agent?.name || occurrence.job.name}
                                        </span>
                                        <span className="text-[10px] font-mono opacity-70">{format(occurrence.start, "HH:mm")}</span>
                                      </div>
                                      <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.16em] opacity-70">
                                        {isAgentEvent ? scheduleModeLabel(occurrenceMode) : "Legacy"}
                                      </div>
                                    </button>
                                  );
                                })}

                                {slotOccurrences.length > 4 ? (
                                  <div className="rounded-xl border border-dashed border-border/70 px-2.5 py-2 text-[11px] text-muted-foreground">
                                    +{slotOccurrences.length - 4} more
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        <aside className="flex w-full shrink-0 flex-col border-t border-border/70 bg-card/70 xl:w-[430px] xl:border-l xl:border-t-0">
          <div className="border-b border-border/70 px-5 py-5">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Agent Scheduler</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-foreground">Agents</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick a slot on the calendar, then schedule any agent here. Unscheduled agents stay idle.
            </p>

            <div className="mt-4 rounded-[1.5rem] border border-border/70 bg-background/70 px-4 py-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Scheduling To</div>
              <div className="mt-1 text-sm font-medium text-foreground">{slotLabel(selectedSlot)}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {selectedAgent ? `${selectedAgent.name} · ${scheduleModeLabel(selectedRepeatMode)}` : "Select an agent to preview it below."}
              </div>
            </div>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search agents..."
              className="mt-4 w-full rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="flex-1 space-y-4 overflow-auto px-5 py-5">
            <section className="rounded-[1.75rem] border border-border/70 bg-background/70 p-4 shadow-[0_20px_80px_-56px_hsl(var(--foreground)/0.28)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">Selected Agent</div>
                  <h3 className="mt-1 font-display text-lg font-semibold text-foreground">
                    {selectedAgent?.name || "No agent selected"}
                  </h3>
                  {selectedAgent ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {scheduleModeHelper(selectedRepeatMode)} {selectedJob?.starts_at ? `Current start: ${slotLabel(parseISO(selectedJob.starts_at))}.` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose an agent from the list to preview its prompt context and schedule controls.
                    </p>
                  )}
                </div>

                {selectedAgent ? (
                  <div className="flex items-center gap-2">
                    {selectedJob && isRenderableJob(selectedJob) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void runNow(selectedJob)}
                        disabled={runningJobId === selectedJob.id}
                      >
                        {runningJobId === selectedJob.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        Run Now
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSettingsAgent(selectedAgent)}
                    >
                      <Maximize2 className="mr-2 h-4 w-4" />
                      Full Screen
                    </Button>
                  </div>
                ) : null}
              </div>

              <div className="mt-4">
                {previewLoading ? (
                  <div className="flex min-h-[180px] items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : selectedPreview && selectedPreviewEstimate ? (
                  <AgentPreviewSummary
                    agentPreview={selectedPreview}
                    contextEstimate={selectedPreviewEstimate}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-6 text-sm text-muted-foreground">
                    Agent preview unavailable.
                  </div>
                )}
              </div>
            </section>

            <div className="space-y-3">
              {filteredAgents.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-border/70 bg-background/60 px-4 py-8 text-center text-sm text-muted-foreground">
                  No agents match that search.
                </div>
              ) : filteredAgents.map((agent) => {
                const job = jobsByAgentId.get(agent.agent_id) || null;
                const repeatMode = repeatDrafts[agent.agent_id] || resolvedRepeatMode(job ? inferScheduleMode(job) : "once");

                return (
                  <AgentScheduleCard
                    key={agent.id}
                    agent={agent}
                    job={job}
                    repeatMode={repeatMode}
                    selected={selectedAgentId === agent.agent_id}
                    selectedSlot={selectedSlot}
                    saving={savingAgentId === agent.agent_id}
                    onSelect={() => setSelectedAgentId(agent.agent_id)}
                    onRepeatChange={(mode) => setRepeatDrafts((current) => ({ ...current, [agent.agent_id]: mode }))}
                    onSchedule={() => void handleScheduleAgent(agent)}
                    onUnschedule={() => void handleUnscheduleAgent(agent)}
                    onOpenSettings={() => setSettingsAgent(agent)}
                  />
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      <AgentConfigModal
        agent={settingsAgent}
        open={Boolean(settingsAgent)}
        onClose={() => setSettingsAgent(null)}
        onSaved={() => {
          const currentAgentId = settingsAgent?.agent_id || null;
          setSettingsAgent(null);
          void fetchData();
          if (currentAgentId) void loadAgentPreview(currentAgentId);
        }}
      />
    </>
  );
}

function AgentScheduleCard({
  agent,
  job,
  repeatMode,
  selected,
  selectedSlot,
  saving,
  onSelect,
  onRepeatChange,
  onSchedule,
  onUnschedule,
  onOpenSettings,
}: {
  agent: AgentRow;
  job: CalendarJob | null;
  repeatMode: Exclude<ScheduleMode, "draft">;
  selected: boolean;
  selectedSlot: Date;
  saving: boolean;
  onSelect: () => void;
  onRepeatChange: (mode: Exclude<ScheduleMode, "draft">) => void;
  onSchedule: () => void;
  onUnschedule: () => void;
  onOpenSettings: () => void;
}) {
  const scheduled = Boolean(job && isRenderableJob(job));
  const currentMode = job ? inferScheduleMode(job) : repeatMode;

  return (
    <section
      className={cn(
        "rounded-[1.5rem] border bg-background/75 p-4 shadow-sm transition-colors",
        selected ? "border-primary/35 bg-primary/[0.05]" : "border-border/70",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelect();
          }
        }}
        className="w-full cursor-pointer text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">{agent.name}</h3>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.16em]",
                  scheduled ? "bg-primary/12 text-primary" : "bg-secondary/70 text-muted-foreground",
                )}
              >
                {scheduled ? "scheduled" : "idle"}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
              <span>{agent.role}</span>
              <span>{agent.agent_id}</span>
              {agent.model ? <span>{agent.model}</span> : null}
            </div>
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenSettings();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-background/80 text-muted-foreground transition-colors hover:text-foreground"
            title="Open full screen settings"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{agent.purpose}</p>

        <p className="mt-3 text-xs text-muted-foreground">
          {scheduled && job?.starts_at
            ? `Scheduled ${slotLabel(parseISO(job.starts_at))} · ${scheduleModeLabel(currentMode)}`
            : `Will schedule to ${slotLabel(selectedSlot)} · ${scheduleModeLabel(repeatMode)}`}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <select
          value={repeatMode}
          onChange={(event) => onRepeatChange(event.target.value as Exclude<ScheduleMode, "draft">)}
          className="w-full rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground outline-none"
        >
          {REPEAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>

        <Button onClick={onSchedule} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Schedule
        </Button>
      </div>

      {scheduled ? (
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onUnschedule} disabled={saving}>
            Unschedule
          </Button>
        </div>
      ) : null}
    </section>
  );
}
