import { useState, useEffect, useMemo } from "react";
import { BarChart3, Loader2, DollarSign, TrendingUp, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PROVIDERS } from "@/lib/provider-config";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

type UsageLog = { provider: string; model_id: string; tokens_input: number; tokens_output: number; cost_estimate: number; created_at: string };
type Budget = { id: string; provider: string; budget_amount: number; period: string };

const TIME_RANGES = [
  { label: "1h", hours: 1 },
  { label: "8h", hours: 8 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
  { label: "1y", hours: 8760 },
];

export function BudgetPage() {
  const [usage, setUsage] = useState<UsageLog[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [editBudget, setEditBudget] = useState<Record<string, string>>({});
  const [detailProvider, setDetailProvider] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(TIME_RANGES[3]); // 7d default

  const fetch_ = async () => {
    const since = new Date(Date.now() - 8760 * 3600000).toISOString(); // load 1 year
    const [uRes, bRes] = await Promise.all([
      supabase.from("api_usage_logs" as any).select("*").gte("created_at", since).order("created_at", { ascending: true }) as any,
      supabase.from("provider_budgets" as any).select("*") as any,
    ]);
    setUsage((uRes.data as UsageLog[]) || []);
    setBudgets((bRes.data as Budget[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetch_(); }, []);

  const providers = useMemo(() => {
    const set = new Set(usage.map(u => u.provider));
    return [...set];
  }, [usage]);

  const getProviderUsage = (provider: string) => {
    const now = Date.now();
    const cutoff = now - timeRange.hours * 3600000;
    return usage.filter(u => u.provider === provider && new Date(u.created_at).getTime() >= cutoff);
  };

  const getProviderTotal = (provider: string) => {
    // Monthly total for budget comparison
    const monthAgo = Date.now() - 30 * 24 * 3600000;
    return usage.filter(u => u.provider === provider && new Date(u.created_at).getTime() >= monthAgo)
      .reduce((sum, u) => sum + Number(u.cost_estimate), 0);
  };

  const saveBudget = async (provider: string) => {
    const amount = parseFloat(editBudget[provider] || "0");
    if (!amount) return;
    const existing = budgets.find(b => b.provider === provider);
    if (existing) {
      await supabase.from("provider_budgets" as any).update({ budget_amount: amount }).eq("id", existing.id);
    } else {
      await supabase.from("provider_budgets" as any).insert({ provider, budget_amount: amount });
    }
    setEditBudget(prev => ({ ...prev, [provider]: "" }));
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
    const total = getProviderTotal(detailProvider);
    const budget = budgets.find(b => b.provider === detailProvider);
    const remaining = budget ? Number(budget.budget_amount) - total : null;

    // Forecast: simple linear extrapolation
    const daysUsed = Math.min(30, timeRange.hours / 24);
    const dailyRate = daysUsed > 0 ? total / daysUsed : 0;
    const monthlyForecast = dailyRate * 30;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setDetailProvider(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-xl">{provDef?.icon}</span>
          <h3 className="text-lg font-semibold text-foreground">{provDef?.name || detailProvider} Usage</h3>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Spent (30d)" value={`$${total.toFixed(4)}`} />
          <StatCard label="Budget" value={budget ? `$${Number(budget.budget_amount).toFixed(2)}` : "Not set"} />
          <StatCard label="Remaining" value={remaining !== null ? `$${remaining.toFixed(4)}` : "—"} color={remaining !== null && remaining < 0 ? "text-destructive" : undefined} />
          <StatCard label="Forecast (30d)" value={`$${monthlyForecast.toFixed(4)}`} />
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

  // Overview
  const allProviders = [...new Set([...providers, ...budgets.map(b => b.provider)])];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Provider budgets and usage tracking. Set a monthly budget per provider.</p>

      {allProviders.length === 0 && providers.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center">
          <BarChart3 className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No usage data yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Usage will appear as you send messages through configured providers.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(allProviders.length > 0 ? allProviders : PROVIDERS.map(p => p.key)).map(providerKey => {
            const provDef = PROVIDERS.find(p => p.key === providerKey);
            const total = getProviderTotal(providerKey);
            const budget = budgets.find(b => b.provider === providerKey);
            const pct = budget && Number(budget.budget_amount) > 0 ? Math.min((total / Number(budget.budget_amount)) * 100, 100) : 0;

            return (
              <div key={providerKey} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-lg">{provDef?.icon || "📦"}</span>
                  <span className="text-sm font-medium text-foreground flex-1">{provDef?.name || providerKey}</span>
                  <button
                    onClick={() => setDetailProvider(providerKey)}
                    className="rounded-md bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors flex items-center gap-1"
                  >
                    <TrendingUp className="h-3 w-3" /> Details
                  </button>
                </div>

                {/* Budget bar */}
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

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Spent: <span className="text-foreground font-mono">${total.toFixed(4)}</span></span>
                  {budget ? (
                    <span>Budget: <span className="text-foreground font-mono">${Number(budget.budget_amount).toFixed(2)}</span>/mo</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Set budget"
                        value={editBudget[providerKey] || ""}
                        onChange={e => setEditBudget(prev => ({ ...prev, [providerKey]: e.target.value }))}
                        className="w-20 rounded border border-border bg-background px-2 py-0.5 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <button onClick={() => saveBudget(providerKey)} className="rounded bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">Set</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
