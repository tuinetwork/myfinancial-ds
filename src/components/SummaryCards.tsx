import { TrendingUp, TrendingDown, CreditCard, PiggyBank } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";

interface Props {
  data: BudgetData;
  carryOver?: number;
  hideNetBalance?: boolean;
}

export function SummaryCards({ data, carryOver = 0, hideNetBalance = false }: Props) {
  const totalIncome = data.income.reduce((s, i) => s + i.budget, 0);
  const totalGeneral = data.expenses.general.reduce((s, i) => s + i.budget, 0);
  const totalBills = data.expenses.bills.reduce((s, i) => s + i.budget, 0);
  const totalDebts = data.expenses.debts.reduce((s, i) => s + i.budget, 0);
  const totalSubs = data.expenses.subscriptions.reduce((s, i) => s + i.budget, 0);
  const totalSavings = data.expenses.savings.reduce((s, i) => s + i.budget, 0);
  const totalExpenses = totalGeneral + totalBills + totalSubs;

  const actualIncome = data.transactions
    .filter((t) => t.type === "รายรับ")
    .reduce((s, t) => s + t.amount, 0);
  const actualExpense = data.transactions
    .filter((t) => t.type === "ค่าใช้จ่าย" || t.type === "บิล/สาธารณูปโภค" || t.type === "ค่าสมาชิกรายเดือน")
    .reduce((s, t) => s + t.amount, 0);
  const actualDebt = data.transactions.filter((t) => t.type === "หนี้สิน").reduce((s, t) => s + t.amount, 0);
  const actualSaving = data.transactions.filter((t) => t.type === "เงินออม/การลงทุน").reduce((s, t) => s + t.amount, 0);
  const actualNonIncome = data.transactions
    .filter((t) => t.type !== "รายรับ")
    .reduce((s, t) => s + t.amount, 0);

  const cards = [
    {
      title: "รายรับ",
      primary: actualIncome + carryOver,
      secondary: totalIncome,
      secondaryLabel: "ประมาณการ",
      carryOver,
      icon: TrendingUp,
      gradient: "from-[hsl(160,60%,45%)] to-[hsl(160,60%,35%)]",
    },
    {
      title: "ค่าใช้จ่าย",
      primary: actualNonIncome,
      secondary: totalExpenses,
      secondaryLabel: "ประมาณการ",
      icon: TrendingDown,
      gradient: "from-[hsl(217,72%,55%)] to-[hsl(217,72%,42%)]",
    },
    {
      title: "หนี้สิน",
      primary: actualDebt,
      secondary: totalDebts,
      secondaryLabel: "ตามแผน",
      icon: CreditCard,
      gradient: "from-[hsl(35,90%,55%)] to-[hsl(35,90%,42%)]",
    },
    {
      title: "เงินออม",
      primary: Math.abs(actualSaving),
      secondary: totalSavings,
      secondaryLabel: "เป้าหมาย",
      icon: PiggyBank,
      gradient: "from-[hsl(280,60%,55%)] to-[hsl(280,60%,42%)]",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => {
          const rawPct = card.secondary > 0 ? (card.primary / card.secondary) * 100 : 0;
          return (
            <Card
              key={card.title}
              className={`animate-fade-in border-none shadow-lg bg-gradient-to-br ${card.gradient} text-white overflow-hidden relative`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <CardContent className="p-5 relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium opacity-90">{card.title}</span>
                  <card.icon className="h-5 w-5 opacity-70" />
                </div>
                <p className="text-2xl sm:text-3xl font-bold font-display tracking-tight">
                  {formatCurrency(card.primary)}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  {'carryOver' in card && card.carryOver !== 0 && (
                    <span className="text-xs opacity-80 mr-1">
                      ยกยอด +{formatCurrency(Math.abs(card.carryOver))}
                    </span>
                  )}
                  <span className="text-xs opacity-75">
                    {card.secondaryLabel}: {formatCurrency(card.secondary)}
                  </span>
                  {card.secondary > 0 && (
                    <span className="text-xs font-semibold opacity-90">
                      ({rawPct.toFixed(0)}%)
                    </span>
                  )}
                </div>
              </CardContent>
              {/* Decorative background shape */}
              <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
              <div className="absolute -right-2 -bottom-6 w-16 h-16 rounded-full bg-white/5" />
            </Card>
          );
        })}
      </div>

      {!hideNetBalance && (
        <Card className="border-none shadow-lg bg-gradient-to-r from-[hsl(220,25%,15%)] to-[hsl(220,25%,22%)] text-white animate-fade-in" style={{ animationDelay: "320ms" }}>
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm opacity-70">คงเหลือสุทธิ</p>
              <p className="text-2xl font-bold font-display">
                {formatCurrency((actualIncome + carryOver) - actualNonIncome)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-70">งบประมาณที่ตั้งไว้</p>
              <p className="text-2xl font-bold font-display">
                {formatCurrency(totalExpenses + totalDebts + totalSavings)}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
