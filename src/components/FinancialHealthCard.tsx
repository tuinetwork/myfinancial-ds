import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { ShieldCheck, Percent, PiggyBank, CreditCard, CalendarDays, TrendingUp } from "lucide-react";

interface Props {
  data: BudgetData;
  carryOver?: number;
}

export function FinancialHealthCard({ data, carryOver = 0 }: Props) {
  const metrics = useMemo(() => {
    // 1. กรองรายการโอนระหว่างบัญชีออกทั้งหมดก่อนนำไปคำนวณ
    const activeTransactions = data.transactions.filter(
      (t) => t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี"
    );

    const income = activeTransactions
      .filter((t) => t.type === "รายรับ")
      .reduce((s, t) => s + t.amount, 0) + carryOver;

    const expenses = activeTransactions
      .filter((t) => t.type !== "รายรับ")
      .reduce((s, t) => s + t.amount, 0);

    const savings = activeTransactions
      .filter((t) => t.type === "เงินออม/การลงทุน")
      .reduce((s, t) => s + t.amount, 0);

    const totalBudget =
      data.expenses.general.reduce((s, i) => s + i.budget, 0) +
      data.expenses.bills.reduce((s, i) => s + i.budget, 0) +
      data.expenses.debts.reduce((s, i) => s + i.budget, 0) +
      data.expenses.subscriptions.reduce((s, i) => s + i.budget, 0) +
      data.expenses.savings.reduce((s, i) => s + i.budget, 0);

    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;
    const budgetUsage = totalBudget > 0 ? (expenses / totalBudget) * 100 : 0;
    
    // 2. จำนวนรายการ จะนับเฉพาะรายการที่ไม่ใช่การโอน
    const txCount = activeTransactions.length;

    // 3. ค่าใช้จ่ายเฉลี่ย/วัน จะนับวันจากรายการที่ไม่ใช่การโอน
    const uniqueDays = new Set(
      activeTransactions.filter((t) => t.type !== "รายรับ").map((t) => t.date)
    ).size;
    const avgDaily = uniqueDays > 0 ? expenses / uniqueDays : 0;

    return [
      {
        label: "อัตราเงินเหลือ",
        value: `${savingsRate.toFixed(1)}%`,
        icon: PiggyBank,
        color: savingsRate >= 20 ? "text-income" : savingsRate >= 0 ? "text-amber-500" : "text-expense",
        desc: savingsRate >= 20 ? "ดีมาก" : savingsRate >= 10 ? "ปานกลาง" : savingsRate >= 0 ? "ควรปรับปรุง" : "ขาดดุล",
      },
      {
        label: "ใช้งบไปแล้ว",
        value: `${Math.min(budgetUsage, 999).toFixed(1)}%`,
        icon: Percent,
        color: budgetUsage <= 80 ? "text-income" : budgetUsage < 100 ? "text-amber-500" : budgetUsage === 100 ? "text-amber-600" : "text-expense",
        desc: budgetUsage <= 80 ? "อยู่ในเกณฑ์" : budgetUsage < 100 ? "ใกล้เต็มงบ" : budgetUsage === 100 ? "เต็มแล้ว" : "เกินงบ",
      },
      {
        label: "ค่าใช้จ่ายเฉลี่ย/วัน",
        value: formatCurrency(avgDaily),
        icon: CalendarDays,
        color: "text-muted-foreground",
        desc: `${uniqueDays} วันที่มีรายจ่าย`,
      },
      {
        label: "จำนวนรายการ",
        value: `${txCount}`,
        icon: CreditCard,
        color: "text-muted-foreground",
        desc: `รายการทั้งหมดในเดือนนี้`,
      },
    ];
  }, [data, carryOver]);

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "440ms" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">สุขภาพการเงิน</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <m.icon className="h-3.5 w-3.5" />
                <span className="text-xs">{m.label}</span>
              </div>
              <p className={`text-lg font-bold font-display ${m.color}`}>{m.value}</p>
              <p className="text-[11px] text-muted-foreground">{m.desc}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
