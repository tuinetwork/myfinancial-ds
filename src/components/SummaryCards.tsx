import { useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, ArrowRightLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { BudgetData, Transaction, formatCurrency } from "@/hooks/useBudgetData";

interface Props {
  data: BudgetData;
  carryOver?: number;
  hideNetBalance?: boolean;
}

function MiniSparkline({ data, type }: { data: number[]; type: "line" | "bar" }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 36;
  const pad = 2;

  if (type === "bar") {
    const barW = Math.max(3, (w - pad * 2) / data.length - 2);
    return (
      <svg width={w} height={h} className="absolute bottom-3 right-3 opacity-50">
        {data.map((v, i) => {
          const barH = pad + ((v - min) / range) * (h - pad * 2);
          const x = pad + (i / data.length) * (w - pad * 2);
          return (
            <rect
              key={i}
              x={x}
              y={h - barH}
              width={barW}
              height={barH}
              rx={1.5}
              fill="white"
              fillOpacity={0.5}
            />
          );
        })}
      </svg>
    );
  }

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const pathD = `M${points.join("L")}`;
  const areaD = `${pathD}L${w - pad},${h - pad}L${pad},${h - pad}Z`;

  return (
    <svg width={w} height={h} className="absolute bottom-3 right-3 opacity-50">
      <path d={areaD} fill="white" fillOpacity={0.15} />
      <path d={pathD} fill="none" stroke="white" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function buildDailyTotals(transactions: Transaction[], typeFilter: (t: Transaction) => boolean): number[] {
  const filtered = transactions.filter(typeFilter);
  if (filtered.length === 0) return [];

  const byDate: Record<string, number> = {};
  filtered.forEach((t) => {
    byDate[t.date] = (byDate[t.date] || 0) + t.amount;
  });

  const sortedDates = Object.keys(byDate).sort();
  let cumulative = 0;
  return sortedDates.map((d) => {
    cumulative += byDate[d];
    return cumulative;
  });
}

export function SummaryCards({ data, carryOver = 0 }: Props) {
  const isTransfer = (t: Transaction) => 
    t.type === "โอน" || t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี";

  const actualIncome = data.transactions
    .filter((t) => t.type === "รายรับ")
    .reduce((s, t) => s + t.amount, 0);
    
  const actualNonIncome = data.transactions
    .filter((t) => t.type !== "รายรับ" && !isTransfer(t))
    .reduce((s, t) => s + t.amount, 0);

  const totalTransfer = data.transactions
    .filter((t) => isTransfer(t))
    .reduce((s, t) => s + t.amount, 0);

  const transferCount = data.transactions.filter((t) => isTransfer(t)).length;

  const totalIncome = data.income.reduce((s, i) => s + i.budget, 0);
  const totalGeneral = data.expenses.general.reduce((s, i) => s + i.budget, 0);
  const totalBills = data.expenses.bills.reduce((s, i) => s + i.budget, 0);
  const totalDebts = data.expenses.debts.reduce((s, i) => s + i.budget, 0);
  const totalSubs = data.expenses.subscriptions.reduce((s, i) => s + i.budget, 0);
  const totalSavings = data.expenses.savings.reduce((s, i) => s + i.budget, 0);
  const totalExpenseBudget = totalGeneral + totalBills + totalSubs + totalDebts + totalSavings;

  const netBalance = (actualIncome + carryOver) - actualNonIncome;

  const sparklines = useMemo(() => ({
    income: buildDailyTotals(data.transactions, (t) => t.type === "รายรับ"),
    expense: buildDailyTotals(data.transactions, (t) => t.type !== "รายรับ" && !isTransfer(t)),
    net: buildDailyTotals(data.transactions, (t) => !isTransfer(t)),
    transfer: buildDailyTotals(data.transactions, (t) => isTransfer(t)),
  }), [data.transactions]);

  const incomePct = totalIncome > 0
    ? (((actualIncome + carryOver) - totalIncome) / totalIncome) * 100
    : 0;
  const expensePct = totalExpenseBudget > 0
    ? ((actualNonIncome - totalExpenseBudget) / totalExpenseBudget) * 100
    : 0;

  const mainCards = [
    {
      title: "รายรับ",
      primary: actualIncome + carryOver,
      pct: incomePct,
      pctLabel: carryOver > 0 ? `รวมยกยอด ${formatCurrency(carryOver)}` : `ประมาณการ ${formatCurrency(totalIncome)}`,
      icon: TrendingUp,
      gradient: "from-[hsl(225,75%,57%)] to-[hsl(225,75%,47%)]",
      sparkData: sparklines.income,
      sparkType: "line" as const,
    },
    {
      title: "รายจ่าย",
      primary: actualNonIncome,
      pct: expensePct,
      pctLabel: `งบประมาณ ${formatCurrency(totalExpenseBudget)}`,
      icon: TrendingDown,
      gradient: "from-[hsl(180,70%,50%)] to-[hsl(180,70%,42%)]",
      sparkData: sparklines.expense,
      sparkType: "line" as const,
    },
    {
      title: "คงเหลือสุทธิ",
      primary: netBalance,
      pct: 0,
      pctLabel: netBalance >= 0 ? "สถานะดี" : "ขาดดุล",
      icon: Wallet,
      gradient: netBalance >= 0
        ? "from-[hsl(140,55%,48%)] to-[hsl(140,55%,38%)]"
        : "from-[hsl(0,65%,55%)] to-[hsl(0,65%,42%)]",
      sparkData: sparklines.net,
      sparkType: "bar" as const,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {mainCards.map((card, i) => (
          <Card
            key={card.title}
            className={`animate-fade-in border-none shadow-lg bg-gradient-to-br ${card.gradient} text-white overflow-hidden relative`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <CardContent className="p-4 sm:p-5 relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium opacity-90">{card.title}</span>
                <card.icon className="h-4 w-4 sm:h-5 sm:w-5 opacity-70" />
              </div>
              <p className="text-2xl sm:text-3xl font-bold font-display tracking-tight">
                {formatCurrency(Math.abs(card.primary))}
              </p>
              <div className="flex items-center gap-1.5 mt-2">
                {card.pct !== 0 && (
                  <span className="text-xs font-semibold text-white/90">
                    {card.pct > 0 ? "↑" : "↓"} {Math.abs(card.pct).toFixed(1)}%
                  </span>
                )}
                <span className="text-xs opacity-75">
                  {card.pctLabel}
                </span>
              </div>
            </CardContent>
            <MiniSparkline data={card.sparkData} type={card.sparkType} />
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
          </Card>
        ))}
      </div>

      {/* Transfer Summary Card */}
      {transferCount > 0 && (
        <Card
          className="animate-fade-in border-none shadow-md bg-gradient-to-br from-[hsl(250,30%,55%)] to-[hsl(250,30%,42%)] text-white overflow-hidden relative"
          style={{ animationDelay: "240ms" }}
        >
          <CardContent className="p-4 sm:p-5 relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/15">
                  <ArrowRightLeft className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-sm font-medium opacity-90">โอนระหว่างบัญชี</span>
                  <p className="text-xl sm:text-2xl font-bold font-display tracking-tight">
                    {formatCurrency(totalTransfer)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs opacity-75">{transferCount} รายการ</span>
              </div>
            </div>
          </CardContent>
          <MiniSparkline data={sparklines.transfer} type="line" />
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
        </Card>
      )}
    </div>
  );
}
