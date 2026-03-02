// ... (import ส่วนอื่นๆ เหมือนเดิม)
import { LayoutDashboard, Receipt, Wallet, Settings, ChevronDown, ChevronRight, ChevronUp, CalendarDays, BarChart3, DollarSign, Tags, Target, PieChart } from "lucide-react";

// 1. ปรับเมนูหลัก: แยก "วิเคราะห์" ออกมา และปรับแดชบอร์ดให้เหลือแค่ รายเดือน/รายปี
const mainMenuItems: MenuItem[] = [
  {
    title: "แดชบอร์ด", 
    url: "/", 
    icon: LayoutDashboard,
    children: [
      { title: "รายเดือน", url: "/?view=monthly", icon: CalendarDays },
      { title: "รายปี", url: "/?view=yearly", icon: BarChart3 },
    ],
  },
  { 
    title: "วิเคราะห์", 
    url: "/analysis", 
    icon: PieChart 
  },
  { 
    title: "รายการธุรกรรม", 
    url: "/transactions", 
    icon: Receipt 
  },
];

const settingsChildren = [
  { title: "งบประมาณ", url: "/settings?tab=budget", icon: DollarSign },
  { title: "หมวดหมู่", url: "/settings?tab=categories", icon: Tags },
  { title: "เป้าหมายการออม", url: "/settings?tab=savings", icon: Target },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location =皮location();
  const navigate = useNavigate();

  // 2. ปรับ Logic การ Check Active ของ Dashboard (ไม่ต้องรวม /analysis แล้ว)
  const isDashboardActive = location.pathname === "/";
  const isSettingsActive = location.pathname.startsWith("/settings");
  
  const [dashboardOpen, setDashboardOpen] = useState(isDashboardActive);
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);

  // ... (useEffect และ renderChildActive เหมือนเดิม)

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
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => {
                // กรณีมีลูก (Dashboard)
                if (item.children) {
                  return (
                    <SidebarMenuItem key={item.url}>
                      <Collapsible open={dashboardOpen} onOpenChange={setDashboardOpen}>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuButton
                            className={`w-full justify-between hover:bg-sidebar-accent/50 ${
                              isDashboardActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""
                            }`}
                            onClick={(e) => {
                              if (item.children?.[0]) {
                                e.preventDefault();
                                navigate(item.children[0].url);
                                setDashboardOpen(true);
                              }
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <item.icon className="h-4 w-4" />
                              {!collapsed && <span>{item.title}</span>}
                            </div>
                            {!collapsed && (
                              dashboardOpen
                                ? <ChevronDown className="h-3.5 w-3.5 text-sidebar-foreground/50" />
                                : <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/50" />
                            )}
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        {!collapsed && (
                          <CollapsibleContent>
                            <div className="ml-6 border-l border-sidebar-border pl-2 mt-1 space-y-0.5">
                              {item.children.map((child) => {
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
                        )}
                      </Collapsible>
                    </SidebarMenuItem>
                  );
                }

                // กรณีเมนูเดี่ยว (วิเคราะห์, รายการธุรกรรม)
                return (
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
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer Settings เหมือนเดิม */}
      <SidebarFooter className="p-3 border-t border-sidebar-border">
        {/* ... (Code ส่วน Footer เหมือนเดิม) */}
      </SidebarFooter>
    </Sidebar>
  );
}
