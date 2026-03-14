import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard, Receipt, Settings, ChevronDown, ChevronRight, ChevronUp,
  CalendarDays, BarChart3, DollarSign, Tags, Target, PieChart, ShieldCheck, Wallet,
  TrendingUp, Landmark, Terminal,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

// ===== Types =====
interface MenuItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { title: string; url: string; icon?: React.ComponentType<{ className?: string }> }[];
}

const mainMenuItems: MenuItem[] = [
  {
    title: "แดชบอร์ด", url: "/", icon: LayoutDashboard,
    children: [
      { title: "รายเดือน", url: "/?view=monthly", icon: CalendarDays },
      { title: "รายปี", url: "/?view=yearly", icon: BarChart3 },
    ],
  },
  { title: "วิเคราะห์", url: "/analysis", icon: PieChart },
  { title: "ปฏิทินการเงิน", url: "/calendar", icon: CalendarDays },
  { title: "รายการธุรกรรม", url: "/transactions", icon: Receipt },
  { title: "บัญชี/กระเป๋าเงิน", url: "/accounts", icon: Landmark },
  { title: "การลงทุน", url: "/investments", icon: TrendingUp },
  { title: "เป้าหมาย", url: "/goals", icon: Target },
];

const settingsChildren = [
  { title: "งบประมาณ", url: "/settings?tab=budget", icon: DollarSign },
  { title: "หมวดหมู่", url: "/settings?tab=categories", icon: Tags },
  { title: "เป้าหมายการออม", url: "/settings?tab=savings", icon: Target },
];

