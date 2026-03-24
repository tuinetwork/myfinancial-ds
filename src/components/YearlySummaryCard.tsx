import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/hooks/useBudgetData";
import { YearlyData } from "@/hooks/useYearlyData";
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from "lucide-react";

interface Props {
  yearlyData: YearlyData;
}

export function YearlySummaryCard({ yearlyData }: Props) {
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const filteredMonths = yearlyData.months.filter(({ month }) => month <= currentPeriod);

  const allTransactions = filteredMonths.flatMap(({ data }) => data.transactions);

  // 1. กรองรายการโอนทุกรูปแบบออกไปก่อน
  const validTransactions = allTransactions.filter(
    (t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี"
  );

  // 2. คำนวณรายรับจากรายการที่ถูกกรองแล้ว
  const totalIncome = validTransactions
    .filter((t) => t.type === "รายรับ")
    .reduce((s, t) => s + t.amount, 0);

  // 3. คำนวณรายจ่ายจากรายการที่ถูกกรองแล้ว
  const totalExpense = validTransactions
    .filter((t) => t.type !== "รายรับ")
    .reduce((s, t) => s + t.amount, 0);

  const netBalance = totalIncome - totalExpense;
  const avgMonthlyExpense = filteredMonths.length > 0
    ? totalExpense / filteredMonths.length
    : 0;

  const items = [
    { label: "รายรับรวมทั้งปี", value: totalIncome, icon: TrendingUp, color: "text-income" },
    { label: "รายจ่ายรวมทั้งปี", value: totalExpense, icon: TrendingDown, color: "text-expense" },
    { label: "คงเหลือสุทธิ", value: netBalance, icon: Wallet, color: netBalance >= 0 ? "text-income" : "text-expense" },
    { label: "เฉลี่ย/เดือน", value: avgMonthlyExpense, icon: PiggyBank, color: "text-muted-foreground" },
  ];

  return (
    <Card className="col-span-1 border-none shadow-argon-lg bg-primary text-primary-foreground animate-fade-in" style={{ animationDelay: "320ms" }}>
      <CardContent className="p-5">
        <p className="text-sm opacity-80 mb-3 font-medium">สรุปยอดรวมทั้งปี ({filteredMonths.length} เดือน)</p>
        <div className="grid grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.label}>
              <p className="text-xs opacity-70">{item.label}</p>
              <p className="text-lg font-bold font-display">{formatCurrency(item.value)}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
