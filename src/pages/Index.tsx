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

const THAI_MONTHS = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"
];

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

  // Available years
  const years = useMemo(() => {
    if (!months) return [];
    return Array.from(new Set(months.map((m) => m.year))).sort().reverse();
  }, [months]);

  // Months for the selected year
  const monthsForYear = useMemo(() => {
    if (!months || !selectedYear) return [];
    return months
      .filter((m) => m.year === selectedYear)
      .sort((a, b) => THAI_MONTHS.indexOf(a.month) - THAI_MONTHS.indexOf(b.month));
  }, [months, selectedYear]);

  // Auto-select latest year
  useEffect(() => {
    if (years.length > 0 && !selectedYear) {
      setSelectedYear(years[0]);
    }
  }, [years, selectedYear]);

  // Auto-select latest month when year changes
  useEffect(() => {
    if (monthsForYear.length > 0) {
      setSelectedMonthKey(monthsForYear[0].month);
    }
  }, [monthsForYear]);

  // Derive selectedPath from year + month
  const selectedPath = useMemo(() => {
    if (!selectedYear || !selectedMonthKey || !months) return undefined;
    const found = months.find((m) => m.year === selectedYear && m.month === selectedMonthKey);
    return found?.path;
  }, [months, selectedYear, selectedMonthKey]);

  // Find previous month path
  const previousPath = (() => {
    if (!months || !selectedPath) return undefined;
    const idx = months.findIndex((m) => m.path === selectedPath);
    return idx >= 0 && idx + 1 < months.length ? months[idx + 1].path : undefined;
  })();

  const { data, isLoading, error } = useBudgetData(selectedPath);
  const { data: prevData } = useBudgetData(previousPath);
  const { data: yearlyData, isLoading: yearlyLoading } = useYearlyData(
    viewMode === "yearly" ? selectedYear : undefined
  );

  // Calculate carry-over balance from previous month
  const carryOver = (() => {
    if (!prevData) return 0;
    const prevIncome = prevData.transactions
      .filter((t) => t.type === "รายรับ")
      .reduce((s, t) => s + t.amount, 0);
    const prevNonIncome = prevData.transactions
      .filter((t) => t.type !== "รายรับ")
      .reduce((s, t) => s + t.amount, 0);
    return prevIncome - prevNonIncome;
  })();

  const isPageLoading = viewMode === "monthly"
    ? isLoading || monthsLoading || !selectedPath
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

  const subtitle = viewMode === "monthly" && data
    ? `อัปเดตล่าสุด: ${new Date(data.timestamp).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}`
    : undefined;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground p-2.5 rounded-xl">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">{title}</h1>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Tabs */}
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "monthly" | "yearly")}>
              <TabsList className="bg-muted">
                <TabsTrigger value="monthly" className="text-xs">รายเดือน</TabsTrigger>
                <TabsTrigger value="yearly" className="text-xs">รายปี</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Month/Year Selector */}
            {viewMode === "monthly" && months && months.length > 0 && (
              <>
                <Select value={selectedMonthKey} onValueChange={handleMonthChange}>
                  <SelectTrigger className="w-36 bg-card border-border shadow-sm">
                    <SelectValue placeholder="เดือน" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border shadow-lg z-50">
                    {monthsForYear.map((m) => (
                      <SelectItem key={m.month} value={m.month}>{m.month}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={selectedYear} onValueChange={(y) => { setSelectedYear(y); }}>
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

        {/* Content */}
        {viewMode === "monthly" && data && (
          <>
            <SummaryCards data={data} carryOver={carryOver} />
            <DailyChart data={data} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ExpenseChart data={data} />
              <ExpenseTabsChart data={data} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <BudgetBreakdown data={data} />
              <div className="lg:col-span-2">
                <TransactionTable data={data} />
              </div>
            </div>
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
