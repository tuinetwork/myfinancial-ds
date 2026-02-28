import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { Target, CheckCircle2, AlertTriangle } from "lucide-react";

interface Props {
  data: BudgetData;
}

export function SavingsGoalCard({ data }: Props) {
  const { goals, totalTarget, totalActual, overallPct } = useMemo(() => {
    // Budget targets from savings category
    const savingsBudgets = data.expenses.savings;

    // Actual savings from transactions
    const actualByCategory: Record<string, number> = {};
    data.transactions
      .filter((t) => t.type === "เงินออม/การลงทุน")
      .forEach((t) => {
        actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount;
      });

    const goals = savingsBudgets.map((item) => {
      const actual = actualByCategory[item.label] || 0;
      const pct = item.budget > 0 ? Math.min((actual / item.budget) * 100, 100) : 0;
      return {
        label: item.label,
        target: item.budget,
        actual,
        pct,
        completed: actual >= item.budget && item.budget > 0,
      };
    }).filter((g) => g.target > 0);

    const totalTarget = goals.reduce((s, g) => s + g.target, 0);
    const totalActual = goals.reduce((s, g) => s + g.actual, 0);
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

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "520ms" }}>
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
          <Progress
            value={overallPct}
            className={`h-3 [&>div]:transition-all [&>div]:duration-700 ${
              overallPct >= 100
                ? "[&>div]:bg-income"
                : overallPct >= 50
                  ? "[&>div]:bg-amber-500"
                  : "[&>div]:bg-expense"
            }`}
          />
        </div>

        {/* Individual goals */}
        {goals.length > 0 ? (
          <div className="space-y-3 pt-1">
            {goals.map((g) => (
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
                  <Progress
                    value={g.pct}
                    className={`h-1.5 flex-1 ${
                      g.completed ? "[&>div]:bg-income" : "[&>div]:bg-primary"
                    }`}
                  />
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
