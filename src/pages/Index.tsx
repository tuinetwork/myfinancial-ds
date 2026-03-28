import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { AppFooter } from "@/components/AppFooter";
import { useBudgetData, useAvailableMonths } from "@/hooks/useBudgetData";
import { useYearlyData } from "@/hooks/useYearlyData";
import { SummaryCards } from "@/components/SummaryCards";
import { ExpenseChart } from "@/components/ExpenseChart";
import { ExpenseTabsChart } from "@/components/ExpenseTabsChart";
import { DailyChart } from "@/components/DailyChart";
import { BudgetBreakdown } from "@/components/BudgetBreakdown";
import { YearlyView } from "@/components/YearlyView";
import { RecentTransactions } from "@/components/RecentTransactions";
import { TopSpendingCategories } from "@/components/TopSpendingCategories";
import { FinancialHealthCard } from "@/components/FinancialHealthCard";
import { SavingsGoalCard } from "@/components/SavingsGoalCard";
import { UpcomingBills } from "@/components/UpcomingBills";
import { MonthComparison } from "@/components/MonthComparison";
import { SpendingInsights } from "@/components/SpendingInsights";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Home, LayoutDashboard, ChevronUp, ChevronDown, Lock, Unlock, FileDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type WidgetRow = { id: string; widgets: string[] };

const DEFAULT_LAYOUT: WidgetRow[] = [
  { id: "row-0", widgets: ["MonthComparison"] },
  { id: "row-1", widgets: ["FinancialHealthCard", "SavingsGoalCard", "UpcomingBills"] },
  { id: "row-2", widgets: ["DailyChart", "RecentTransactions"] },
  { id: "row-3", widgets: ["ExpenseChart", "TopSpendingCategories"] },
  { id: "row-4", widgets: ["ExpenseTabsChart", "BudgetBreakdown"] },
  { id: "row-5", widgets: ["SpendingInsights"] },
];

const STORAGE_KEY = "dashboard-layout";

function loadLayout(): WidgetRow[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: WidgetRow[] = JSON.parse(stored);
      const existingWidgets = new Set(parsed.flatMap((r) => r.widgets));
      const allDefault = DEFAULT_LAYOUT.flatMap((r) => r.widgets);
      const missing = allDefault.filter((w) => !existingWidgets.has(w));
      if (missing.length > 0) {
        parsed.push({ id: `row-extra-${Date.now()}`, widgets: missing });
      }
      return parsed;
    }
  } catch {}
  return DEFAULT_LAYOUT;
}

