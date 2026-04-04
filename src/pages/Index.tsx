import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { AppFooter } from "@/components/AppFooter";
import { useBudgetData, useAvailableMonths } from "@/hooks/useBudgetData";
import { getAccounts } from "@/lib/firestore-services";
import { useAuth } from "@/contexts/AuthContext";
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
import { SpendingInsightsButton } from "@/components/SpendingInsights";
import { useSpendingInsights } from "@/hooks/useSpendingInsights";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Home, LayoutDashboard, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Index = () => {
  const [searchParams] = useSearchParams();
  const viewMode = (searchParams.get("view") || "monthly") as "monthly" | "yearly";
  const { data: months, isLoading: monthsLoading } = useAvailableMonths();
  const [selectedYear, setSelectedYear] = useState<string | undefined>(undefined);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | undefined>(undefined);
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
  const insights = useSpendingInsights(data, carryOver);

  const { userId } = useAuth();
  const [accounts, setAccounts] = useState<import("@/types/finance").Account[]>([]);
  useEffect(() => {
    if (!userId) return;
    getAccounts(userId).then(setAccounts);
  }, [userId]);

  // คำนวณยอดกระเป๋าหลักแบบเดียวกับ AccountsPage
  // mainWallet = trueNetWorth - otherAssetsTotal + liabilitiesTotal
  const mainWalletBalance = useMemo(() => {
    if (!accounts.length || !data) return null;
    const liabilityTypes = ["credit_card", "loan", "payable"];
    const isMainWallet = (a: import("@/types/finance").Account) => a.name === "กระเป๋าเงินสดหลัก";
    const isTransferTx = (t: import("@/hooks/useBudgetData").Transaction) =>
      t.type === "โอน" || t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี";

    const actualIncome = data.transactions.filter((t) => t.type === "รายรับ").reduce((s, t) => s + t.amount, 0);
    const actualExpenses = data.transactions.filter((t) => t.type !== "รายรับ" && !isTransferTx(t)).reduce((s, t) => s + t.amount, 0);
    const trueNetWorth = carryOver + actualIncome - actualExpenses;

    const activeAccounts = accounts.filter((a) => !a.is_deleted && a.is_active);
    let otherAssetsTotal = 0;
    let liabilitiesTotal = 0;
    activeAccounts.forEach((a) => {
      if (isMainWallet(a)) return;
      const bal = Number(a.balance) || 0;
      if (liabilityTypes.includes(a.type)) {
        liabilitiesTotal += Math.abs(bal);
      } else {
        otherAssetsTotal += bal;
      }
    });

    return trueNetWorth - otherAssetsTotal + liabilitiesTotal;
  }, [accounts, data, carryOver]);

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

  return (
    <>
      <AppSidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <LayoutDashboard className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">แดชบอร์ด</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="hidden md:flex items-center gap-1">
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
              {viewMode === "monthly" && <SpendingInsightsButton insights={insights} />}
            </div>
            <ThemeToggle />
            <span className="hidden md:contents">
              <NotificationBell />
              <UserProfilePopover />
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div id="dashboard-content" className="space-y-6">
            {/* Controls row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Breadcrumb className="hidden md:flex">
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

              <div className="flex items-center gap-2 w-full md:w-auto">
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
                {/* 1. สรุปยอด */}
                <SummaryCards data={data} carryOver={carryOver} mainWalletBalance={mainWalletBalance} />

                {/* 2. เปรียบเทียบเดือน */}
                <MonthComparison data={data} />

                {/* 3. การ์ดสถานะ 3 ใบ */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <FinancialHealthCard data={data} carryOver={carryOver} />
                  <SavingsGoalCard data={data} />
                  <UpcomingBills data={data} />
                </div>

                {/* 4. กราฟรายวัน + ธุรกรรมล่าสุด */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
                  <div className="xl:col-span-2 min-h-0">
                    <DailyChart data={data} />
                  </div>
                  <RecentTransactions data={data} />
                </div>

                {/* 5. กราฟรายจ่าย + หมวดจ่ายสูงสุด */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
                  <div className="xl:col-span-2 min-h-0">
                    <ExpenseChart data={data} />
                  </div>
                  <TopSpendingCategories data={data} />
                </div>

                {/* 6. กราฟแยกหมวด + ติดตามงบ */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
                  <div className="xl:col-span-2 min-h-0">
                    <ExpenseTabsChart data={data} />
                  </div>
                  <BudgetBreakdown data={data} />
                </div>

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
