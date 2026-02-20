import { useState, useEffect } from "react";
import { useBudgetData, useAvailableMonths } from "@/hooks/useBudgetData";
import { SummaryCards } from "@/components/SummaryCards";
import { ExpenseChart } from "@/components/ExpenseChart";
import { ExpensePieChart } from "@/components/ExpensePieChart";
import { TransactionTable } from "@/components/TransactionTable";
import { DailyChart } from "@/components/DailyChart";
import { ExpenseCategoryChart } from "@/components/ExpenseCategoryChart";
import { BudgetBreakdown } from "@/components/BudgetBreakdown";
import { Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Index = () => {
  const { data: months, isLoading: monthsLoading } = useAvailableMonths();
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);

  // Auto-select latest month when months load
  useEffect(() => {
    if (months && months.length > 0 && !selectedPath) {
      setSelectedPath(months[0].path);
    }
  }, [months, selectedPath]);

  // Find previous month path
  const previousPath = (() => {
    if (!months || !selectedPath) return undefined;
    const idx = months.findIndex((m) => m.path === selectedPath);
    return idx >= 0 && idx + 1 < months.length ? months[idx + 1].path : undefined;
  })();

  const { data, isLoading, error } = useBudgetData(selectedPath);
  const { data: prevData } = useBudgetData(previousPath);

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

  if (isLoading || monthsLoading || !selectedPath) {
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

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-destructive">ไม่สามารถโหลดข้อมูลได้</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground p-2.5 rounded-xl">
              <Wallet className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">งบประมาณประจำเดือน{data.month}</h1>
              <p className="text-sm text-muted-foreground">
                อัปเดตล่าสุด: {new Date(data.timestamp).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>

          {/* Month Selector */}
          {months && months.length > 0 && (
            <Select value={selectedPath} onValueChange={setSelectedPath}>
              <SelectTrigger className="w-52 bg-card border-border shadow-sm">
                <SelectValue placeholder="เลือกเดือน" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border shadow-lg z-50">
                {months.map((m) => (
                  <SelectItem key={m.path} value={m.path}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <SummaryCards data={data} carryOver={carryOver} />

        <DailyChart data={data} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ExpenseChart data={data} />
          <ExpensePieChart data={data} />
        </div>

        <ExpenseCategoryChart data={data} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <BudgetBreakdown data={data} />
          <div className="lg:col-span-2">
            <TransactionTable data={data} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
