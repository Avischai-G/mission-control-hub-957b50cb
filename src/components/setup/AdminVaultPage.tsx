import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Save, ShieldCheck, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { runtimeToolDefinitions } from "@/lib/runtime-tools";
import { getVaultStatus, readVaultPermissions, writeVaultPermissions, type VaultPermissionsSnapshot } from "@/lib/vault-settings";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { SmartPath } from "@/components/path/SmartPath";

type AgentRow = {
  agent_id: string;
  name: string;
  role: string;
};

export function AdminVaultPage() {
  const { toast } = useToast();
  const [statusPath, setStatusPath] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unlocking, setUnlocking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [snapshot, setSnapshot] = useState<VaultPermissionsSnapshot | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ path }, { data: agentRows }] = await Promise.all([
        getVaultStatus(),
        supabase
          .from("agents")
          .select("agent_id, name, role")
          .order("role", { ascending: true })
          .order("name", { ascending: true }),
      ]);
      setStatusPath(path);
      setAgents((agentRows as AgentRow[]) || []);
      setLoading(false);
    };

    void load();
  }, []);

  useEffect(() => {
    if (!snapshot) return;
    const timeoutId = window.setTimeout(() => {
      setSnapshot(null);
      setPassword("");
      toast({ title: "Vault re-locked", description: "The in-memory admin session timed out." });
    }, 5 * 60 * 1000);

    return () => window.clearTimeout(timeoutId);
  }, [snapshot, toast]);

  const orderedAgents = useMemo(
    () => [...agents].sort((left, right) => `${left.role}-${left.name}`.localeCompare(`${right.role}-${right.name}`)),
    [agents],
  );

  const unlock = async () => {
    if (!password) return;
    setUnlocking(true);
    try {
      const { snapshot: nextSnapshot } = await readVaultPermissions(password);
      setSnapshot(nextSnapshot);
      toast({ title: "Vault unlocked" });
    } catch (error) {
      toast({
        title: "Could not unlock vault",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUnlocking(false);
    }
  };

  const save = async () => {
    if (!snapshot || !password) return;
    setSaving(true);
    try {
      const { snapshot: nextSnapshot } = await writeVaultPermissions(password, snapshot.agent_permissions);
      setSnapshot(nextSnapshot);
      toast({ title: "Vault permissions saved" });
    } catch (error) {
      toast({
        title: "Could not save vault permissions",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (agentId: string, toolName: string) => {
    setSnapshot((current) => {
      if (!current) return current;
      const currentTools = current.agent_permissions[agentId] || [];
      const nextTools = currentTools.includes(toolName)
        ? currentTools.filter((tool) => tool !== toolName)
        : [...currentTools, toolName].sort();
      return {
        ...current,
        agent_permissions: {
          ...current.agent_permissions,
          [agentId]: nextTools,
        },
      };
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-card/70 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin Vault
            </div>
            <h2 className="mt-3 font-display text-xl font-semibold text-foreground">Encrypted permission snapshot</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Tool permissions are edited here instead of the normal app surfaces. The password stays only in this browser session while the vault is unlocked.
            </p>
            <div className="mt-2 text-xs font-mono text-muted-foreground">
              <SmartPath path={statusPath} className="w-full" />
            </div>
          </div>

          {snapshot ? (
            <Button variant="outline" onClick={() => { setSnapshot(null); setPassword(""); }}>
              <Lock className="h-4 w-4" />
              Lock Vault
            </Button>
          ) : null}
        </div>
      </div>

      {!snapshot ? (
        <div className="rounded-3xl border border-border/70 bg-card/70 p-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter vault password"
                className="w-full rounded-2xl border border-border/70 bg-background/70 px-4 py-3 pr-11 text-sm text-foreground outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Button onClick={() => void unlock()} disabled={!password || unlocking}>
              {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
              Unlock
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Vault snapshot updated {new Date(snapshot.updated_at).toLocaleString()}.
            </p>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Permissions
            </Button>
          </div>

          <div className="space-y-4">
            {orderedAgents.map((agent) => {
              const allowedTools = snapshot.agent_permissions[agent.agent_id] || [];
              return (
                <section key={agent.agent_id} className="rounded-3xl border border-border/70 bg-card/70 p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-display text-lg font-semibold text-foreground">{agent.name}</h3>
                    <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
                      {agent.agent_id}
                    </span>
                    <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
                      {agent.role}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {runtimeToolDefinitions.map((tool) => {
                      const selected = allowedTools.includes(tool.name);
                      return (
                        <label
                          key={tool.name}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-3 transition-colors ${
                            selected ? "border-primary/30 bg-primary/10" : "border-border/70 bg-background/60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => togglePermission(agent.agent_id, tool.name)}
                            className="mt-0.5 h-4 w-4"
                          />
                          <div className="min-w-0">
                            <div className="font-mono text-xs text-foreground">{tool.name}</div>
                            <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{tool.description}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
