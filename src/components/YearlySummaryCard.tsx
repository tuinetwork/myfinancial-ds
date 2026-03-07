import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/hooks/useBudgetData";
import { YearlyData } from "@/hooks/useYearlyData";
import { ArrowTrendingUpIcon as TrendingUp, ArrowTrendingDownIcon as TrendingDown, WalletIcon as Wallet, BanknotesIcon as PiggyBank } from "@heroicons/react/24/outline";

interface Props {
  yearlyData: YearlyData;
}

export function YearlySummaryCard({ yearlyData }: Props) {
  const { aggregated } = yearlyData;

  const totalIncome = aggregated.transactions
    .filter((t) => t.type === "รายรับ")
    .reduce((s, t) => s + t.amount, 0);

  const totalExpense = aggregated.transactions
    .filter((t) => t.type !== "รายรับ")
    .reduce((s, t) => s + t.amount, 0);

  const netBalance = totalIncome - totalExpense;
  const avgMonthlyExpense = yearlyData.months.length > 0
    ? totalExpense / yearlyData.months.length
    : 0;

  const items = [
    { label: "รายรับรวมทั้งปี", value: totalIncome, icon: TrendingUp, color: "text-income" },
    { label: "รายจ่ายรวมทั้งปี", value: totalExpense, icon: TrendingDown, color: "text-expense" },
    { label: "คงเหลือสุทธิ", value: netBalance, icon: Wallet, color: netBalance >= 0 ? "text-income" : "text-expense" },
    { label: "เฉลี่ย/เดือน", value: avgMonthlyExpense, icon: PiggyBank, color: "text-muted-foreground" },
  ];

  return (
    <Card className="col-span-1 border-none shadow-sm bg-primary text-primary-foreground animate-fade-in" style={{ animationDelay: "320ms" }}>
      <CardContent className="p-5">
        <p className="text-sm opacity-80 mb-3 font-medium">สรุปยอดรวมทั้งปี ({yearlyData.months.length} เดือน)</p>
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
