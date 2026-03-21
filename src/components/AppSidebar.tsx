import { useCallback, useEffect, useState } from "react";
import {
  MessageSquare,
  CalendarDays,
  Settings,
  FolderOpen,
  HardDrive,
  Loader2,
  Pin,
  Plus,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLocalFileInfo } from "@/lib/local-file-service";
import {
  FILES_QUICK_ACCESS_UPDATED_EVENT,
  readPinnedFolders,
} from "@/lib/files-quick-access";
import { joinFsPath, normalizeFsPathForCompare } from "@/lib/path-utils";
import { cn } from "@/lib/utils";
import { createTopicConversation, fetchConversations, fetchDefaultConversationId, type Conversation } from "@/lib/conversations";

const mainItems = [
  { title: "Cron Jobs", url: "/cron-jobs", icon: CalendarDays },
];

const COMPUTER_TITLE = "Computer";

interface AppSidebarProps {
  onOpenSetup: (page?: string) => void;
}

export function AppSidebar({ onOpenSetup }: AppSidebarProps) {
  const { state, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [chatTopics, setChatTopics] = useState<Conversation[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [filesMenuOpen, setFilesMenuOpen] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ defaultPath: string; computerRootPath: string; clawDataRoot: string } | null>(null);
  const [pinnedFolders, setPinnedFolders] = useState<string[]>([]);

  const activeConversationId = new URLSearchParams(location.search).get("conversation");
  const requestedFilesPath = new URLSearchParams(location.search).get("path");
  const currentFilesPath = requestedFilesPath || fileInfo?.defaultPath || "";

  const loadChatTopics = useCallback(async () => {
    setChatLoading(true);
    try {
      const conversations = await fetchConversations();
      setChatTopics(conversations);
    } finally {
      setChatLoading(false);
    }
  }, []);

  const openDefaultChat = useCallback(async () => {
    const conversations = await fetchConversations();
    const defaultConversationId = await fetchDefaultConversationId(conversations);
    navigate(defaultConversationId ? `/chat?conversation=${defaultConversationId}` : "/chat");
    setChatTopics(conversations);
  }, [navigate]);

  const handleCreateTopic = useCallback(async () => {
    const title = window.prompt("Topic name");
    if (!title?.trim()) return;

    const conversation = await createTopicConversation(title.trim());
    await loadChatTopics();
    navigate(`/chat?conversation=${conversation.id}`);
    setChatMenuOpen(false);
  }, [loadChatTopics, navigate]);

  const chatActive = location.pathname === "/chat";
  const filesActive = location.pathname === "/files";

  useEffect(() => {
    void getLocalFileInfo()
      .then((nextInfo) => {
        setFileInfo({
          defaultPath: nextInfo.defaultPath,
          computerRootPath: nextInfo.computerRootPath,
          clawDataRoot: nextInfo.clawDataRoot,
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const syncPinnedFolders = () => setPinnedFolders(readPinnedFolders());
    syncPinnedFolders();
    window.addEventListener(FILES_QUICK_ACCESS_UPDATED_EVENT, syncPinnedFolders);
    window.addEventListener("storage", syncPinnedFolders);
    return () => {
      window.removeEventListener(FILES_QUICK_ACCESS_UPDATED_EVENT, syncPinnedFolders);
      window.removeEventListener("storage", syncPinnedFolders);
    };
  }, []);

  const navigateToFilesPath = useCallback((nextPath: string) => {
    const params = new URLSearchParams();
    params.set("path", nextPath);
    navigate(`/files?${params.toString()}`);
  }, [navigate]);

  const builtInFileShortcuts = fileInfo ? [
    { label: "App Directory", path: fileInfo.defaultPath, icon: FolderOpen },
    { label: COMPUTER_TITLE, path: fileInfo.computerRootPath, icon: HardDrive },
    { label: "Agents", path: joinFsPath(fileInfo.clawDataRoot, "agents"), icon: FolderOpen },
    { label: "Knowledge", path: joinFsPath(fileInfo.clawDataRoot, "knowledge"), icon: FolderOpen },
    { label: "Run Summaries", path: joinFsPath(fileInfo.clawDataRoot, "runs"), icon: FolderOpen },
    { label: "Learning Reports", path: joinFsPath(fileInfo.clawDataRoot, "learning", "reports"), icon: FolderOpen },
  ] : [];

  const builtInShortcutPaths = new Set(builtInFileShortcuts.map((entry) => normalizeFsPathForCompare(entry.path)));
  const userPinnedFolders = pinnedFolders.filter((folderPath) => !builtInShortcutPaths.has(normalizeFsPathForCompare(folderPath)));

  return (
    <Sidebar collapsible="icon" onClick={() => { if (collapsed) setOpen(true); }}>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary/70">
            {!collapsed && "Mission Control"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setChatMenuOpen((current) => !current);
                    if (location.pathname !== "/chat") {
                      void openDefaultChat();
                    } else {
                      void loadChatTopics();
                    }
                  }}
                  className={cn(
                    "hover:bg-sidebar-accent/80 transition-colors",
                    chatActive && "bg-sidebar-accent text-primary font-medium",
                  )}
                >
                  <MessageSquare className="mr-2 h-4 w-4 shrink-0" />
                  {!collapsed && <span>Chat</span>}
                </SidebarMenuButton>

                <div
                  className={cn(
                    "grid transition-[grid-template-rows,opacity,margin] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    !collapsed && chatMenuOpen ? "mt-1 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    {!collapsed && chatMenuOpen ? (
                      <div className="ml-3 space-y-1 border-l border-border/60 pl-3 pt-1">
                        <button
                          type="button"
                          onClick={() => void handleCreateTopic()}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
                        >
                          <Plus className="h-4 w-4 shrink-0" />
                          <span>New Topic</span>
                        </button>

                        {chatLoading ? (
                          <div className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading chats...
                          </div>
                        ) : chatTopics.length === 0 ? (
                          <div className="px-2.5 py-2 text-sm text-muted-foreground">
                            No chats yet.
                          </div>
                        ) : (
                          chatTopics.map((conversation) => (
                            <button
                              key={conversation.id}
                              type="button"
                              onClick={() => {
                                navigate(`/chat?conversation=${conversation.id}`);
                                setChatMenuOpen(false);
                              }}
                              className={cn(
                                "flex w-full items-start justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                                activeConversationId === conversation.id
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                              )}
                            >
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">{conversation.title}</div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {conversation.kind === "random" ? "Quick commands and one-offs" : "Topic-specific context"}
                                </div>
                              </div>
                              <span className="rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                                {conversation.kind}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => {
                    setFilesMenuOpen((current) => !current);
                    if (location.pathname !== "/files") {
                      navigateToFilesPath(fileInfo?.defaultPath || "");
                    }
                  }}
                  className={cn(
                    "hover:bg-sidebar-accent/80 transition-colors",
                    filesActive && "bg-sidebar-accent text-primary font-medium",
                  )}
                >
                  <FolderOpen className="mr-2 h-4 w-4 shrink-0" />
                  {!collapsed && <span>Files</span>}
                </SidebarMenuButton>

                <div
                  className={cn(
                    "grid transition-[grid-template-rows,opacity,margin] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    !collapsed && (filesMenuOpen || filesActive) ? "mt-1 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                  )}
                >
                  <div className="overflow-hidden">
                    {!collapsed && (filesMenuOpen || filesActive) ? (
                      <div className="ml-3 space-y-1 border-l border-border/60 pl-3 pt-1">
                        {fileInfo ? (
                          <>
                            {builtInFileShortcuts.map((shortcut) => (
                              <button
                                key={shortcut.path}
                                type="button"
                                onClick={() => navigateToFilesPath(shortcut.path)}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                                  normalizeFsPathForCompare(currentFilesPath) === normalizeFsPathForCompare(shortcut.path)
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                                )}
                              >
                                <shortcut.icon className="h-4 w-4 shrink-0" />
                                <span className="truncate">{shortcut.label}</span>
                              </button>
                            ))}

                            {userPinnedFolders.map((folderPath) => (
                              <button
                                key={folderPath}
                                type="button"
                                onClick={() => navigateToFilesPath(folderPath)}
                                title={folderPath}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                                  normalizeFsPathForCompare(currentFilesPath) === normalizeFsPathForCompare(folderPath)
                                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                                )}
                              >
                                <Pin className="h-4 w-4 shrink-0" />
                                <span className="truncate">{folderLabelForPath(folderPath, fileInfo.computerRootPath)}</span>
                              </button>
                            ))}
                          </>
                        ) : (
                          <div className="flex items-center gap-2 px-2.5 py-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading files...
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </SidebarMenuItem>

              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-sidebar-accent/80 transition-colors"
                      activeClassName="bg-sidebar-accent text-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => onOpenSetup()} className="hover:bg-sidebar-accent/80 transition-colors cursor-pointer">
              <Settings className="mr-2 h-4 w-4 shrink-0" />
              {!collapsed && <span>Setup</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function folderLabelForPath(folderPath: string, computerRootPath?: string) {
  if (!folderPath || folderPath === computerRootPath) return COMPUTER_TITLE;
  const normalized = folderPath.replace(/[\\/]+$/, "");
  const windowsRootMatch = normalized.match(/^[A-Za-z]:$/);
  if (windowsRootMatch) return windowsRootMatch[0];
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || folderPath;
}
