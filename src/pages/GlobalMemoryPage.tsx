import { useState, useEffect } from "react";
import { Brain, Search, FolderTree, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function GlobalMemoryPage() {
  const [stats, setStats] = useState({ files: 0, domains: 0, chunks: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const [filesRes, domainsRes, chunksRes] = await Promise.all([
        supabase.from("knowledge_files").select("id", { count: "exact", head: true }),
        supabase.from("knowledge_files").select("domain").then(r => new Set(r.data?.map(d => d.domain)).size),
        supabase.from("recent_memory_chunks").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        files: filesRes.count || 0,
        domains: typeof domainsRes === 'number' ? domainsRes : 0,
        chunks: chunksRes.count || 0,
      });
    };
    const fetchFiles = async () => {
      const { data } = await supabase
        .from("knowledge_files")
        .select("id, file_path, file_id, title, domain, subdomain, word_count, is_valid, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      setFiles(data || []);
      setLoading(false);
    };
    fetchStats();
    fetchFiles();
  }, []);

  const filtered = searchQuery
    ? files.filter(f => f.title?.toLowerCase().includes(searchQuery.toLowerCase()) || f.file_path?.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">Global Memory</h1>
          <p className="text-sm text-muted-foreground mt-1">Long-term knowledge files, short-term vector memory, and retrieval indexes.</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search knowledge..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={<Brain className="h-5 w-5 text-primary" />} label="Knowledge Files" value={String(stats.files)} sub={stats.files ? `${stats.files} files indexed` : "No files yet"} />
        <StatCard icon={<FolderTree className="h-5 w-5 text-accent" />} label="Domains" value={String(stats.domains)} sub={stats.domains ? `${stats.domains} domains` : "No domains"} />
        <StatCard icon={<Search className="h-5 w-5 text-info" />} label="Memory Chunks (72h)" value={String(stats.chunks)} sub={stats.chunks ? `${stats.chunks} vector entries` : "No recent memory"} />
      </div>

      {loading ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No knowledge files found. Files will appear as the knowledge system grows.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-5 gap-4 border-b border-border bg-secondary/30 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            <span>Path</span><span>Title</span><span>Domain</span><span>Words</span><span>Status</span>
          </div>
          {filtered.map(f => (
            <div key={f.id} className="grid grid-cols-5 gap-4 border-b border-border px-4 py-3 text-sm">
              <span className="font-mono text-xs text-foreground truncate">{f.file_path}</span>
              <span className="text-foreground">{f.title}</span>
              <span className="text-muted-foreground">{f.domain}{f.subdomain ? `/${f.subdomain}` : ''}</span>
              <span className="font-mono text-xs text-muted-foreground">{f.word_count}</span>
              <span className={`text-xs font-mono ${f.is_valid ? 'text-success' : 'text-destructive'}`}>{f.is_valid ? 'Valid' : 'Invalid'}</span>
            </div>
          ))}
        </div>
      )}
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
