import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BudgetData } from "@/hooks/useBudgetData";

interface Props {
  data: BudgetData;
}

function formatCurrency(n: number) {
  return `฿${Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getPrevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

type TooltipRow = { label: string; value: string; highlight?: boolean; color?: "green" | "red" };

function ChangeIndicator({ current, previous, label, invertColor = false, rows, tooltipTitle }: {
  current: number;
  previous: number;
  label: string;
  invertColor?: boolean;
  rows: TooltipRow[];
  tooltipTitle: string;
}) {
  const diff = current - previous;
  const pct = previous > 0 ? Math.round((diff / previous) * 100) : current > 0 ? 100 : 0;
  const isUp = diff > 0;
  const isZero = diff === 0;

  const isPositive = invertColor ? !isUp : isUp;

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold font-display">{formatCurrency(current)}</p>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-xs cursor-help">
            {isZero ? (
              <>
                <Minus className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">ไม่เปลี่ยนแปลง</span>
              </>
            ) : (
              <>
                {isUp ? (
                  <ArrowUpRight className={cn("h-3 w-3", isPositive ? "text-accent" : "text-destructive")} />
                ) : (
                  <ArrowDownRight className={cn("h-3 w-3", isPositive ? "text-accent" : "text-destructive")} />
                )}
                <span className={cn(isPositive ? "text-accent" : "text-destructive")}>
                  {isUp ? "+" : ""}{pct}% ({isUp ? "+" : ""}{formatCurrency(diff)})
                </span>
              </>
            )}
            <Info className="h-3 w-3 text-muted-foreground/40" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={16} collisionPadding={20} className="p-0 border-border bg-popover shadow-xl rounded-lg">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-foreground">{tooltipTitle}</p>
          </div>
          <table className="text-xs w-full">
            <tbody>
              {rows.map((row, ri) => (
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
    </div>
  );
}

export function MonthComparison({ data }: Props) {
  const { userId } = useAuth();
  const [prevData, setPrevData] = useState<{ income: number; expense: number } | null>(null);

  const prevPeriod = getPrevPeriod(data.period);

  useEffect(() => {
    if (!userId || !data.period) return;
    const txCol = collection(firestore, "users", userId, "transactions");
    const q = query(txCol, where("month_year", "==", prevPeriod));
    getDocs(q).then((snap) => {
      let income = 0;
      let expense = 0;
      snap.forEach((d) => {
        const t = d.data();
        if (t.is_deleted) return;
        if (t.type === "income") income += Number(t.amount) || 0;
        if (t.type === "expense") expense += Number(t.amount) || 0;
      });
      setPrevData({ income, expense });
    });
  }, [userId, data.period]);

  const currentIncome = data.transactions.filter((t) => t.type === "รายรับ").reduce((s, t) => s + t.amount, 0);
  const currentExpense = data.transactions
    .filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
    .reduce((s, t) => s + t.amount, 0);

  if (!prevData || (prevData.income === 0 && prevData.expense === 0)) return null;

  const currentNet = currentIncome - currentExpense;
  const prevNet = prevData.income - prevData.expense;
  const incomeDiff = currentIncome - prevData.income;
  const expenseDiff = currentExpense - prevData.expense;
  const netDiff = currentNet - prevNet;
  const fmt = (n: number) => `฿${Math.abs(n).toLocaleString("th-TH")}`;
  const fmtSigned = (n: number) => `${n < 0 ? "-" : ""}฿${Math.abs(n).toLocaleString("th-TH")}`;

  return (
    <Card className="border-none shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          เปรียบเทียบกับเดือนก่อน
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <ChangeIndicator
            current={currentIncome}
            previous={prevData.income}
            label="รายรับ"
            tooltipTitle="รายรับ — เปรียบเทียบ"
            rows={[
              { label: "เดือนนี้", value: fmt(currentIncome), highlight: true },
              { label: "เดือนก่อน", value: fmt(prevData.income) },
              { label: "ผลต่าง", value: `${incomeDiff >= 0 ? "+" : ""}${fmt(incomeDiff)}`, highlight: true, color: incomeDiff >= 0 ? "green" : "red" },
            ]}
          />
          <ChangeIndicator
            current={currentExpense}
            previous={prevData.expense}
            label="รายจ่าย"
            invertColor
            tooltipTitle="รายจ่าย — เปรียบเทียบ"
            rows={[
              { label: "เดือนนี้", value: fmt(currentExpense), highlight: true },
              { label: "เดือนก่อน", value: fmt(prevData.expense) },
              { label: "ผลต่าง", value: `${expenseDiff >= 0 ? "+" : ""}${fmt(expenseDiff)}`, highlight: true, color: expenseDiff > 0 ? "red" : "green" },
            ]}
          />
          <ChangeIndicator
            current={currentNet}
            previous={prevNet}
            label="คงเหลือ"
            tooltipTitle="คงเหลือ — เปรียบเทียบ"
            rows={[
              { label: "เดือนนี้", value: fmtSigned(currentNet), highlight: true },
              { label: "เดือนก่อน", value: fmtSigned(prevNet) },
              { label: "ผลต่าง", value: `${netDiff >= 0 ? "+" : ""}${fmt(netDiff)}`, highlight: true, color: netDiff >= 0 ? "green" : "red" },
              { label: "หมายเหตุ", value: "ไม่รวมรายการโอน" },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  );
}
