import { TrendingUp, TrendingDown, CreditCard, PiggyBank } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";

interface Props {
  data: BudgetData;
}

export function SummaryCards({ data }: Props) {
  const totalIncome = data.income.reduce((s, i) => s + i.budget, 0);
  const totalGeneral = data.expenses.general.reduce((s, i) => s + i.budget, 0);
  const totalBills = data.expenses.bills.reduce((s, i) => s + i.budget, 0);
  const totalDebts = data.expenses.debts.reduce((s, i) => s + i.budget, 0);
  const totalSubs = data.expenses.subscriptions.reduce((s, i) => s + i.budget, 0);
  const totalSavings = data.expenses.savings.reduce((s, i) => s + i.budget, 0);
  const totalExpenses = totalGeneral + totalBills + totalSubs;
  const balance = totalIncome - totalExpenses - totalDebts - totalSavings;

  const actualIncome = data.transactions
    .filter((t) => t.type === "รายรับ")
    .reduce((s, t) => s + t.amount, 0);
  const actualExpense = data.transactions
    .filter((t) => t.type === "ค่าใช้จ่าย" || t.type === "บิล/สาธารณูปโภค" || t.type === "ค่าสมาชิกรายเดือน")
    .reduce((s, t) => s + t.amount, 0);

  const cards = [
    {
      title: "รายรับ",
      budget: totalIncome,
      actual: actualIncome,
      icon: TrendingUp,
      color: "text-income" as const,
      bgColor: "bg-income/10" as const,
    },
    {
      title: "ค่าใช้จ่าย",
      budget: totalExpenses,
      actual: actualExpense,
      icon: TrendingDown,
      color: "text-expense" as const,
      bgColor: "bg-expense/10" as const,
    },
    {
      title: "หนี้สิน",
      budget: totalDebts,
      actual: data.transactions.filter((t) => t.type === "หนี้สิน").reduce((s, t) => s + t.amount, 0),
      icon: CreditCard,
      color: "text-debt" as const,
      bgColor: "bg-debt/10" as const,
    },
    {
      title: "เงินออม",
      budget: totalSavings,
      actual: 0,
      icon: PiggyBank,
      color: "text-saving" as const,
      bgColor: "bg-saving/10" as const,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className="animate-fade-in border-none shadow-sm"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground font-medium">{card.title}</span>
              <div className={`${card.bgColor} ${card.color} p-2 rounded-lg`}>
                <card.icon className="h-4 w-4" />
              </div>
            </div>
            <p className={`text-xl font-bold font-display ${card.color}`}>
              {formatCurrency(card.budget)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              ใช้จริง: {formatCurrency(card.actual)}
            </p>
          </CardContent>
        </Card>
      ))}

      {/* Balance card spanning full width on mobile */}
      <Card className="col-span-2 lg:col-span-4 border-none shadow-sm bg-primary text-primary-foreground animate-fade-in" style={{ animationDelay: "320ms" }}>
        <CardContent className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm opacity-80">ยอดคงเหลือ (งบประมาณ)</p>
            <p className="text-2xl font-bold font-display">{formatCurrency(balance)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-80">ใช้จริงคงเหลือ</p>
            <p className="text-2xl font-bold font-display">
              {formatCurrency(actualIncome - actualExpense - data.transactions.filter((t) => t.type === "หนี้สิน").reduce((s, t) => s + t.amount, 0))}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
