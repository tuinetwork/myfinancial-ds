import { useState, useEffect, useMemo } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppFooter } from "@/components/AppFooter";
import { useBudgetData, useAvailableMonths, Transaction } from "@/hooks/useBudgetData";
import { collection, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { TransactionTable } from "@/components/TransactionTable";
import { TransferTable } from "@/components/TransferTable";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Home, Receipt, ArrowRightLeft } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Transactions = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
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

  // Load ALL transactions (for cross-month date range filtering)
  const [allTransfers, setAllTransfers] = useState<Transaction[]>([]);
  const [allNonTransfers, setAllNonTransfers] = useState<Transaction[]>([]);

  useEffect(() => {
    if (!userId) return;

    const TYPE_MAP: Record<string, string> = {
      income: "รายรับ", expense: "ค่าใช้จ่าย", transfer: "โอน",
    };
    const MAIN_CAT_MAP: Record<string, string> = {
      "ค่าใช้จ่ายทั่วไป": "ค่าใช้จ่าย", "บิลและสาธารณูปโภค": "บิล/สาธารณูปโภค",
      "หนี้สิน": "หนี้สิน", "ค่าสมาชิกรายเดือน": "ค่าสมาชิกรายเดือน", "เงินออมและการลงทุน": "เงินออม/การลงทุน",
    };

    getDocs(collection(firestore, "users", userId, "transactions")).then((snap) => {
      const transfers: Transaction[] = [];
      const nonTransfers: Transaction[] = [];

      snap.docs.forEach((d) => {
        const t = d.data();
        if (t.is_deleted) return;
        const rawType = (t.type as string) ?? "";
        const isTransfer = rawType === "transfer";
        const mainCategory = (t.main_category as string) ?? "";
        const tx: Transaction = {
          id: d.id,
          date: (t.date as string) ?? "",
          amount: (t.amount as number) ?? 0,
          type: isTransfer ? "โอน" : (TYPE_MAP[rawType] ?? MAIN_CAT_MAP[mainCategory] ?? rawType),
          main_category: mainCategory || undefined,
          category: (t.sub_category as string) ?? (isTransfer ? "โอนระหว่างบัญชี" : ""),
          description: (t.note as string) ?? "",
          from_account_id: (t.from_account_id as string) || undefined,
          to_account_id: (t.to_account_id as string) || undefined,
          tags: (t.tags as string[]) || undefined,
          created_at: (t.created_at as number) || undefined,
        };
        if (isTransfer) transfers.push(tx);
        else nonTransfers.push(tx);
      });

      setAllTransfers(transfers);
      setAllNonTransfers(nonTransfers);
    });
  }, [userId]);

  const isPageLoading = isLoading || monthsLoading || !selectedPeriod;

  const transferCount = useMemo(() => {
    if (!data) return 0;
    return data.transactions.filter(
      (t) => t.type === "โอน" || t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี"
    ).length;
  }, [data]);

  const handleMutate = () => queryClient.invalidateQueries({ queryKey: ["budget-data"] });

  return (
    <>
      <AppSidebar />

      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">รายการธุรกรรม</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <span className="hidden md:contents">
              <NotificationBell />
              <UserProfilePopover />
            </span>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div className="space-y-4">
            {/* Breadcrumb — desktop only */}
            <Breadcrumb className="hidden md:flex">
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
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
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
              <Tabs defaultValue="transactions" className="w-full">
                <TabsList className="mb-4">
                  <TabsTrigger value="transactions" className="gap-1.5">
                    <Receipt className="h-3.5 w-3.5" />
                    รายรับ-รายจ่าย
                  </TabsTrigger>
                  <TabsTrigger value="transfers" className="gap-1.5">
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                    การโอน
                    {transferCount > 0 && (
                      <span className="ml-1 text-[10px] bg-muted-foreground/20 text-muted-foreground rounded-full px-1.5 py-0.5 leading-none">
                        {transferCount}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="transactions">
                  <TransactionTable
                    data={data}
                    userId={userId}
                    onMutate={handleMutate}
                    excludeTransfers
                    allTransactions={allNonTransfers}
                  />
                </TabsContent>

                <TabsContent value="transfers">
                  <TransferTable
                    data={data}
                    userId={userId}
                    onMutate={handleMutate}
                    allTransactions={allTransfers}
                  />
                </TabsContent>
              </Tabs>
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
