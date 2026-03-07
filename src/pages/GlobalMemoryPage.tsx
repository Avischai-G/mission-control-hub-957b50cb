import { Brain, Search, FolderTree } from "lucide-react";

export default function GlobalMemoryPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Global Memory</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Long-term knowledge files, short-term vector memory, and retrieval indexes.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            placeholder="Search knowledge..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={<Brain className="h-5 w-5 text-primary" />}
          label="Knowledge Files"
          value="—"
          sub="No filesystem connected"
        />
        <StatCard
          icon={<FolderTree className="h-5 w-5 text-accent" />}
          label="Domains"
          value="—"
          sub="Awaiting bootstrap"
        />
        <StatCard
          icon={<Search className="h-5 w-5 text-info" />}
          label="Vector Entries (72h)"
          value="—"
          sub="SQLite WAL not connected"
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Connect the backend to browse knowledge domains, view MASTER indexes, and run semantic search.
        </p>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="rounded-md bg-secondary p-2">{icon}</div>
        <span className="font-mono text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-foreground font-mono">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sub}</p>
    </div>
  );
}
