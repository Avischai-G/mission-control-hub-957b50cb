import {
  MessageSquare,
  Brain,
  Bot,
  Clock,
  Radio,
  FileText,
  Settings,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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

const mainItems = [
  { title: "Chat", url: "/chat", icon: MessageSquare },
  { title: "Global Memory", url: "/memory", icon: Brain },
  { title: "Agents", url: "/agents", icon: Bot },
  { title: "Cron Jobs", url: "/cron", icon: Clock },
  { title: "Live Feed", url: "/feed", icon: Radio },
  { title: "Night Report", url: "/night-report", icon: FileText },
];

interface AppSidebarProps {
  onOpenSetup: () => void;
}

export function AppSidebar({ onOpenSetup }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] uppercase tracking-[0.2em] text-primary/70">
            {!collapsed && "Mission Control"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
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
            <SidebarMenuButton
              onClick={onOpenSetup}
              className="hover:bg-sidebar-accent/80 transition-colors cursor-pointer"
            >
              <Settings className="mr-2 h-4 w-4 shrink-0" />
              {!collapsed && <span>Setup</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