function saveLayout(layout: WidgetRow[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

const Index = () => {
  const [searchParams] = useSearchParams();
  const viewMode = (searchParams.get("view") || "monthly") as "monthly" | "yearly";
  const { data: months, isLoading: monthsLoading } = useAvailableMonths();
  const [selectedYear, setSelectedYear] = useState<string | undefined>(undefined);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | undefined>(undefined);
  const [layout, setLayout] = useState<WidgetRow[]>(loadLayout);
  const [editMode, setEditMode] = useState(false);
  const [exporting, setExporting] = useState(false);

  const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "";

  const sendMonthToSheet = (month: string) => {
    if (!APPS_SCRIPT_URL) return;
    fetch(APPS_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month }),
    }).catch((err) => console.error("Failed to send month to sheet:", err));
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonthKey(month);
    sendMonthToSheet(month);
  };

  const years = useMemo(() => {
    if (!months) return [];
    return Array.from(new Set(months.map((m) => m.year))).sort().reverse();
  }, [months]);

  const monthsForYear = useMemo(() => {
    if (!months || !selectedYear) return [];
    return months.filter((m) => m.year === selectedYear);
  }, [months, selectedYear]);

  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      setSelectedYear(years[0]);
    }
  }, [years, selectedYear]);

  useEffect(() => {
    if (monthsForYear.length > 0) {
      setSelectedMonthKey(monthsForYear[0].month);
    }
  }, [monthsForYear]);

  const selectedPeriod = useMemo(() => {
    if (!selectedYear || !selectedMonthKey) return undefined;
    return `${selectedYear}-${selectedMonthKey}`;
  }, [selectedYear, selectedMonthKey]);

  const { data, isLoading, error } = useBudgetData(selectedPeriod);
  const { data: yearlyData, isLoading: yearlyLoading } = useYearlyData(
    viewMode === "yearly" ? selectedYear : undefined
  );

  const carryOver = data?.carryOver ?? 0;

  const isPageLoading = viewMode === "monthly"
    ? isLoading || monthsLoading || !selectedPeriod
    : yearlyLoading || monthsLoading || !selectedYear;

  const handleExportPDF = useCallback(async () => {
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      const dashboardEl = document.getElementById("dashboard-content");
      if (!dashboardEl) return;

      const canvas = await html2canvas(dashboardEl, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue("--background")
          ? `hsl(${getComputedStyle(document.documentElement).getPropertyValue("--background").trim()})`
          : "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft > 0) {
        position -= pdf.internal.pageSize.getHeight();
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      pdf.save(`dashboard_${data?.period || "report"}.pdf`);
    } catch (e) {
      console.error("PDF export failed:", e);
    } finally {
      setExporting(false);
    }
  }, [data?.period]);

  const moveRowUp = useCallback((rowIdx: number) => {
    if (rowIdx <= 0) return;
    const newLayout = [...layout];
    [newLayout[rowIdx - 1], newLayout[rowIdx]] = [newLayout[rowIdx], newLayout[rowIdx - 1]];
    setLayout(newLayout);
    saveLayout(newLayout);
  }, [layout]);

  const moveRowDown = useCallback((rowIdx: number) => {
    if (rowIdx >= layout.length - 1) return;
    const newLayout = [...layout];
    [newLayout[rowIdx], newLayout[rowIdx + 1]] = [newLayout[rowIdx + 1], newLayout[rowIdx]];
    setLayout(newLayout);
    saveLayout(newLayout);
  }, [layout]);

  const resetLayout = useCallback(() => {
    setLayout(DEFAULT_LAYOUT);
    saveLayout(DEFAULT_LAYOUT);
  }, []);

  const renderWidget = useCallback((id: string) => {
    if (!data) return null;
    switch (id) {
      case "FinancialHealthCard": return <FinancialHealthCard data={data} carryOver={carryOver} />;
      case "SavingsGoalCard": return <SavingsGoalCard data={data} />;
      case "UpcomingBills": return <UpcomingBills data={data} />;
      case "DailyChart": return <DailyChart data={data} />;
      case "RecentTransactions": return <RecentTransactions data={data} />;
      case "ExpenseChart": return <ExpenseChart data={data} />;
      case "TopSpendingCategories": return <TopSpendingCategories data={data} />;
      case "ExpenseTabsChart": return <ExpenseTabsChart data={data} />;
      case "BudgetBreakdown": return <BudgetBreakdown data={data} />;
      case "MonthComparison": return <MonthComparison data={data} />;
      case "SpendingInsights": return <SpendingInsights data={data} carryOver={carryOver} />;
      default: return null;
    }
  }, [data, carryOver]);

  return (
    <>
      <AppSidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">แดชบอร์ด</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {viewMode === "monthly" && data && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleExportPDF}
                disabled={exporting}
                title="ส่งออก PDF"
                className="h-8 w-8"
              >
                <FileDown className={cn("h-4 w-4", exporting && "animate-pulse")} />
              </Button>
            )}
            {viewMode === "monthly" && (
              <Button
                variant={editMode ? "default" : "ghost"}
                size="icon"
                onClick={() => setEditMode((v) => !v)}
                title={editMode ? "ล็อคเลย์เอาท์" : "จัดเรียงวิดเจ็ต"}
                className="h-8 w-8"
              >
                {editMode ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </Button>
            )}
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div id="dashboard-content" className="space-y-6">
            {/* Breadcrumb + Dropdowns */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="flex items-center gap-1">
                      <Home className="h-4 w-4" />
                      <span className="hidden sm:inline">แดชบอร์ด</span>
                      <span className="text-muted-foreground text-xs ml-1">
                        ({viewMode === "monthly" ? "รายเดือน" : "รายปี"})
                      </span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="flex items-center gap-2">
                {years.length > 0 && (
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-28 bg-card border-border shadow-sm text-xs">
                      <SelectValue placeholder="ปี" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border shadow-lg z-50">
                      {years.map((y) => (
                        <SelectItem key={y} value={y}>{String(Number(y) + 543)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {viewMode === "monthly" && monthsForYear.length > 0 && (
                  <Select value={selectedMonthKey} onValueChange={handleMonthChange}>
                    <SelectTrigger className="w-32 bg-card border-border shadow-sm text-xs">
                      <SelectValue placeholder="เดือน" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border shadow-lg z-50">
                      {monthsForYear.map((m) => (
                        <SelectItem key={m.month} value={m.month}>{m.monthName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {editMode && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary">
                <span>กดปุ่มลูกศรเพื่อจัดเรียงวิดเจ็ต</span>
                <Button variant="outline" size="sm" className="h-6 text-[11px] ml-auto gap-1" onClick={resetLayout}>
                  <RotateCcw className="h-3 w-3" /> รีเซ็ต
                </Button>
              </div>
            )}

            {isPageLoading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-lg" />
                  ))}
                </div>
                <Skeleton className="h-80 rounded-lg" />
              </div>
            ) : viewMode === "monthly" && (error || !data) ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-destructive">ไม่สามารถโหลดข้อมูลได้</p>
              </div>
            ) : viewMode === "monthly" && data ? (
              <>
                <SummaryCards data={data} carryOver={carryOver} />

                {layout.map((row, rowIdx) => {
                  const colClass = row.widgets.length >= 3
                    ? "grid-cols-1 xl:grid-cols-3"
                    : row.widgets.length === 2
                      ? "grid-cols-1 xl:grid-cols-3"
                      : "grid-cols-1";
                  const isTwo = row.widgets.length === 2;
                  const wideWidgets = ["DailyChart", "ExpenseChart", "ExpenseTabsChart"];

                  return (
                    <div key={row.id} className="relative group">
                      {editMode && (
                        <div className="absolute -left-1 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 bg-card shadow"
                            onClick={() => moveRowUp(rowIdx)}
                            disabled={rowIdx === 0}
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 bg-card shadow"
                            onClick={() => moveRowDown(rowIdx)}
                            disabled={rowIdx === layout.length - 1}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <div className={`grid ${colClass} gap-4 ${editMode ? "ring-1 ring-dashed ring-border rounded-lg p-1" : ""}`}>
                        {row.widgets.map((widgetId, idx) => {
                          const isWide = isTwo && idx === 0 && wideWidgets.includes(widgetId);
                          return (
                            <div key={widgetId} className={isWide ? "xl:col-span-2" : ""}>
                              {renderWidget(widgetId)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : viewMode === "yearly" && yearlyData ? (
              <YearlyView yearlyData={yearlyData} />
            ) : null}
          </div>
        </main>
        <AppFooter />
      </div>
    </>
  );
};

export default Index;
