import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetData, BudgetItem, formatCurrency } from "@/hooks/useBudgetData";
import { expandRecurrence } from "@/lib/recurrence";
import { Target, CheckCircle2, AlertTriangle } from "lucide-react";

interface Props {
  data: BudgetData;
}

function AnimatedBar({ pct, colorClass, height = "h-3", delay = 0 }: { pct: number; colorClass: string; height?: string; delay?: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), 100 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);

  return (
    <div className={`${height} rounded-full bg-muted overflow-hidden`}>
      <div
        className={`h-full rounded-full ${colorClass}`}
        style={{
          width: `${width}%`,
          transition: "width 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
      />
    </div>
  );
}

/** Calculate effective monthly budget: per-installment × occurrences in this period */
function monthlyTarget(item: BudgetItem, period: string): number {
  if (!item.recurrence) return item.budget;
  const [yearStr, monthStr] = period.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const occurrences = expandRecurrence(item.dueDate, item.recurrence, year, month, item.startDate, item.endDate);
  return occurrences.length > 0 ? item.budget * occurrences.length : item.budget;
}

export function SavingsGoalCard({ data }: Props) {
  const { goals, totalTarget, totalActual, overallPct } = useMemo(() => {
    const savingsBudgets = data.expenses.savings;

    const savingsLabels = new Set(savingsBudgets.map(item => item.label));
    const actualByCategory: Record<string, number> = {};
    data.transactions
      .filter((t) =>
        t.type === "เงินออม/การลงทุน" ||
        (t.type === "โอน" && savingsLabels.has(t.category))
      )
      .forEach((t) => {
        actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount;
      });

    const goals = savingsBudgets.map((item) => {
      const actual = actualByCategory[item.label] || 0;
      const target = monthlyTarget(item, data.period);
      const pct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
      return {
        label: item.label,
        target,
        actual,
        pct,
        completed: actual >= target && target > 0,
      };
    }).filter((g) => g.target > 0);

    const totalTarget = goals.reduce((s, g) => s + g.target, 0);
    const totalActual = goals.reduce((s, g) => s + Math.min(g.actual, g.target), 0);
    const overallPct = totalTarget > 0 ? Math.min((totalActual / totalTarget) * 100, 100) : 0;

    return { goals, totalTarget, totalActual, overallPct };
  }, [data]);

  const statusColor = overallPct >= 100
    ? "text-income"
    : overallPct >= 50
      ? "text-amber-500"
      : "text-expense";

  const statusLabel = overallPct >= 100
    ? "ครบเป้าหมาย! 🎉"
    : overallPct >= 75
      ? "ใกล้ถึงเป้าแล้ว"
      : overallPct >= 50
        ? "ผ่านครึ่งทางแล้ว"
        : "เริ่มต้นออม";

  const overallBarColor = overallPct >= 100
    ? "bg-income"
    : overallPct >= 50
      ? "bg-amber-500"
      : "bg-expense";

  return (
    <Card className="border-none shadow-sm animate-fade-in h-full" style={{ animationDelay: "520ms" }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">เป้าหมายการออม</CardTitle>
          </div>
          <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall progress */}
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-2xl font-bold font-display">{overallPct.toFixed(0)}%</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatCurrency(totalActual)} / {formatCurrency(totalTarget)}
              </p>
            </div>
            {overallPct >= 100 ? (
              <CheckCircle2 className="h-8 w-8 text-income opacity-60" />
            ) : overallPct < 30 ? (
              <AlertTriangle className="h-8 w-8 text-amber-400 opacity-40" />
            ) : null}
          </div>
          <AnimatedBar pct={overallPct} colorClass={overallBarColor} height="h-3" delay={0} />
        </div>

        {/* Individual goals */}
        {goals.length > 0 ? (
          <div className="space-y-3 pt-1">
            {goals.map((g, i) => (
              <div key={g.label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    {g.completed && <CheckCircle2 className="h-3 w-3 text-income" />}
                    <span className="text-sm truncate">{g.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums font-display">
                    {g.pct.toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <AnimatedBar
                      pct={g.pct}
                      colorClass={g.completed ? "bg-income" : "bg-primary"}
                      height="h-1.5"
                      delay={(i + 1) * 150}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                    {formatCurrency(g.actual)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">ยังไม่มีเป้าหมายการออม</p>
        )}
      </CardContent>
    </Card>
  );
}
