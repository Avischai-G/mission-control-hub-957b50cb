import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCode2, FileText, Folder, Loader2, Moon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ExplorerBrowserLayout, type ExplorerPathCrumb } from "@/components/explorer/ExplorerBrowserLayout";
import { ExplorerListItem } from "@/components/explorer/ExplorerListItem";
import { useRegisterSidebarExplorer } from "@/components/explorer/SidebarExplorer";
import {
  explorerFolderName,
  explorerParentPath,
  normalizeExplorerPath,
  sortExplorerFolderDocs,
  type ExplorerFolderDoc,
} from "@/lib/explorer-utils";

type Report = {
  id: string;
  report_date: string;
  processing_date: string;
  status: string;
  files_created: number | null;
  files_updated: number | null;
  files_split: number | null;
  dedup_count: number | null;
  summary: string | null;
  errors: string[] | null;
  completed_at: string | null;
};

type Selection =
  | { kind: "readme"; path: string }
  | { kind: "report"; id: string };

function reportFolderPath(report: Report) {
  const [year, month] = report.report_date.split("-").slice(0, 2);
  return `${year}/${month}`;
}

function joinPath(parentPath: string, childName: string) {
  return parentPath ? `${parentPath}/${childName}` : childName;
}

function folderChain(path: string) {
  const parts = normalizeExplorerPath(path).split("/").filter(Boolean);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function reportFolderPurpose(folderPath: string) {
  if (!folderPath) {
    return "Top-level archive of nightly maintenance reports.";
  }

  return "Date-based report folder used to inspect previous maintenance runs.";
}

function reportPickerHint(folderPath: string) {
  if (!folderPath) {
    return "Start here when you need to audit what the nightly pipeline changed or whether it failed.";
  }

  return "Open reports here when you need run status, file changes, or errors for this date range.";
}

function buildReportFolderDocs(reports: Report[]): ExplorerFolderDoc[] {
  const folderPaths = new Set<string>([""]);

  for (const report of reports) {
    let currentPath = "";
    for (const segment of normalizeExplorerPath(reportFolderPath(report)).split("/").filter(Boolean)) {
      currentPath = joinPath(currentPath, segment);
      folderPaths.add(currentPath);
    }
  }

  return Array.from(folderPaths)
    .sort((left, right) => {
      const depthDiff = normalizeExplorerPath(left).split("/").filter(Boolean).length - normalizeExplorerPath(right).split("/").filter(Boolean).length;
      if (depthDiff !== 0) return depthDiff;
      return right.localeCompare(left);
    })
    .map((folderPath) => {
      const childFolders = Array.from(folderPaths)
        .filter((candidate) => explorerParentPath(candidate) === folderPath)
        .sort((left, right) => right.localeCompare(left));
      const files = reports.filter((report) => normalizeExplorerPath(reportFolderPath(report)) === folderPath);
      const lines = [
        `# ${folderPath ? `${explorerFolderName(folderPath)}/` : "Night Reports/"}`,
        "",
        `Auto-generated guide for \`${folderPath || "/"}\`.`,
        "",
        "## Folder Purpose",
        reportFolderPurpose(folderPath),
        "",
        "## Picker Guidance",
        reportPickerHint(folderPath),
        "",
        "## Child Folders",
      ];

      if (childFolders.length === 0) {
        lines.push("- No subfolders yet.");
      } else {
        for (const childPath of childFolders) {
          lines.push(`- \`${explorerFolderName(childPath)}/\` - ${reportFolderPurpose(childPath)} Pick it when: ${reportPickerHint(childPath)}`);
        }
      }
      lines.push("");

      lines.push("## Report Files");
      if (files.length === 0) {
        lines.push("- No report files are currently assigned to this folder.");
      } else {
        for (const report of files) {
          lines.push(`- \`${report.report_date}.report\` - status: ${report.status}; created: ${report.files_created || 0}; updated: ${report.files_updated || 0}; summary: ${report.summary || "no summary stored"}`);
        }
      }

      return {
        folder_path: folderPath,
        folder_name: explorerFolderName(folderPath),
        parent_path: explorerParentPath(folderPath),
        depth: normalizeExplorerPath(folderPath).split("/").filter(Boolean).length,
        readme_title: folderPath ? `${explorerFolderName(folderPath)} README` : "Night Reports README",
        readme_content: lines.join("\n"),
        file_count: files.length,
        child_folder_count: childFolders.length,
      };
    });
}

export default function NightReportPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [folderDocs, setFolderDocs] = useState<ExplorerFolderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "readme", path: "" });

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("night_reports")
      .select("*")
      .order("report_date", { ascending: false })
      .limit(60);

    const nextReports = (data as Report[]) || [];
    setReports(nextReports);
    setFolderDocs(buildReportFolderDocs(nextReports));
    setCurrentPath("");
    setExpandedPaths([]);
    setSelection({ kind: "readme", path: "" });
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const sortedFolderDocs = useMemo(() => [...folderDocs].sort(sortExplorerFolderDocs), [folderDocs]);
  const currentDoc = folderDocs.find((doc) => doc.folder_path === currentPath) || null;
  const childFolders = folderDocs.filter((doc) => doc.parent_path === currentPath);
  const reportsInFolder = reports.filter((report) => normalizeExplorerPath(reportFolderPath(report)) === currentPath);
  const currentReadme =
    selection.kind === "readme"
      ? folderDocs.find((doc) => doc.folder_path === selection.path) || currentDoc
      : currentDoc;
  const currentReport = selection.kind === "report" ? reports.find((report) => report.id === selection.id) || null : null;
  const breadcrumbs = useMemo(() => (currentPath ? currentPath.split("/").filter(Boolean) : []), [currentPath]);
  const pathCrumbs = useMemo<ExplorerPathCrumb[]>(
    () =>
      breadcrumbs.map((crumb, index) => ({
        label: explorerFolderName(crumb),
        path: breadcrumbs.slice(0, index + 1).join("/"),
      })),
    [breadcrumbs],
  );

  const ensureExpandedPath = useCallback((path: string) => {
    if (!path) return;
    setExpandedPaths((currentPaths) => Array.from(new Set([...currentPaths, ...folderChain(path)])));
  }, []);

  const handlePathSelect = useCallback((path: string) => {
    setCurrentPath(path);
    setSelection({ kind: "readme", path });
    ensureExpandedPath(path);
  }, [ensureExpandedPath]);

  const handleReportSelect = useCallback(
    (id: string) => {
      const report = reports.find((candidate) => candidate.id === id);
      if (!report) return;

      const path = normalizeExplorerPath(reportFolderPath(report));
      setCurrentPath(path);
      setSelection({ kind: "report", id });
      ensureExpandedPath(path);
    },
    [ensureExpandedPath, reports],
  );

  const handleSidebarToggle = useCallback((path: string, nextExpanded: boolean) => {
    setExpandedPaths((currentPaths) => {
      if (nextExpanded) {
        return Array.from(new Set([...currentPaths, ...folderChain(path)]));
      }

      return currentPaths.filter((candidate) => candidate !== path && !candidate.startsWith(`${path}/`));
    });
  }, []);
  const handleSidebarCollapse = useCallback(() => {
    setExpandedPaths([]);
  }, []);

  const sidebarExplorer = useMemo(
    () => ({
      title: "Reports Explorer",
      rootLabel: "Night Reports",
      route: "/night-report",
      folders: sortedFolderDocs
        .filter((doc) => doc.folder_path !== "")
        .map((doc) => ({
          path: doc.folder_path,
          name: doc.folder_name,
          parentPath: doc.parent_path,
          depth: doc.depth,
        })),
      files: reports.map((report) => ({
        id: report.id,
        name: report.report_date,
        parentPath: normalizeExplorerPath(reportFolderPath(report)),
      })),
      selectedFileId: selection.kind === "report" ? selection.id : null,
      onSelectFile: handleReportSelect,
      expandedPaths,
      currentPath,
      onSelectPath: handlePathSelect,
      onTogglePath: handleSidebarToggle,
      onCollapse: handleSidebarCollapse,
      emptyStateLabel: "No report folders yet.",
    }),
    [currentPath, expandedPaths, handlePathSelect, handleReportSelect, handleSidebarCollapse, handleSidebarToggle, reports, selection, sortedFolderDocs],
  );

  useRegisterSidebarExplorer(sidebarExplorer);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <ExplorerBrowserLayout
        rootLabel="Night Reports"
        breadcrumbs={pathCrumbs}
        onSelectPath={handlePathSelect}
        list={
          <div className="space-y-1">
            {childFolders.map((folder) => (
              <ExplorerListItem
                key={folder.folder_path}
                icon={<Folder className="h-4 w-4 text-primary" />}
                title={folder.folder_name}
                subtitle={`${folder.file_count} reports`}
                kindLabel="Folder"
                onClick={() => handlePathSelect(folder.folder_path)}
              />
            ))}

            {reportsInFolder.map((report) => (
              <ExplorerListItem
                key={report.id}
                icon={<FileCode2 className="h-4 w-4 text-info" />}
                title={report.report_date}
                subtitle={report.status}
                kindLabel="Report"
                selected={selection.kind === "report" && selection.id === report.id}
                onClick={() => handleReportSelect(report.id)}
              />
            ))}

            {currentDoc && (
              <ExplorerListItem
                icon={<FileText className="h-4 w-4 text-accent" />}
                title="README"
                subtitle="Folder guide"
                kindLabel="Readme"
                selected={selection.kind === "readme" && selection.path === currentPath}
                onClick={() => setSelection({ kind: "readme", path: currentPath })}
              />
            )}
          </div>
        }
        preview={
          currentReport ? (
            <ReportInspector report={currentReport} />
          ) : currentReadme ? (
            <FolderReadme doc={currentReadme} />
          ) : (
            <div className="rounded-xl px-3 py-3 text-sm text-muted-foreground">Select a file to preview it.</div>
          )
        }
      />
    </div>
  );
}

