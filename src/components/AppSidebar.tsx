import { useState } from "react";
import { LayoutDashboard, Receipt, LogOut, Wallet, Settings, ChevronDown, ChevronRight, PiggyBank, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { title: string; url: string }[];
}

const menuItems: MenuItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "รายการธุรกรรม", url: "/transactions", icon: Receipt },
  {
    title: "ตั้งค่า",
    url: "/settings",
    icon: Settings,
    children: [
      { title: "งบประมาณ", url: "/settings?tab=budget" },
      { title: "ผู้ใช้", url: "/settings?tab=user" },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const displayName = user?.displayName || "ผู้ใช้";
  const email = user?.email || "";
  const photoURL = user?.photoURL || "";
  const initials = displayName.slice(0, 2).toUpperCase();

  const isActive = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url.split("?")[0]);
  };

  const isSettingsActive = location.pathname.startsWith("/settings");
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
            <Wallet className="h-5 w-5" />
          </div>
          {!collapsed && (
            <span className="font-bold text-sm font-display">การเงินของฉัน</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
            Navigation
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) =>
                item.children ? (
                  <SidebarMenuItem key={item.url}>
                    <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          className={`w-full justify-between hover:bg-sidebar-accent/50 ${
                            isSettingsActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <item.icon className="h-4 w-4" />
                            {!collapsed && <span>{item.title}</span>}
                          </div>
                          {!collapsed && (
                            settingsOpen
                              ? <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/50" />
                              : <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/50" />
                          )}
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      {!collapsed && (
                        <CollapsibleContent>
                          <div className="ml-6 border-l border-sidebar-border pl-2 mt-1 space-y-0.5">
                            {item.children.map((child) => {
                              const tabParam = new URL(child.url, "http://x").searchParams.get("tab");
                              const currentTab = new URLSearchParams(location.search).get("tab");
                              const active = location.pathname === "/settings" && currentTab === tabParam;

                              return (
                                <button
                                  key={child.url}
                                  onClick={() => navigate(child.url)}
                                  className={`block w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                                    active
                                      ? "text-sidebar-primary font-medium bg-sidebar-accent/50"
                                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                                  }`}
                                >
                                  {child.title}
                                </button>
                              );
                            })}
                          </div>
                        </CollapsibleContent>
                      )}
                    </Collapsible>
                  </SidebarMenuItem>
                ) : (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className="hover:bg-sidebar-accent/50"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={photoURL} alt={displayName} />
            <AvatarFallback className="text-xs bg-primary/10 text-primary">{initials}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{displayName}</p>
              <p className="text-[10px] text-muted-foreground truncate">{email}</p>
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={signOut}
              title="ออกจากระบบ"
            >
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
