import { useState, useEffect, useMemo } from "react";
import { BarChart3, Loader2, DollarSign, TrendingUp, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROVIDERS } from "@/lib/provider-config";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

type UsageLog = {
  provider: string;
  model_id: string;
  tokens_input: number;
  tokens_output: number;
  cost_estimate: number | string;
  created_at: string;
};

type Budget = {
  id: string;
  provider: string;
  budget_amount: number | string;
  period: string;
};

type BudgetPeriod = "one_time" | "monthly";

const DEFAULT_BUDGET_PERIOD: BudgetPeriod = "one_time";

const PERIOD_OPTIONS: Array<{ value: BudgetPeriod; label: string }> = [
  { value: "one_time", label: "One-time" },
  { value: "monthly", label: "Monthly reset" },
];

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "8h", hours: 8 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
  { label: "1y", hours: 8760 },
];

function formatBudgetInput(value: number | string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toString() : "";
}

function normalizeBudgetPeriod(value: string | null | undefined): BudgetPeriod {
  return value === "monthly" ? "monthly" : DEFAULT_BUDGET_PERIOD;
}

function periodLabel(period: BudgetPeriod) {
  return period === "monthly" ? "Monthly reset" : "One-time";
}

export function BudgetPage() {
  const [usage, setUsage] = useState<UsageLog[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBudget, setEditBudget] = useState<Record<string, string>>({});
  const [editPeriod, setEditPeriod] = useState<Record<string, BudgetPeriod>>({});
  const [detailProvider, setDetailProvider] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(TIME_RANGES[3]); // 7d default

  const fetch_ = async () => {
    const [uRes, bRes] = await Promise.all([
      supabase.from("api_usage_logs").select("*").order("created_at", { ascending: true }),
      supabase.from("provider_budgets").select("*"),
    ]);

    const usageRows = (uRes.data as UsageLog[] | null) || [];
    const budgetRows = (bRes.data as Budget[] | null) || [];

    setUsage(usageRows);
    setBudgets(budgetRows);
    setEditBudget(
      Object.fromEntries(
        budgetRows.map((budget) => [budget.provider, formatBudgetInput(budget.budget_amount)]),
      ),
    );
    setEditPeriod(
      Object.fromEntries(
        budgetRows.map((budget) => [budget.provider, normalizeBudgetPeriod(budget.period)]),
      ),
    );
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const allProviders = useMemo(() => {
    const knownProviders = PROVIDERS.map((provider) => provider.key);
    const knownProviderSet = new Set(knownProviders);
    const extraProviders = [...new Set([
      ...usage.map((item) => item.provider),
      ...budgets.map((item) => item.provider),
    ])].filter((provider) => !knownProviderSet.has(provider));

    return [...knownProviders, ...extraProviders];
  }, [budgets, usage]);

  const getProviderUsage = (provider: string) => {
    const now = Date.now();
    const cutoff = now - timeRange.hours * 3600000;
    return usage.filter(u => u.provider === provider && new Date(u.created_at).getTime() >= cutoff);
  };

  const getProviderTotal = (provider: string) => {
    const monthAgo = Date.now() - 30 * 24 * 3600000;
    return usage.filter(u => u.provider === provider && new Date(u.created_at).getTime() >= monthAgo)
      .reduce((sum, u) => sum + Number(u.cost_estimate), 0);
  };

  const getProviderUsageForLimit = (provider: string, period: BudgetPeriod) => {
    if (period === "monthly") return getProviderTotal(provider);
    return usage
      .filter((entry) => entry.provider === provider)
      .reduce((sum, entry) => sum + Number(entry.cost_estimate), 0);
  };

  const saveBudget = async (provider: string) => {
    const rawAmount = (editBudget[provider] || "").trim();
    const amount = Number(rawAmount);
    if (!rawAmount || !Number.isFinite(amount) || amount <= 0) return;

    const existing = budgets.find((budget) => budget.provider === provider);
    const period = editPeriod[provider] || normalizeBudgetPeriod(existing?.period);
    await supabase.from("provider_budgets").upsert(
      {
        provider,
        budget_amount: amount,
        period,
      },
      { onConflict: "provider" },
    );

    fetch_();
  };

  const buildChartData = (provider: string) => {
    const logs = getProviderUsage(provider);
    if (!logs.length) return [];

    // Group by time bucket
    const bucketMs = timeRange.hours <= 1 ? 60000 : timeRange.hours <= 24 ? 3600000 : timeRange.hours <= 168 ? 3600000 * 4 : 86400000;
    const buckets: Record<number, { cost: number; tokens: number; count: number }> = {};
    logs.forEach(l => {
      const key = Math.floor(new Date(l.created_at).getTime() / bucketMs) * bucketMs;
      if (!buckets[key]) buckets[key] = { cost: 0, tokens: 0, count: 0 };
      buckets[key].cost += Number(l.cost_estimate);
      buckets[key].tokens += l.tokens_input + l.tokens_output;
      buckets[key].count += 1;
    });

    return Object.entries(buckets).map(([ts, val]) => ({
      time: new Date(Number(ts)).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
      cost: Math.round(val.cost * 1000) / 1000,
      tokens: val.tokens,
      requests: val.count,
    }));
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Detail view for a single provider
  if (detailProvider) {
    const provDef = PROVIDERS.find(p => p.key === detailProvider);
    const chartData = buildChartData(detailProvider);
    const recentTotal = getProviderTotal(detailProvider);
    const budget = budgets.find(b => b.provider === detailProvider);
    const currentPeriod = normalizeBudgetPeriod(editPeriod[detailProvider] || budget?.period);
    const usedAgainstLimit = getProviderUsageForLimit(detailProvider, currentPeriod);
    const remaining = budget ? Number(budget.budget_amount) - usedAgainstLimit : null;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailProvider(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xl">{provDef?.icon}</span>
          <h3 className="text-lg font-semibold text-foreground">{provDef?.name || detailProvider} Usage</h3>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Used" value={`$${usedAgainstLimit.toFixed(4)}`} />
          <StatCard label="Limit" value={budget ? `$${Number(budget.budget_amount).toFixed(2)}` : "Not set"} />
          <StatCard label="Remaining" value={remaining !== null ? `$${remaining.toFixed(4)}` : "—"} color={remaining !== null && remaining < 0 ? "text-destructive" : undefined} />
          <StatCard label="Window" value={periodLabel(currentPeriod)} />
        </div>

        {/* Time range selector */}
        <div className="flex gap-1">
          {TIME_RANGES.map(tr => (
            <button
              key={tr.label}
              onClick={() => setTimeRange(tr)}
              className={`rounded-md px-3 py-1.5 text-xs font-mono transition-colors ${timeRange.label === tr.label ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
            >
              {tr.label}
            </button>
          ))}
        </div>

        {/* Cost chart */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-[10px] font-mono uppercase text-muted-foreground">Recent spend (30d)</p>
            <p className="mt-1 text-lg font-semibold font-mono text-foreground">${recentTotal.toFixed(4)}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-mono uppercase text-muted-foreground" htmlFor="detail-budget-period">Limit Type</label>
            <select
              id="detail-budget-period"
              aria-label="Provider limit period"
              value={currentPeriod}
              onChange={(event) => setEditPeriod((current) => ({ ...current, [detailProvider]: event.target.value as BudgetPeriod }))}
              className="rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        {chartData.length > 0 ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-xs font-mono uppercase text-muted-foreground mb-3">Cost over time</h4>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v}`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="cost" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className="text-xs font-mono uppercase text-muted-foreground mb-3">Tokens used</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="tokens" fill="hsl(var(--info))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-secondary/20 p-12 text-center">
            <p className="text-sm text-muted-foreground">No usage data for this time range.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Provider spending limits and usage tracking. Set an optional one-time or recurring monthly limit per provider.</p>
      {usage.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-secondary/10 p-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-foreground">No usage data yet.</p>
              <p className="text-xs text-muted-foreground mt-1">You can still set budgets now. Usage will appear after you send messages through a provider.</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        {allProviders.map((providerKey) => {
          const provDef = PROVIDERS.find((provider) => provider.key === providerKey);
          const providerLabel = provDef?.name || providerKey;
          const budget = budgets.find((item) => item.provider === providerKey);
          const currentPeriod = editPeriod[providerKey] || normalizeBudgetPeriod(budget?.period);
          const usedAgainstLimit = getProviderUsageForLimit(providerKey, currentPeriod);
          const recentTotal = getProviderTotal(providerKey);
          const pct = budget && Number(budget.budget_amount) > 0 ? Math.min((usedAgainstLimit / Number(budget.budget_amount)) * 100, 100) : 0;
          const draftBudget = editBudget[providerKey] || "";
          const parsedDraftBudget = Number(draftBudget);
          const canSaveBudget = draftBudget.trim().length > 0 && Number.isFinite(parsedDraftBudget) && parsedDraftBudget > 0;

          return (
            <div key={providerKey} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-lg">{provDef?.icon || "📦"}</span>
                <span className="text-sm font-medium text-foreground flex-1">{providerLabel}</span>
                <button
                  onClick={() => setDetailProvider(providerKey)}
                  className="rounded-md bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1"
                >
                  <TrendingUp className="h-3 w-3" /> Details
                </button>
              </div>

              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-16 text-right">
                  {budget ? `${Math.round(pct)}%` : "—"}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Used: <span className="text-foreground font-mono">${usedAgainstLimit.toFixed(4)}</span></span>
                <span>
                  Limit:{" "}
                  <span className="text-foreground font-mono">
                    {budget ? `$${Number(budget.budget_amount).toFixed(2)}` : "Not set"}
                  </span>
                </span>
                <span>Recent 30d: <span className="text-foreground font-mono">${recentTotal.toFixed(4)}</span></span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  aria-label={`${providerLabel} limit amount`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Set limit"
                  value={draftBudget}
                  onChange={(event) => setEditBudget((current) => ({ ...current, [providerKey]: event.target.value }))}
                  className="w-28 rounded border border-border bg-background px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <select
                  aria-label={`${providerLabel} limit period`}
                  value={currentPeriod}
                  onChange={(event) => setEditPeriod((current) => ({ ...current, [providerKey]: event.target.value as BudgetPeriod }))}
                  className="rounded border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  {PERIOD_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  aria-label={`Save ${providerLabel} limit`}
                  disabled={!canSaveBudget}
                  onClick={() => saveBudget(providerKey)}
                  className="rounded bg-primary px-2.5 py-1 text-[10px] text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {budget ? "Update" : "Set"}
                </button>
                <span className="text-[11px] text-muted-foreground">{periodLabel(currentPeriod)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <p className="text-[10px] font-mono uppercase text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold font-mono mt-1 ${color || "text-foreground"}`}>{value}</p>
    </div>
  );
}
