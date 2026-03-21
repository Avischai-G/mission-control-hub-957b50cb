import { useCallback, useEffect, useMemo, useState } from "react";
import { FileCode2, FileText, Folder, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ExplorerBrowserLayout, type ExplorerPathCrumb } from "@/components/explorer/ExplorerBrowserLayout";
import { ExplorerListItem } from "@/components/explorer/ExplorerListItem";
import { useRegisterSidebarExplorer } from "@/components/explorer/SidebarExplorer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  explorerFolderName,
  explorerParentPath,
  normalizeExplorerPath,
  sortExplorerFolderDocs,
  type ExplorerFolderDoc,
} from "@/lib/explorer-utils";

type KnowledgeFile = {
  id: string;
  file_path: string;
  file_id: string;
  title: string;
  domain: string;
  subdomain: string | null;
  word_count: number;
  is_valid: boolean;
  updated_at: string;
  summary: string | null;
  content: string;
  validation_errors: string[] | null;
};

type Selection =
  | { kind: "readme"; path: string }
  | { kind: "file"; id: string };

function memoryFolderPath(file: KnowledgeFile) {
  const normalizedPath = normalizeExplorerPath(file.file_path);
  const parts = normalizedPath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function joinPath(parentPath: string, childName: string) {
  return parentPath ? `${parentPath}/${childName}` : childName;
}

function folderChain(path: string) {
  const parts = normalizeExplorerPath(path).split("/").filter(Boolean);
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function memoryFolderPurpose(folderPath: string) {
  if (!folderPath) {
    return "Top-level index for long-term knowledge files that can be loaded as context.";
  }

  return "Folder of long-term knowledge files grouped by topic path.";
}

function memoryPickerHint(folderPath: string) {
  if (!folderPath) {
    return "Start here when you need durable user or project context and are not yet sure which domain folder contains it.";
  }

  return "Pick files from this folder only when their path, title, and summary clearly match the current task.";
}

function buildMemoryFolderDocs(files: KnowledgeFile[]): ExplorerFolderDoc[] {
  const folderPaths = new Set<string>([""]);

  for (const file of files) {
    let currentPath = "";
    for (const segment of normalizeExplorerPath(memoryFolderPath(file)).split("/").filter(Boolean)) {
      currentPath = joinPath(currentPath, segment);
      folderPaths.add(currentPath);
    }
  }

  return Array.from(folderPaths)
    .sort((left, right) => {
      const depthDiff = normalizeExplorerPath(left).split("/").filter(Boolean).length - normalizeExplorerPath(right).split("/").filter(Boolean).length;
      if (depthDiff !== 0) return depthDiff;
      return left.localeCompare(right);
    })
    .map((folderPath) => {
      const childFolders = Array.from(folderPaths)
        .filter((candidate) => explorerParentPath(candidate) === folderPath)
        .sort((left, right) => left.localeCompare(right));
      const folderFiles = files.filter((file) => normalizeExplorerPath(memoryFolderPath(file)) === folderPath);
      const lines = [
        `# ${folderPath ? `${explorerFolderName(folderPath)}/` : "Global Memory/"}`,
        "",
        `Auto-generated guide for \`${folderPath || "/"}\`.`,
        "",
        "## Folder Purpose",
        memoryFolderPurpose(folderPath),
        "",
        "## Picker Guidance",
        memoryPickerHint(folderPath),
        "",
        "## Child Folders",
      ];

      if (childFolders.length === 0) {
        lines.push("- No subfolders yet.");
      } else {
        for (const childPath of childFolders) {
          lines.push(`- \`${explorerFolderName(childPath)}/\` - ${memoryFolderPurpose(childPath)} Pick it when: ${memoryPickerHint(childPath)}`);
        }
      }
      lines.push("");

      lines.push("## Knowledge Files");
      if (folderFiles.length === 0) {
        lines.push("- No knowledge files are currently assigned to this folder.");
      } else {
        for (const file of folderFiles) {
          lines.push(`- \`${memoryFileName(file)}\` (\`${file.file_id}\`) - domain: ${file.domain}${file.subdomain ? `/${file.subdomain}` : ""}; status: ${file.is_valid ? "valid" : "invalid"}; summary: ${file.summary || "no summary stored"}`);
        }
      }

      return {
        folder_path: folderPath,
        folder_name: explorerFolderName(folderPath),
        parent_path: explorerParentPath(folderPath),
        depth: normalizeExplorerPath(folderPath).split("/").filter(Boolean).length,
        readme_title: folderPath ? `${explorerFolderName(folderPath)} Overview` : "Global Memory Overview",
        readme_content: lines.join("\n"),
        file_count: folderFiles.length,
        child_folder_count: childFolders.length,
      };
    });
}

function memoryFileName(file: KnowledgeFile) {
  const parts = normalizeExplorerPath(file.file_path).split("/").filter(Boolean);
  return parts.at(-1) || file.title;
}

function isMemoryReadmeFile(file: KnowledgeFile) {
  return memoryFileName(file).toLowerCase() === "readme.md";
}

function findFolderReadmeFile(files: KnowledgeFile[], folderPath: string) {
  const normalizedFolderPath = normalizeExplorerPath(folderPath);
  return (
    files.find(
      (file) =>
        normalizeExplorerPath(memoryFolderPath(file)) === normalizedFolderPath &&
        isMemoryReadmeFile(file),
    ) || null
  );
}

function coerceMemoryPath(files: KnowledgeFile[], docs: ExplorerFolderDoc[], requestedPath: string) {
  let path = normalizeExplorerPath(requestedPath);

  while (
    path &&
    !docs.some((doc) => doc.folder_path === path) &&
    !files.some((file) => normalizeExplorerPath(memoryFolderPath(file)) === path)
  ) {
    path = explorerParentPath(path) ?? "";
  }

  return path;
}

function resolveSelection(
  files: KnowledgeFile[],
  docs: ExplorerFolderDoc[],
  folderPath: string,
  preferredSelection?: Selection,
): Selection {
  const normalizedPath = coerceMemoryPath(files, docs, folderPath);
  const readmeFile = findFolderReadmeFile(files, normalizedPath);

  if (preferredSelection?.kind === "file" && files.some((file) => file.id === preferredSelection.id)) {
    return preferredSelection;
  }

  if (preferredSelection?.kind === "readme" && docs.some((doc) => doc.folder_path === preferredSelection.path) && !readmeFile) {
    return preferredSelection;
  }

  if (readmeFile) {
    return { kind: "file", id: readmeFile.id };
  }

  if (docs.some((doc) => doc.folder_path === normalizedPath)) {
    return { kind: "readme", path: normalizedPath };
  }

  const firstFile = files.find((file) => normalizeExplorerPath(memoryFolderPath(file)) === normalizedPath);
  if (firstFile) {
    return { kind: "file", id: firstFile.id };
  }

  return { kind: "readme", path: "" };
}

export function GlobalMemoryTab() {
  const [searchQuery, setSearchQuery] = useState("");
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [folderDocs, setFolderDocs] = useState<ExplorerFolderDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPath, setCurrentPath] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<string[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "readme", path: "" });
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [savingFileId, setSavingFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchFiles = useCallback(async (options?: { path?: string; selection?: Selection }) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("knowledge_files")
      .select("id, file_path, file_id, title, domain, subdomain, word_count, is_valid, updated_at, summary, content, validation_errors")
      .order("file_path", { ascending: true })
      .limit(200);

    if (error) {
      toast({ title: "Could not load knowledge files", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const nextFiles = (data as KnowledgeFile[]) || [];
    const nextFolderDocs = buildMemoryFolderDocs(nextFiles);
    const nextPath = coerceMemoryPath(nextFiles, nextFolderDocs, options?.path ?? "");

    setFiles(nextFiles);
    setFolderDocs(nextFolderDocs);
    setCurrentPath(nextPath);
    setExpandedPaths(nextPath ? folderChain(nextPath) : []);
    setSelection(resolveSelection(nextFiles, nextFolderDocs, nextPath, options?.selection));
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const filteredFiles = searchQuery
    ? files.filter((file) => {
        const query = searchQuery.toLowerCase();
        return (
          file.title?.toLowerCase().includes(query) ||
          file.file_path?.toLowerCase().includes(query) ||
          file.summary?.toLowerCase().includes(query)
        );
      })
    : files;

  const sortedFolderDocs = useMemo(() => [...folderDocs].sort(sortExplorerFolderDocs), [folderDocs]);
  const currentDoc = folderDocs.find((doc) => doc.folder_path === currentPath) || null;
  const childFolders = folderDocs.filter((doc) => doc.parent_path === currentPath);
  const filesInFolder = filteredFiles.filter((file) => normalizeExplorerPath(memoryFolderPath(file)) === currentPath);
  const folderReadmeFile = findFolderReadmeFile(files, currentPath);
  const showFolderOverview = Boolean(currentDoc) && !folderReadmeFile;
  const currentReadme =
    selection.kind === "readme"
      ? folderDocs.find((doc) => doc.folder_path === selection.path) || currentDoc
      : null;
  const currentFile =
    selection.kind === "file"
      ? filteredFiles.find((file) => file.id === selection.id) || files.find((file) => file.id === selection.id) || null
      : null;
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
    const nextReadmeFile = findFolderReadmeFile(files, path);
    setCurrentPath(path);
    setSelection(nextReadmeFile ? { kind: "file", id: nextReadmeFile.id } : { kind: "readme", path });
    ensureExpandedPath(path);
  }, [ensureExpandedPath, files]);

  const handleFileSelect = useCallback(
    (id: string) => {
      const file = files.find((candidate) => candidate.id === id);
      if (!file) return;

      const path = normalizeExplorerPath(memoryFolderPath(file));
      setCurrentPath(path);
      setSelection({ kind: "file", id });
      ensureExpandedPath(path);
    },
    [ensureExpandedPath, files],
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

  useEffect(() => {
    if (!currentFile) {
      setDraftTitle("");
      setDraftSummary("");
      setDraftContent("");
      return;
    }

    setDraftTitle(currentFile.title);
    setDraftSummary(currentFile.summary || "");
    setDraftContent(currentFile.content);
  }, [currentFile]);

  const handleSaveFile = useCallback(async () => {
    if (!currentFile) return;

    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      toast({ title: "Title is required", description: "Knowledge files need a title.", variant: "destructive" });
      return;
    }

    setSavingFileId(currentFile.id);
    const { error } = await supabase
      .from("knowledge_files")
      .update({
        title: nextTitle,
        summary: draftSummary.trim() || null,
        content: draftContent,
        word_count: draftContent.trim() ? draftContent.trim().split(/\s+/).length : 0,
      })
      .eq("id", currentFile.id);

    setSavingFileId(null);

    if (error) {
      toast({ title: "Could not save knowledge file", description: error.message, variant: "destructive" });
      return;
    }

    await fetchFiles({ path: currentPath, selection: { kind: "file", id: currentFile.id } });
    toast({ title: "Knowledge file saved" });
  }, [currentFile, currentPath, draftContent, draftSummary, draftTitle, fetchFiles, toast]);

  const handleDeleteFile = useCallback(async () => {
    if (!currentFile) return;

    if (!window.confirm(`Delete ${memoryFileName(currentFile)}? This removes it from global memory.`)) {
      return;
    }

    setDeletingFileId(currentFile.id);
    const { error } = await supabase.from("knowledge_files").delete().eq("id", currentFile.id);
    setDeletingFileId(null);

    if (error) {
      toast({ title: "Could not delete knowledge file", description: error.message, variant: "destructive" });
      return;
    }

    await fetchFiles({ path: currentPath, selection: { kind: "readme", path: currentPath } });
    toast({ title: "Knowledge file deleted" });
  }, [currentFile, currentPath, fetchFiles, toast]);

  const fileIsDirty =
    Boolean(currentFile) &&
    (
      draftTitle !== (currentFile?.title || "") ||
      draftSummary !== (currentFile?.summary || "") ||
      draftContent !== (currentFile?.content || "")
    );

  const sidebarExplorer = useMemo(
    () => ({
      title: "Memory Explorer",
      rootLabel: "Global Memory",
      folders: sortedFolderDocs
        .filter((doc) => doc.file_count > 0 || doc.child_folder_count > 0 || doc.folder_path === "")
        .map((doc) => ({
          path: doc.folder_path,
          name: doc.folder_name,
          parentPath: doc.parent_path,
          depth: doc.depth,
        })),
      files: filteredFiles.map((file) => ({
        id: file.id,
        name: memoryFileName(file),
        parentPath: normalizeExplorerPath(memoryFolderPath(file)),
      })),
      selectedFileId: selection.kind === "file" ? selection.id : null,
      onSelectFile: handleFileSelect,
      expandedPaths,
      currentPath,
      onSelectPath: handlePathSelect,
      onTogglePath: handleSidebarToggle,
      onCollapse: handleSidebarCollapse,
      emptyStateLabel: "No memory folders yet.",
    }),
    [currentPath, expandedPaths, filteredFiles, handleFileSelect, handlePathSelect, handleSidebarCollapse, handleSidebarToggle, selection, sortedFolderDocs],
  );

  useRegisterSidebarExplorer(sidebarExplorer);

  return (
    <div>
      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ExplorerBrowserLayout
          rootLabel="Global Memory"
          breadcrumbs={pathCrumbs}
          onSelectPath={handlePathSelect}
          toolbar={
            <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search files"
                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          }
          list={
            <div className="space-y-1">
              {childFolders.map((folder) => (
                <ExplorerListItem
                  key={folder.folder_path}
                  icon={<Folder className="h-4 w-4 text-primary" />}
                  title={folder.folder_name}
                  subtitle={`${folder.file_count} files`}
                  kindLabel="Folder"
                  onClick={() => handlePathSelect(folder.folder_path)}
                />
              ))}

              {filesInFolder.map((file) => (
                <ExplorerListItem
                  key={file.id}
                  icon={<FileCode2 className="h-4 w-4 text-info" />}
                  title={memoryFileName(file)}
                  subtitle={file.title}
                  kindLabel="File"
                  selected={selection.kind === "file" && selection.id === file.id}
                  onClick={() => handleFileSelect(file.id)}
                />
              ))}

              {showFolderOverview && currentDoc && (
                <ExplorerListItem
                  icon={<FileText className="h-4 w-4 text-accent" />}
                  title="Overview"
                  subtitle="Folder guide"
                  kindLabel="Overview"
                  selected={selection.kind === "readme" && selection.path === currentPath}
                  onClick={() => setSelection({ kind: "readme", path: currentPath })}
                />
              )}
            </div>
          }
          preview={
            currentFile ? (
              <KnowledgeFileInspector
                file={currentFile}
                draftTitle={draftTitle}
                draftSummary={draftSummary}
                draftContent={draftContent}
                onDraftTitleChange={setDraftTitle}
                onDraftSummaryChange={setDraftSummary}
                onDraftContentChange={setDraftContent}
                onSave={handleSaveFile}
                onDelete={handleDeleteFile}
                isDirty={fileIsDirty}
                saving={savingFileId === currentFile.id}
                deleting={deletingFileId === currentFile.id}
              />
            ) : currentReadme ? (
              <FolderReadme doc={currentReadme} />
            ) : (
              <div className="rounded-xl px-3 py-3 text-sm text-muted-foreground">Select a file to preview it.</div>
            )
          }
        />
      )}
    </div>
  );
}

function FolderReadme({ doc }: { doc: ExplorerFolderDoc }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <FileText className="h-4 w-4 text-accent" />
          Folder Overview
        </div>
        <h3 className="font-display text-xl font-medium text-foreground">{doc.readme_title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {doc.child_folder_count} child folder{doc.child_folder_count === 1 ? "" : "s"} and {doc.file_count} file
          {doc.file_count === 1 ? "" : "s"} indexed here.
        </p>
      </div>

      <pre className="overflow-auto whitespace-pre-wrap rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-relaxed text-muted-foreground">
        {doc.readme_content}
      </pre>
    </div>
  );
}

function KnowledgeFileInspector({
  file,
  draftTitle,
  draftSummary,
  draftContent,
  onDraftTitleChange,
  onDraftSummaryChange,
  onDraftContentChange,
  onSave,
  onDelete,
  isDirty,
  saving,
  deleting,
}: {
  file: KnowledgeFile;
  draftTitle: string;
  draftSummary: string;
  draftContent: string;
  onDraftTitleChange: (value: string) => void;
  onDraftSummaryChange: (value: string) => void;
  onDraftContentChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  isDirty: boolean;
  saving: boolean;
  deleting: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <FileCode2 className="h-4 w-4 text-info" />
          Knowledge File
        </div>
        <h3 className="font-display text-xl font-medium text-foreground">{file.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{file.summary || "No summary stored for this file."}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricCard label="Domain" value={file.domain} />
        <MetricCard label="Subdomain" value={file.subdomain || "none"} />
        <MetricCard label="Words" value={String(file.word_count)} />
        <MetricCard label="Status" value={file.is_valid ? "valid" : "invalid"} accent={!file.is_valid} />
      </div>

      <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">File Editor</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{file.file_path}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onDelete} disabled={saving || deleting}>
              {deleting ? "Deleting..." : "Delete File"}
            </Button>
            <Button type="button" onClick={onSave} disabled={!isDirty || saving || deleting}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>

        {isMemoryReadmeFile(file) && (
          <div className="mb-4 rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-sm text-muted-foreground">
            This README can be edited or deleted here, but automated memory jobs may recreate or overwrite it later.
          </div>
        )}

        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Title</span>
            <Input
              aria-label="Knowledge file title"
              value={draftTitle}
              onChange={(event) => onDraftTitleChange(event.target.value)}
              disabled={saving || deleting}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Summary</span>
            <Textarea
              aria-label="Knowledge file summary"
              value={draftSummary}
              onChange={(event) => onDraftSummaryChange(event.target.value)}
              disabled={saving || deleting}
              className="min-h-[100px]"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">Raw File Text</span>
            <Textarea
              aria-label="Knowledge file content"
              value={draftContent}
              onChange={(event) => onDraftContentChange(event.target.value)}
              disabled={saving || deleting}
              className="min-h-[360px] font-mono text-xs leading-relaxed"
            />
          </label>
        </div>
      </div>

      {file.validation_errors && file.validation_errors.length > 0 && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="mb-3 text-xs font-mono uppercase tracking-[0.18em] text-destructive">Validation Errors</div>
          <div className="space-y-2 font-mono text-xs text-destructive">
            {file.validation_errors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 ${accent ? "border-primary/30 bg-primary/10" : "border-border/70 bg-card/70"}`}>
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`truncate text-sm font-semibold sm:text-base ${accent ? "text-primary" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
