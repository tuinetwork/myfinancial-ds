import { LayoutDashboard, Calendar, ChevronDown } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MonthOption } from "@/hooks/useBudgetData";
import { Wallet } from "lucide-react";

interface AppSidebarProps {
  viewMode: "monthly" | "yearly";
  onViewModeChange: (v: "monthly" | "yearly") => void;
  years: string[];
  selectedYear?: string;
  onYearChange: (y: string) => void;
  monthsForYear: MonthOption[];
  selectedMonthKey?: string;
  onMonthChange: (m: string) => void;
}

export function AppSidebar({
  viewMode,
  onViewModeChange,
  years,
  selectedYear,
  onYearChange,
  monthsForYear,
  selectedMonthKey,
  onMonthChange,
}: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

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
        {/* Menu */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton className="bg-sidebar-accent text-sidebar-primary font-medium">
                  <LayoutDashboard className="h-4 w-4" />
                  {!collapsed && <span>Dashboard</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* View Mode */}
        {!collapsed && (
          <SidebarGroup>
            <SidebarGroupLabel>มุมมอง</SidebarGroupLabel>
            <SidebarGroupContent className="px-2">
              <Tabs value={viewMode} onValueChange={(v) => onViewModeChange(v as "monthly" | "yearly")}>
                <TabsList className="w-full bg-sidebar-accent">
                  <TabsTrigger value="monthly" className="flex-1 text-xs data-[state=active]:bg-sidebar-primary data-[state=active]:text-sidebar-primary-foreground">รายเดือน</TabsTrigger>
                  <TabsTrigger value="yearly" className="flex-1 text-xs data-[state=active]:bg-sidebar-primary data-[state=active]:text-sidebar-primary-foreground">รายปี</TabsTrigger>
                </TabsList>
              </Tabs>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Period Selection */}
        {!collapsed && (
          <SidebarGroup>
            <SidebarGroupLabel>
              <Calendar className="h-3.5 w-3.5 mr-1" />
              ช่วงเวลา
            </SidebarGroupLabel>
            <SidebarGroupContent className="px-2 space-y-2">
              {years.length > 0 && (
                <Select value={selectedYear} onValueChange={onYearChange}>
                 <SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground shadow-sm text-xs">
                    <SelectValue placeholder="ปี" />
                  </SelectTrigger>
                  <SelectContent className="bg-sidebar-background border-sidebar-border text-sidebar-foreground shadow-lg z-50">
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{String(Number(y) + 543)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {viewMode === "monthly" && monthsForYear.length > 0 && (
                <Select value={selectedMonthKey} onValueChange={onMonthChange}>
                  <SelectTrigger className="w-full bg-sidebar-accent border-sidebar-border text-sidebar-foreground shadow-sm text-xs">
                    <SelectValue placeholder="เดือน" />
                  </SelectTrigger>
                  <SelectContent className="bg-sidebar-background border-sidebar-border text-sidebar-foreground shadow-lg z-50">
                    {monthsForYear.map((m) => (
                      <SelectItem key={m.month} value={m.month}>{m.monthName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