/* ── Floating Popout for Mini Mode ── */
function FloatingPopout({
  children,
  trigger,
  parentRef,
}: {
  children: React.ReactNode;
  trigger: React.ReactNode;
  parentRef: React.RefObject<HTMLDivElement>;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ top: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoutRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const open = () => {
    clearTimeout(timeoutRef.current);
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.top });
    }
    setShow(true);
  };

  const close = () => {
    timeoutRef.current = setTimeout(() => setShow(false), 150);
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={open}
      onMouseLeave={close}
      className="relative"
    >
      {trigger}
      {show && (
        <div
          ref={popoutRef}
          onMouseEnter={() => clearTimeout(timeoutRef.current)}
          onMouseLeave={close}
          style={{ top: pos.top }}
          className="fixed left-[--sidebar-width-icon] z-50 ml-1 min-w-[180px] rounded-lg border border-sidebar-border bg-sidebar p-1.5 shadow-xl animate-in fade-in-0 zoom-in-95 slide-in-from-left-2 duration-200"
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { userRole, user } = useAuth();
  const isAdminUser = userRole === "dev" || userRole === "admin";
  const isDevUser = userRole === "dev";
  const sidebarRef = useRef<HTMLDivElement>(null);

  const isDashboardActive = location.pathname === "/";
  const isSettingsActive = location.pathname.startsWith("/settings");
  const [dashboardOpen, setDashboardOpen] = useState(isDashboardActive);
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);

  useEffect(() => {
    if (isDashboardActive) setDashboardOpen(true);
  }, [isDashboardActive]);

  useEffect(() => {
    if (isSettingsActive) setSettingsOpen(true);
  }, [isSettingsActive]);

  const renderChildActive = (childUrl: string) => {
    const childUrlObj = new URL(childUrl, "http://x");
    const childPath = childUrlObj.pathname;
    const childParams = childUrlObj.searchParams;

    if (childPath === "/") {
      const currentView = new URLSearchParams(location.search).get("view") || "monthly";
      return location.pathname === "/" && currentView === (childParams.get("view") || "monthly");
    } else {
      const currentTab = new URLSearchParams(location.search).get("tab");
      return location.pathname === childPath && currentTab === childParams.get("tab");
    }
  };

  /* ── Render a collapsible menu group ── */
  const renderCollapsibleItem = (
    item: MenuItem,
    isOpen: boolean,
    setIsOpen: (v: boolean) => void,
    isActive: boolean,
  ) => {
    const children = item.children!;

    if (collapsed) {
      return (
        <SidebarMenuItem key={item.url}>
          <FloatingPopout
            parentRef={sidebarRef}
            trigger={
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className={`w-full justify-center hover:bg-sidebar-accent/50 ${
                      isActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
                    }`}
                    onClick={() => {
                      if (children[0]) navigate(children[0].url);
                    }}
                  >
                    <item.icon className="h-4 w-4" />
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar text-sidebar-foreground border-sidebar-border">
                  {item.title}
                </TooltipContent>
              </Tooltip>
            }
          >
            <div className="space-y-0.5">
              <p className="px-2 py-1 text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-medium">
                {item.title}
              </p>
              {children.map((child) => {
                const active = renderChildActive(child.url);
                return (
                  <button
                    key={child.url}
                    onClick={() => navigate(child.url)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                      active
                        ? "text-sidebar-primary font-medium bg-sidebar-accent/60"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/40"
                    }`}
                  >
                    {child.icon && <child.icon className="h-3.5 w-3.5" />}
                    {child.title}
                  </button>
                );
              })}
            </div>
          </FloatingPopout>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.url}>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <SidebarMenuButton
            className={`w-full justify-between hover:bg-sidebar-accent/50 ${
              isActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
            }`}
            onClick={(e) => {
              if (children[0]) {
                e.preventDefault();
                navigate(children[0].url);
                setIsOpen(true);
              }
            }}
          >
            <div className="flex items-center gap-2">
              <item.icon className="h-4 w-4" />
              <span>{item.title}</span>
            </div>
            <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
              <span className="cursor-pointer">
                {isOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/50" />
                  : <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/50" />
                }
              </span>
            </CollapsibleTrigger>
          </SidebarMenuButton>
          <CollapsibleContent className="overflow-hidden data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
            <div className="ml-6 border-l border-sidebar-border pl-2 mt-1 space-y-0.5">
              {children.map((child) => {
                const active = renderChildActive(child.url);
                return (
                  <button
                    key={child.url}
                    onClick={() => navigate(child.url)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                      active
                        ? "text-sidebar-primary font-medium bg-sidebar-accent/50"
                        : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/30"
                    }`}
                  >
                    {child.icon && <child.icon className="h-3.5 w-3.5" />}
                    {child.title}
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </SidebarMenuItem>
    );
  };

  /* ── Render simple nav item ── */
  const renderSimpleItem = (item: MenuItem) => {
    const isActive =
      item.url === "/" ? location.pathname === "/" : location.pathname.startsWith(item.url);

    if (collapsed) {
      return (
        <SidebarMenuItem key={item.url}>
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuButton
                className={`w-full justify-center hover:bg-sidebar-accent/50 ${
                  isActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
                }`}
                onClick={() => navigate(item.url)}
              >
                <item.icon className="h-4 w-4" />
              </SidebarMenuButton>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-sidebar text-sidebar-foreground border-sidebar-border">
              {item.title}
            </TooltipContent>
          </Tooltip>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          className={`w-full hover:bg-sidebar-accent/50 ${
            isActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
          }`}
          onClick={() => navigate(item.url)}
        >
          <item.icon className="h-4 w-4" />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" ref={sidebarRef}>
      {/* ── Logo Header (click to toggle) ── */}
      <SidebarHeader className="p-2">
        <button
          onClick={toggleSidebar}
          className="flex items-center gap-2.5 w-full rounded-lg p-2 hover:bg-sidebar-accent/50 transition-all duration-300 group/logo"
        >
          <div className="bg-primary text-primary-foreground p-1.5 rounded-lg shrink-0 transition-transform duration-300 group-hover/logo:scale-110">
            <Wallet className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight text-left overflow-hidden">
              <span className="font-bold text-sm font-display text-sidebar-foreground truncate">บันทึกการเงิน</span>
              <span className="text-[11px] text-sidebar-foreground/60 truncate">{user?.displayName || "ฉัน"}</span>
            </div>
          )}
        </button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => {
                if (item.children) {
                  return renderCollapsibleItem(item, dashboardOpen, setDashboardOpen, isDashboardActive);
                }
                return renderSimpleItem(item);
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ── Footer: Command Center (Dev only) + Admin + Settings ── */}
      <SidebarFooter className="p-2 border-t border-sidebar-border space-y-0.5">
        {/* Command Center - Dev only */}
        {isDevUser && (
          collapsed ? (
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className={`w-full justify-center hover:bg-sidebar-accent/50 ${
                      location.pathname === "/command-center" ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
                    }`}
                    onClick={() => navigate("/command-center")}
                  >
                    <Terminal className="h-4 w-4" />
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar text-sidebar-foreground border-sidebar-border">
                  Command Center
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton
                className={`w-full hover:bg-sidebar-accent/50 ${
                  location.pathname === "/command-center" ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
                }`}
                onClick={() => navigate("/command-center")}
              >
                <Terminal className="h-4 w-4" />
                <span>Command Center</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        )}

        {isAdminUser && (
          collapsed ? (
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    className={`w-full justify-center hover:bg-sidebar-accent/50 ${
                      location.pathname === "/admin" ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
                    }`}
                    onClick={() => navigate("/admin")}
                  >
                    <ShieldCheck className="h-4 w-4" />
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-sidebar text-sidebar-foreground border-sidebar-border">
                  Admin Panel
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          ) : (
            <SidebarMenuItem>
              <SidebarMenuButton
                className={`w-full hover:bg-sidebar-accent/50 ${
                  location.pathname === "/admin" ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
                }`}
                onClick={() => navigate("/admin")}
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Admin Panel</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        )}

        {/* Settings with sub-items */}
        {renderCollapsibleItem(
          {
            title: "ตั้งค่า", url: "/settings", icon: Settings,
            children: settingsChildren,
          },
          settingsOpen,
          setSettingsOpen,
          isSettingsActive,
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