function FolderReadme({ doc }: { doc: ExplorerFolderDoc }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <FileText className="h-4 w-4 text-accent" />
          README.md
        </div>
        <h3 className="font-display text-xl font-medium text-foreground">{doc.readme_title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {doc.child_folder_count} child folder{doc.child_folder_count === 1 ? "" : "s"} and {doc.file_count} report file
          {doc.file_count === 1 ? "" : "s"} indexed here.
        </p>
      </div>

      <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-relaxed text-muted-foreground">
        {doc.readme_content}
      </pre>
    </div>
  );
}

function ReportInspector({ report }: { report: Report }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <FileCode2 className="h-4 w-4 text-info" />
          Report File
        </div>
        <h3 className="font-display text-xl font-medium text-foreground">{report.report_date}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {report.summary || "No summary was stored for this run."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard label="Status" value={report.status} />
        <MetricCard label="Processed" value={report.processing_date} />
        <MetricCard label="Created" value={String(report.files_created || 0)} />
        <MetricCard label="Updated" value={String(report.files_updated || 0)} />
        <MetricCard label="Split" value={String(report.files_split || 0)} />
        <MetricCard label="Deduped" value={String(report.dedup_count || 0)} />
      </div>

      {report.errors && report.errors.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-destructive">Errors</div>
          <div className="space-y-2 font-mono text-xs text-destructive">
            {report.errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 px-4 py-3">
      <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}
