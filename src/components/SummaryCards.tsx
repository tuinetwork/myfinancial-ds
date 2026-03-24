import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetData, Transaction, formatCurrency } from "@/hooks/useBudgetData";

interface Props {
  data: BudgetData;
  carryOver?: number;
  hideNetBalance?: boolean;
}

export function SummaryCards({ data, carryOver = 0 }: Props) {
  // ฟังก์ชันช่วยเหลือสำหรับคัดกรองรายการโอน
  const isTransfer = (t: Transaction) => 
    t.type === "โอน" || t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี";

  const actualIncome = data.transactions
    .filter((t) => t.type === "รายรับ")
    .reduce((s, t) => s + t.amount, 0);
    
  // แก้ไข: เพิ่มเงื่อนไข !isTransfer(t)
  const actualNonIncome = data.transactions
    .filter((t) => t.type !== "รายรับ" && !isTransfer(t))
    .reduce((s, t) => s + t.amount, 0);

  const totalIncome = data.income.reduce((s, i) => s + i.budget, 0);
  const totalGeneral = data.expenses.general.reduce((s, i) => s + i.budget, 0);
  const totalBills = data.expenses.bills.reduce((s, i) => s + i.budget, 0);
  const totalDebts = data.expenses.debts.reduce((s, i) => s + i.budget, 0);
  const totalSubs = data.expenses.subscriptions.reduce((s, i) => s + i.budget, 0);
  const totalSavings = data.expenses.savings.reduce((s, i) => s + i.budget, 0);
  const totalExpenseBudget = totalGeneral + totalBills + totalSubs + totalDebts + totalSavings;

  const netBalance = (actualIncome + carryOver) - actualNonIncome;

  const incomePct = totalIncome > 0
    ? (((actualIncome + carryOver) - totalIncome) / totalIncome) * 100
    : 0;
  const expensePct = totalExpenseBudget > 0
    ? ((actualNonIncome - totalExpenseBudget) / totalExpenseBudget) * 100
    : 0;

  const cards = [
    {
      title: "รายรับ",
      primary: actualIncome + carryOver,
      pct: incomePct,
      pctLabel: carryOver > 0 ? `รวมยกยอด ${formatCurrency(carryOver)}` : `ประมาณการ ${formatCurrency(totalIncome)}`,
      icon: TrendingUp,
      iconBg: "bg-gradient-to-br from-green-400 to-green-600",
    },
    {
      title: "รายจ่าย",
      primary: actualNonIncome,
      pct: expensePct,
      pctLabel: `งบประมาณ ${formatCurrency(totalExpenseBudget)}`,
      icon: TrendingDown,
      iconBg: "bg-gradient-to-br from-orange-400 to-red-500",
    },
    {
      title: "คงเหลือสุทธิ",
      primary: netBalance,
      pct: 0,
      pctLabel: netBalance >= 0 ? "สถานะดี" : "ขาดดุล",
      icon: Wallet,
      iconBg: netBalance >= 0
        ? "bg-gradient-to-br from-blue-400 to-indigo-600"
        : "bg-gradient-to-br from-red-400 to-red-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className="animate-fade-in border-none shadow-argon bg-card overflow-hidden"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {card.title}
                </p>
                <p className="text-xl sm:text-2xl font-bold font-display tracking-tight text-foreground">
                  {formatCurrency(Math.abs(card.primary))}
                </p>
              </div>
              <div className={`${card.iconBg} w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center shadow-lg`}>
                <card.icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border">
              {card.pct !== 0 && (
                <span className={`text-xs font-semibold ${card.pct > 0 ? "text-income" : "text-expense"}`}>
                  {card.pct > 0 ? "↑" : "↓"} {Math.abs(card.pct).toFixed(1)}%
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {card.pctLabel}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
