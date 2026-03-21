import { createContext, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type SidebarExplorerFolder = {
  path: string;
  name: string;
  parentPath: string | null;
  depth: number;
};

export type SidebarExplorerFile = {
  id: string;
  name: string;
  parentPath: string | null;
};

export type SidebarExplorerAction = {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
};

export type SidebarExplorerConfig = {
  title: string;
  rootLabel: string;
  route?: string;
  folders: SidebarExplorerFolder[];
  files?: SidebarExplorerFile[];
  selectedFileId?: string | null;
  onSelectFile?: (id: string) => void;
  actions?: SidebarExplorerAction[];
  expandedPaths?: string[];
  currentPath: string;
  onSelectPath: (path: string) => void;
  onTogglePath?: (path: string, expanded: boolean) => void;
  onCollapse?: () => void;
  emptyStateLabel?: string;
};

type SidebarExplorerContextValue = {
  explorer: SidebarExplorerConfig | null;
  setExplorer: (explorer: SidebarExplorerConfig | null) => void;
  isOpen: boolean;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
};

const SidebarExplorerContext = createContext<SidebarExplorerContextValue | null>(null);

export function SidebarExplorerProvider({ children }: { children: ReactNode }) {
  const [explorer, setExplorer] = useState<SidebarExplorerConfig | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo(
    () => ({
      explorer,
      setExplorer,
      isOpen,
      setIsOpen,
    }),
    [explorer, isOpen],
  );

  return <SidebarExplorerContext.Provider value={value}>{children}</SidebarExplorerContext.Provider>;
}

export function useSidebarExplorer() {
  const context = useContext(SidebarExplorerContext);
  if (!context) {
    throw new Error("useSidebarExplorer must be used within a SidebarExplorerProvider.");
  }
  return context;
}

export function useRegisterSidebarExplorer(explorer: SidebarExplorerConfig | null) {
  const { setExplorer, setIsOpen } = useSidebarExplorer();
  const registeredKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setExplorer(explorer);
    const key = explorer ? `${explorer.route || "local"}:${explorer.title}` : null;

    if (key && registeredKeyRef.current !== key) {
      setIsOpen(true);
      registeredKeyRef.current = key;
    }

    return () => setExplorer(null);
  }, [explorer, setExplorer, setIsOpen]);
}

export function SidebarExplorerTree({
  explorer,
  collapsed = false,
  showRootButton = true,
  className,
}: {
  explorer: SidebarExplorerConfig;
  collapsed?: boolean;
  showRootButton?: boolean;
  className?: string;
}) {
  const { setIsOpen } = useSidebarExplorer();
  const foldersByParent = useMemo(() => {
    const map = new Map<string | null, SidebarExplorerFolder[]>();

    for (const folder of explorer.folders) {
      const key = folder.parentPath;
      const existing = map.get(key) || [];
      existing.push(folder);
      map.set(key, existing);
    }

    for (const [key, value] of map.entries()) {
      map.set(
        key,
        [...value].sort((left, right) => left.name.localeCompare(right.name)),
      );
    }

    return map;
  }, [explorer.folders]);

  const filesByParent = useMemo(() => {
    const map = new Map<string | null, SidebarExplorerFile[]>();

    for (const file of explorer.files || []) {
      const key = file.parentPath ?? "";
      const existing = map.get(key) || [];
      existing.push(file);
      map.set(key, existing);
    }

    for (const [key, value] of map.entries()) {
      map.set(
        key,
        [...value].sort((left, right) => left.name.localeCompare(right.name)),
      );
    }

    return map;
  }, [explorer.files]);

  const rootChildren = foldersByParent.get("") || [];
  const rootFiles = filesByParent.get("") || [];

  const expandedPathSet = useMemo(() => new Set(explorer.expandedPaths || []), [explorer.expandedPaths]);
  const isExpanded = (path: string) => path !== "" && expandedPathSet.has(path);
  const isRootActive = explorer.currentPath === "";

  const renderFiles = (parentPath: string) => {
    const files = filesByParent.get(parentPath) || [];
    if (files.length === 0 || !explorer.onSelectFile) return null;

    return (
      <div className="space-y-0.5 pt-0.5">
        {files.map((file) => {
          const selected = explorer.selectedFileId === file.id;

          return (
            <button
              key={file.id}
              type="button"
              onClick={() => {
                explorer.onSelectFile?.(file.id);
                explorer.onCollapse?.();
                setIsOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                selected
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <FileCode2 className="h-4 w-4 shrink-0 text-sidebar-foreground/70" />
              <span className="truncate">{file.name}</span>
            </button>
          );
        })}
      </div>
    );
  };

  const renderBranch = (folder: SidebarExplorerFolder) => {
    const expanded = isExpanded(folder.path);
    const active = explorer.currentPath === folder.path;
    const children = foldersByParent.get(folder.path) || [];
    const hasChildren = children.length > 0 || Boolean(filesByParent.get(folder.path)?.length);

    return (
      <div key={folder.path} className="space-y-1">
        <button
          type="button"
          onClick={() => {
            explorer.onSelectPath(folder.path);
            if (hasChildren) {
              explorer.onTogglePath?.(folder.path, !expanded);
            }
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
            active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
          )}
        >
          {expanded ? <FolderOpen className="h-4 w-4 shrink-0 text-primary" /> : <Folder className="h-4 w-4 shrink-0" />}
          <span className="truncate">{folder.name}</span>
        </button>

        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity,margin] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
            expanded && hasChildren ? "mt-0.5 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            {hasChildren && (
              <div className="space-y-0.5 pl-2">
                {children.map(renderBranch)}
                {renderFiles(folder.path)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (collapsed) return null;

  return (
    <div className={cn("space-y-1", className)}>
      {showRootButton && (
        <button
          type="button"
          onClick={() => explorer.onSelectPath("")}
          className={cn(
            "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
            explorer.currentPath === ""
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
          )}
        >
          <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate font-medium">{explorer.rootLabel}</span>
        </button>
      )}

      {rootChildren.length > 0 ? (
        <div className="space-y-1">
          {rootChildren.map(renderBranch)}
          {isRootActive && rootFiles.length > 0 && renderFiles("")}
        </div>
      ) : (
        rootFiles.length > 0 ? (
          <div className="space-y-1">{renderFiles("")}</div>
        ) : (
          <div className="rounded-xl border border-dashed border-sidebar-border/70 px-3 py-3 text-xs text-sidebar-foreground/60">
            {explorer.emptyStateLabel || "No folders yet."}
          </div>
        )
      )}
    </div>
  );
}
