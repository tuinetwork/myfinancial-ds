import { useState, useEffect, useMemo } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { AppFooter } from "@/components/AppFooter";
import { useBudgetData, useAvailableMonths } from "@/hooks/useBudgetData";
import { TransactionTable } from "@/components/TransactionTable";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Home, Receipt } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Transactions = () => {
  const { data: months, isLoading: monthsLoading } = useAvailableMonths();
  const [selectedYear, setSelectedYear] = useState<string | undefined>(undefined);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | undefined>(undefined);

  const years = useMemo(() => {
    if (!months) return [];
    return Array.from(new Set(months.map((m) => m.year))).sort().reverse();
  }, [months]);

  const monthsForYear = useMemo(() => {
    if (!months || !selectedYear) return [];
    return months.filter((m) => m.year === selectedYear);
  }, [months, selectedYear]);

  useEffect(() => {
    if (years.length > 0 && !selectedYear) setSelectedYear(years[0]);
  }, [years, selectedYear]);

  useEffect(() => {
    if (monthsForYear.length > 0) setSelectedMonthKey(monthsForYear[0].month);
  }, [monthsForYear]);

  const selectedPeriod = useMemo(() => {
    if (!selectedYear || !selectedMonthKey) return undefined;
    return `${selectedYear}-${selectedMonthKey}`;
  }, [selectedYear, selectedMonthKey]);

  const { data, isLoading } = useBudgetData(selectedPeriod);

  const isPageLoading = isLoading || monthsLoading || !selectedPeriod;

  return (
    <>
      <AppSidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">รายการธุรกรรม</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div className="space-y-6">
            {/* Breadcrumb */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/" className="flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    <span className="hidden sm:inline">หน้าหลัก</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>รายการธุรกรรม</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            {/* Controls bar */}
            <div className="flex flex-wrap items-center gap-3">
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

              {monthsForYear.length > 0 && (
                <Select value={selectedMonthKey} onValueChange={setSelectedMonthKey}>
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

            {isPageLoading ? (
              <Skeleton className="h-96 rounded-lg" />
            ) : data ? (
              <TransactionTable data={data} />
            ) : (
              <div className="flex items-center justify-center h-64">
                <p className="text-destructive">ไม่สามารถโหลดข้อมูลได้</p>
              </div>
            )}
          </div>
        </main>
        <AppFooter />
      </div>
    </>
  );
};

export default Transactions;
