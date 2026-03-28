import { useState, useMemo } from "react";
import { EyeOff, Eye, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  data: BudgetData;
}

export function BudgetBreakdown({ data }: Props) {
  const [filter, setFilter] = useState<string>("ค่าใช้จ่าย");
  const [hideUnused, setHideUnused] = useState(true);

  const actualByCategory: Record<string, number> = {};
  data.transactions
    .filter((t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
    .forEach((t) => {
      actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount;
    });

  // Build category-to-type mapping from transactions
  const categoryType: Record<string, string> = {};
  data.transactions.forEach((t) => {
    if (!categoryType[t.category]) categoryType[t.category] = t.type;
  });

  const groups = ["รายรับ", "ค่าใช้จ่าย", "หนี้สิน", "เงินออม/การลงทุน", "บิล/สาธารณูปโภค", "ค่าสมาชิกรายเดือน"];

  const allBudgets = useMemo(
    () =>
      [
        ...data.income,
        ...data.expenses.general,
        ...data.expenses.bills,
        ...data.expenses.debts,
        ...data.expenses.subscriptions,
        ...data.expenses.savings,
      ],
    [data.income, data.expenses]
  );

  // Build label-to-type mapping from budget structure
  const labelType: Record<string, string> = {};
  data.income.forEach((item) => { labelType[item.label] = "รายรับ"; });
  data.expenses.general.forEach((item) => { labelType[item.label] = "ค่าใช้จ่าย"; });
  data.expenses.bills.forEach((item) => { labelType[item.label] = "บิล/สาธารณูปโภค"; });
  data.expenses.debts.forEach((item) => { labelType[item.label] = "หนี้สิน"; });
  data.expenses.subscriptions.forEach((item) => { labelType[item.label] = "ค่าสมาชิกรายเดือน"; });
  data.expenses.savings.forEach((item) => { labelType[item.label] = "เงินออม/การลงทุน"; });

  const baseFiltered = filter === "all"
    ? allBudgets
    : allBudgets.filter((b) => labelType[b.label] === filter);

  const filtered = hideUnused
    ? baseFiltered.filter((b) => (actualByCategory[b.label] || 0) > 0)
    : baseFiltered;

  const totalActual = filtered.reduce((sum, item) => sum + (actualByCategory[item.label] || 0), 0);
  const totalBudget = filtered.reduce((sum, item) => sum + item.budget, 0);

  // Budget alerts: items over 80% or 100%
  const alerts = useMemo(() => {
    return allBudgets
      .filter((b) => {
        const actual = actualByCategory[b.label] || 0;
        return b.budget > 0 && actual >= b.budget * 0.8;
      })
      .map((b) => {
        const actual = actualByCategory[b.label] || 0;
        const pct = Math.round((actual / b.budget) * 100);
        return { label: b.label, actual, budget: b.budget, pct, over: actual > b.budget };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [allBudgets, actualByCategory]);

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "640ms" }}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-base font-semibold">ติดตามงบประมาณ</CardTitle>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHideUnused((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border bg-background"
            title={hideUnused ? "แสดงทั้งหมด" : "ซ่อนรายการที่ยังไม่มีการใช้"}
          >
            {hideUnused ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {hideUnused ? "แสดงทั้งหมด" : "ซ่อนว่าง"}
          </button>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="ทั้งหมด" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทั้งหมด</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overspending alert banner */}
        {alerts.length > 0 && (
          <div className={cn(
            "rounded-lg p-3 space-y-1.5",
            alerts.some((a) => a.over)
              ? "bg-destructive/10 border border-destructive/20"
              : "bg-amber-500/10 border border-amber-500/20"
          )}>
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle className={cn("h-3.5 w-3.5", alerts.some((a) => a.over) ? "text-destructive" : "text-amber-500")} />
              <span className={alerts.some((a) => a.over) ? "text-destructive" : "text-amber-500"}>
                {alerts.filter((a) => a.over).length > 0
                  ? `${alerts.filter((a) => a.over).length} หมวดเกินงบ`
                  : `${alerts.length} หมวดใกล้เต็มงบ`}
              </span>
            </div>
            {alerts.slice(0, 3).map((a) => (
              <div key={a.label} className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground truncate">{a.label}</span>
                <span className={cn("font-medium", a.over ? "text-destructive" : "text-amber-500")}>
                  {a.pct}%
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 px-1">
          <span>ใช้จริงรวม: <span className="font-semibold text-foreground">{formatCurrency(totalActual)}</span></span>
          <span>งบรวม: <span className="font-semibold text-foreground">{formatCurrency(totalBudget)}</span></span>
        </div>
        {filtered.map((item) => {
          const actual = actualByCategory[item.label] || 0;
          const rawPct = item.budget > 0 ? (actual / item.budget) * 100 : 0;
          const pct = Math.min(rawPct, 100);
          const over = actual > item.budget;
          const nearLimit = rawPct >= 80 && !over;

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="truncate mr-2 flex items-center gap-1">
                  {over && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                  {nearLimit && <TrendingUp className="h-3 w-3 text-amber-500 shrink-0" />}
                  {item.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {(over || nearLimit) && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      over ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-500"
                    )}>
                      {Math.round(rawPct)}%
                    </span>
                  )}
                  <span className={`font-display text-xs ${over ? "text-expense font-semibold" : "text-muted-foreground"}`}>
                    {formatCurrency(actual)} / {formatCurrency(item.budget)}
                  </span>
                </span>
              </div>
              <Progress
                value={pct}
                className={`h-2 ${over ? "[&>div]:bg-expense" : nearLimit ? "[&>div]:bg-amber-500" : "[&>div]:bg-income"}`}
              />
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">ไม่มีข้อมูลในหมวดนี้</p>
        )}
      </CardContent>
    </Card>
  );
}
