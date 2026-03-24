import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/hooks/useBudgetData";
import { YearlyData } from "@/hooks/useYearlyData";
import { TrendingUp, TrendingDown } from "lucide-react";

const SHORT_THAI_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function formatPeriodThai(period: string) {
  const [y, m] = period.split("-");
  const thaiYear = (parseInt(y, 10) + 543) % 100;
  return `${SHORT_THAI_MONTHS[parseInt(m, 10) - 1]} ${thaiYear}`;
}

interface Props {
  yearlyData: YearlyData;
}

export function MonthlyHighlights({ yearlyData }: Props) {
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthStats = yearlyData.months.filter(({ month }) => month <= currentPeriod).map(({ month, data }) => {
    const expense = data.transactions
      .filter((t) => t.type !== "รายรับ")
      .reduce((s, t) => s + t.amount, 0);
    const income = data.transactions
      .filter((t) => t.type === "รายรับ")
      .reduce((s, t) => s + t.amount, 0);
    return { month, expense, income };
  });

  if (monthStats.length === 0) return null;

  const maxExpense = monthStats.reduce((a, b) => (b.expense > a.expense ? b : a));
  const minExpense = monthStats.reduce((a, b) => (b.expense < a.expense ? b : a));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in" style={{ animationDelay: "160ms" }}>
      <Card className="border-none shadow-argon border-l-4" style={{ borderLeftColor: "hsl(var(--expense))" }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground font-medium">เดือนที่ใช้จ่ายมากที่สุด</span>
            <div className="bg-expense/10 text-expense p-2 rounded-lg">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <p className="text-lg font-bold font-display">{formatPeriodThai(maxExpense.month)}</p>
          <p className="text-xl font-bold font-display text-expense">
            {formatCurrency(maxExpense.expense)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            รายรับ: {formatCurrency(maxExpense.income)}
          </p>
        </CardContent>
      </Card>

      <Card className="border-none shadow-argon border-l-4" style={{ borderLeftColor: "hsl(var(--income))" }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground font-medium">เดือนที่ใช้จ่ายน้อยที่สุด</span>
            <div className="bg-income/10 text-income p-2 rounded-lg">
              <TrendingDown className="h-4 w-4" />
            </div>
          </div>
          <p className="text-lg font-bold font-display">{formatPeriodThai(minExpense.month)}</p>
          <p className="text-xl font-bold font-display text-income">
            {formatCurrency(minExpense.expense)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            รายรับ: {formatCurrency(minExpense.income)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
