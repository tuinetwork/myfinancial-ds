import { useState, useEffect, useMemo } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Home } from "lucide-react";
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

  return (
    <>
      <AppSidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-transparent sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div>
              <p className="text-xs text-muted-foreground">
                <Home className="h-3 w-3 inline mr-1" />
                หน้าหลัก / แดชบอร์ด
              </p>
              <h1 className="text-sm font-semibold text-foreground">
                แดชบอร์ด {viewMode === "monthly" ? "รายเดือน" : "รายปี"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Year / Month selectors */}
            {years.length > 0 && (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-28 bg-card border-border shadow-argon text-xs h-8 rounded-md">
                  <SelectValue placeholder="ปี" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border shadow-argon-lg z-50">
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>{String(Number(y) + 543)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {viewMode === "monthly" && monthsForYear.length > 0 && (
              <Select value={selectedMonthKey} onValueChange={handleMonthChange}>
                <SelectTrigger className="w-32 bg-card border-border shadow-argon text-xs h-8 rounded-md">
                  <SelectValue placeholder="เดือน" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border shadow-argon-lg z-50">
                  {monthsForYear.map((m) => (
                    <SelectItem key={m.month} value={m.month}>{m.monthName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div className="space-y-5">

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

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <FinancialHealthCard data={data} carryOver={carryOver} />
                  <SavingsGoalCard data={data} />
                  <UpcomingBills data={data} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-2">
                    <DailyChart data={data} />
                  </div>
                  <RecentTransactions data={data} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-2">
                    <ExpenseChart data={data} />
                  </div>
                  <TopSpendingCategories data={data} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <div className="xl:col-span-2">
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
