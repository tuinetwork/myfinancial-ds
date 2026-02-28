import { useState, useEffect, useMemo } from "react";
import { useBudgetData, useAvailableMonths } from "@/hooks/useBudgetData";
import { useYearlyData } from "@/hooks/useYearlyData";
import { SummaryCards } from "@/components/SummaryCards";
import { ExpenseChart } from "@/components/ExpenseChart";
import { ExpenseTabsChart } from "@/components/ExpenseTabsChart";
import { TransactionTable } from "@/components/TransactionTable";
import { DailyChart } from "@/components/DailyChart";
import { BudgetBreakdown } from "@/components/BudgetBreakdown";
import { YearlyView } from "@/components/YearlyView";
import { Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Index = () => {
  const { data: months, isLoading: monthsLoading } = useAvailableMonths();
  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [selectedYear, setSelectedYear] = useState<string | undefined>(undefined);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | undefined>(undefined);

  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzMCHgFjgZWUeofgJtHrXYw_CCqXwwaqlETICZERyqGt9Kg-L7wfx2q8g4hNOaQl6Mu/exec";

  const sendMonthToSheet = (month: string) => {
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

  if (isPageLoading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-80 rounded-lg" />
        </div>
      </div>
    );
  }

  if (viewMode === "monthly" && (error || !data)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-destructive">ไม่สามารถโหลดข้อมูลได้</p>
      </div>
    );
  }

  const title = viewMode === "monthly"
    ? `บันทึกการเงินประจำเดือน ${data?.month}`
    : `บันทึกการเงินประจำปี ${selectedYear}`;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground p-2.5 rounded-xl shadow-md">
              <Wallet className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-bold font-display">{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "monthly" | "yearly")}>
              <TabsList className="bg-muted">
                <TabsTrigger value="monthly" className="text-xs">รายเดือน</TabsTrigger>
                <TabsTrigger value="yearly" className="text-xs">รายปี</TabsTrigger>
              </TabsList>
            </Tabs>

            {viewMode === "monthly" && months && months.length > 0 && (
              <>
                <Select value={selectedMonthKey} onValueChange={handleMonthChange}>
                  <SelectTrigger className="w-36 bg-card border-border shadow-sm">
                    <SelectValue placeholder="เดือน" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border shadow-lg z-50">
                    {monthsForYear.map((m) => (
                      <SelectItem key={m.month} value={m.month}>{m.monthName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedYear} onValueChange={(y) => setSelectedYear(y)}>
                  <SelectTrigger className="w-28 bg-card border-border shadow-sm">
                    <SelectValue placeholder="ปี" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border shadow-lg z-50">
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{String(Number(y) + 543)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {viewMode === "yearly" && years.length > 0 && (
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-32 bg-card border-border shadow-sm">
                  <SelectValue placeholder="เลือกปี" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border shadow-lg z-50">
                  {years.map((y) => (
                    <SelectItem key={y} value={y}>{String(Number(y) + 543)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Monthly Content */}
        {viewMode === "monthly" && data && (
          <>
            {/* Summary Cards Row */}
            <SummaryCards data={data} carryOver={carryOver} />

            {/* Main chart + side panel */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <DailyChart data={data} />
              </div>
              <ExpenseTabsChart data={data} />
            </div>

            {/* Budget vs Actual + Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <ExpenseChart data={data} />
              </div>
              <BudgetBreakdown data={data} />
            </div>

            {/* Transactions */}
            <TransactionTable data={data} />
          </>
        )}

        {viewMode === "yearly" && yearlyData && (
          <YearlyView yearlyData={yearlyData} />
        )}
      </div>
    </div>
  );
};

export default Index;
