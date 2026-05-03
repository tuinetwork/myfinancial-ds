import { useMemo } from "react";
import { TrendingUp, TrendingDown, Wallet, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BudgetData, Transaction, formatCurrency } from "@/hooks/useBudgetData";
import { useSettings } from "@/contexts/SettingsContext";
import type { Account } from "@/types/finance";

interface Props {
  data: BudgetData;
  carryOver?: number;
  hideNetBalance?: boolean;
  mainWalletBalance?: number | null;
  accounts?: Account[];
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

export function SummaryCards({ data, carryOver = 0, mainWalletBalance, accounts = [] }: Props) {
  const { includeCarryOver } = useSettings();

  const isTransfer = (t: Transaction) =>
    t.type === "โอน" || t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี";

  // คำนวณ transfer ถอนจากบัญชีออม/ลงทุน → กระเป๋าหลัก
  const withdrawFromSavings = useMemo(() => {
    if (!accounts.length) return 0;
    const main = accounts.find((a) => a.name === "กระเป๋าเงินสดหลัก" && !a.is_deleted)
      ?? accounts.find((a) => a.type === "cash" && !a.is_deleted);
    if (!main) return 0;
    const savingsInvestmentTypes = new Set(["savings", "investment"]);
    const typeById = new Map(accounts.map((a) => [a.id, a.type]));
    return data.transactions
      .filter((t) => (t.type === "โอน" || t.type === "โอนระหว่างบัญชี")
        && t.to_account_id === main.id
        && savingsInvestmentTypes.has(typeById.get(t.from_account_id ?? "") ?? ""))
      .reduce((s, t) => s + t.amount, 0);
  }, [data.transactions, accounts]);

  const actualIncome = data.transactions
    .filter((t) => t.type === "รายรับ")
    .reduce((s, t) => s + t.amount, 0);
    
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

  const effectiveCarryOver = includeCarryOver ? carryOver : 0;
  const displayIncome = actualIncome + withdrawFromSavings + effectiveCarryOver;
  const netBalance = displayIncome - actualNonIncome;

  const sparklines = useMemo(() => ({
    income: buildDailyTotals(data.transactions, (t) => t.type === "รายรับ"),
    expense: buildDailyTotals(data.transactions, (t) => t.type !== "รายรับ" && !isTransfer(t)),
    net: buildDailyTotals(data.transactions, (t) => !isTransfer(t)),
  }), [data.transactions]);

  const incomePct = totalIncome > 0
    ? ((displayIncome - totalIncome) / totalIncome) * 100
    : 0;
  const expensePct = totalExpenseBudget > 0
    ? ((actualNonIncome - totalExpenseBudget) / totalExpenseBudget) * 100
    : 0;

  const fmtC = (n: number) => formatCurrency(Math.abs(n));
  const fmtN = (n: number) => n.toLocaleString("th-TH");

  type TooltipRow = { label: string; value: string; highlight?: boolean; color?: "green" | "red" };

  const pctColor = (v: number): "green" | "red" | undefined => v > 0 ? "green" : v < 0 ? "red" : undefined;

  const incomeRows: TooltipRow[] = [
    { label: "รายรับจริง", value: fmtC(actualIncome) },
    ...(withdrawFromSavings > 0
      ? [{ label: "ถอนออม/ลงทุน", value: fmtC(withdrawFromSavings) }]
      : []),
    ...(includeCarryOver && carryOver !== 0
      ? [{ label: "ยอดยกมา", value: fmtC(carryOver) }]
      : []),
    { label: "ยอดรวม", value: fmtC(displayIncome), highlight: true },
    { label: "งบประมาณ", value: fmtC(totalIncome) },
    { label: "ผลลัพธ์", value: `${incomePct >= 0 ? "+" : ""}${incomePct.toFixed(1)}%`, highlight: true, color: pctColor(incomePct) },
  ];

  const expenseRows: TooltipRow[] = [
    { label: "รายจ่ายจริง", value: fmtC(actualNonIncome), highlight: true },
    { label: "หมายเหตุ", value: "ไม่รวมรายการโอน" },
    { label: "งบประมาณ", value: fmtC(totalExpenseBudget) },
    { label: "สูตร %", value: `((${fmtN(actualNonIncome)} - ${fmtN(totalExpenseBudget)}) / ${fmtN(totalExpenseBudget)}) × 100` },
    { label: "ผลลัพธ์", value: `${expensePct >= 0 ? "+" : ""}${expensePct.toFixed(1)}%`, highlight: true, color: expensePct > 0 ? "red" : "green" },
  ];

  const netRows: TooltipRow[] = [
    ...(includeCarryOver
      ? [
          { label: "รายรับจริง", value: fmtC(actualIncome) },
          { label: "ยอดยกมา", value: fmtC(carryOver) },
          { label: "รายจ่ายจริง", value: fmtC(actualNonIncome) },
          { label: "ฐานะการเงิน", value: `${netBalance >= 0 ? "+" : "-"}${fmtC(netBalance)}`, highlight: true, color: pctColor(netBalance) },
          { label: "หมายเหตุ", value: "ไม่รวมรายการโอนระหว่างบัญชี" },
        ]
      : [
          { label: "รายรับจริง", value: fmtC(actualIncome) },
          { label: "รายจ่ายจริง", value: fmtC(actualNonIncome) },
          { label: "ฐานะการเงิน", value: `${netBalance >= 0 ? "+" : "-"}${fmtC(netBalance)}`, highlight: true, color: pctColor(netBalance) },
          { label: "หมายเหตุ", value: "ไม่รวมรายการโอนระหว่างบัญชี" },
        ]),
    ...(mainWalletBalance != null
      ? [{ label: "เงินสดในมือ", value: formatCurrency(mainWalletBalance), highlight: true, color: mainWalletBalance >= 0 ? "green" as const : "red" as const }]
      : []),
  ];

  const cards: {
    title: string; primary: number; pct: number; pctLabel: string; pctLabelExtra?: string | null;
    icon: typeof TrendingUp; gradient: string; sparkData: number[]; sparkType: "line" | "bar";
    rows: TooltipRow[];
  }[] = [
    {
      title: "รายรับ",
      primary: displayIncome,
      pct: incomePct,
      pctLabel: includeCarryOver && carryOver > 0 ? `รวมยกยอด ${formatCurrency(carryOver)}` : `ประมาณการ ${formatCurrency(totalIncome)}`,
      icon: TrendingUp,
      gradient: "from-[hsl(225,75%,57%)] to-[hsl(225,75%,47%)]",
      sparkData: sparklines.income,
      sparkType: "line" as const,
      rows: incomeRows,
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
      rows: expenseRows,
    },
    {
      title: "ฐานะการเงิน",
      primary: netBalance,
      pct: 0,
      pctLabel: netBalance >= 0 ? "สถานะดี" : "ขาดดุล",
      pctLabelExtra: mainWalletBalance != null ? `เงินสดในมือ ${formatCurrency(mainWalletBalance)}` : null,
      icon: Wallet,
      gradient: netBalance >= 0
        ? "from-[hsl(140,55%,48%)] to-[hsl(140,55%,38%)]"
        : "from-[hsl(0,65%,55%)] to-[hsl(0,65%,42%)]",
      sparkData: sparklines.net,
      sparkType: "bar" as const,
      rows: netRows,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {cards.map((card, i) => (
        <Card
          key={card.title}
          className={`animate-fade-in border-none shadow-lg bg-gradient-to-br ${card.gradient} text-white relative`}
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <CardContent className="p-4 sm:p-5 relative z-10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium opacity-90">{card.title}</span>
              <card.icon className="h-4 w-4 sm:h-5 sm:w-5 opacity-70" />
            </div>
            <p className="text-2xl sm:text-3xl font-bold font-display tracking-tight">
              {card.primary < 0 ? "-" : ""}{formatCurrency(Math.abs(card.primary))}
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="mt-2 cursor-help space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    {card.pct !== 0 && (
                      <span className="text-xs font-semibold text-white/90">
                        {card.pct > 0 ? "↑" : "↓"} {Math.abs(card.pct).toFixed(1)}%
                      </span>
                    )}
                    <span className="text-xs opacity-75">{card.pctLabel}</span>
                    <Info className="h-3 w-3 opacity-50" />
                  </div>
                  {card.pctLabelExtra && (
                    <div className="flex items-center gap-1">
                      <span className="text-xs opacity-90 font-medium">{card.pctLabelExtra}</span>
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={20} collisionPadding={20} className="p-0 border-border bg-popover shadow-xl rounded-lg">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-semibold text-foreground">{card.title} — คำอธิบาย</p>
                </div>
                <table className="text-xs w-full">
                  <tbody>
                    {card.rows.map((row, ri) => (
                      <tr key={ri} className={row.highlight ? "bg-muted/50" : ""}>
                        <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{row.label}</td>
                        <td className={`px-3 py-1.5 text-right whitespace-nowrap ${
                          row.color === "green" ? "font-semibold text-emerald-500" :
                          row.color === "red" ? "font-semibold text-red-500" :
                          row.highlight ? "font-semibold text-foreground" : "text-foreground"
                        }`}>{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TooltipContent>
            </Tooltip>
          </CardContent>
          <MiniSparkline data={card.sparkData} type={card.sparkType} />
          {/* Decorative background shape */}
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-white/10" />
        </Card>
      ))}
    </div>
  );
}
