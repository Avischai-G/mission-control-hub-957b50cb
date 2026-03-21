export type ExplorerFolderDoc = {
  folder_path: string;
  folder_name: string;
  parent_path: string | null;
  depth: number;
  readme_title: string;
  readme_content: string;
  file_count: number;
  child_folder_count: number;
};

export function normalizeExplorerPath(path: string | null | undefined): string {
  if (!path) return "";
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
}

export function explorerParentPath(path: string): string | null {
  const normalized = normalizeExplorerPath(path);
  if (!normalized) return null;
  const parts = normalized.split("/");
  parts.pop();
  return parts.length ? parts.join("/") : "";
}

export function explorerFolderName(path: string) {
  if (!path) return "Root";
  const last = path.split("/").at(-1) || path;
  return last
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sortExplorerFolderDocs(left: ExplorerFolderDoc, right: ExplorerFolderDoc) {
  const depthDiff = left.depth - right.depth;
  if (depthDiff !== 0) return depthDiff;
  return left.folder_path.localeCompare(right.folder_path);
}
