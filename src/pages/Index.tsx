import { useState } from "react";
import { useBudgetData, useAvailableMonths } from "@/hooks/useBudgetData";
import { SummaryCards } from "@/components/SummaryCards";
import { ExpenseChart } from "@/components/ExpenseChart";
import { ExpensePieChart } from "@/components/ExpensePieChart";
import { TransactionTable } from "@/components/TransactionTable";
import { BudgetBreakdown } from "@/components/BudgetBreakdown";
import { Wallet, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Index = () => {
  const [selectedMonth, setSelectedMonth] = useState<string | undefined>(undefined);
  const { data: months, isLoading: monthsLoading } = useAvailableMonths();
  const { data, isLoading, error } = useBudgetData(selectedMonth);

  if (isLoading || monthsLoading) {
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
            <Select
              value={selectedMonth ?? (months[0] || "")}
              onValueChange={(val) => setSelectedMonth(val)}
            >
              <SelectTrigger className="w-48 bg-card border-border shadow-sm">
                <SelectValue placeholder="เลือกเดือน" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border shadow-lg z-50">
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Summary Cards */}
        <SummaryCards data={data} />

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ExpenseChart data={data} />
          <ExpensePieChart data={data} />
        </div>

        {/* Budget Tracking + Transactions */}
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
