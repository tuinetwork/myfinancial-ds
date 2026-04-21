import { useState, useMemo } from "react";
import { EyeOff, Eye, AlertTriangle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetData, BudgetItem, formatCurrency } from "@/hooks/useBudgetData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { expandRecurrence } from "@/lib/recurrence";

interface Props {
  data: BudgetData;
}

/** Get effective monthly budget: multiply per-occurrence amount by occurrences in the month */
function getMonthlyBudget(item: BudgetItem, period: string): number {
  if (!item.recurrence || !item.dueDate) return item.budget;
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return item.budget;
  const occurrences = expandRecurrence(item.dueDate, item.recurrence, y, m, item.startDate, item.endDate).length;
  return occurrences > 0 ? item.budget * occurrences : item.budget;
}

// Built-in main category names (from Firestore expense_budgets keys)
const BUILTIN_EXPENSE_MAIN_CATS = [
  "ค่าใช้จ่ายทั่วไป",
  "บิลและสาธารณูปโภค",
  "หนี้สิน",
  "ค่าสมาชิกรายเดือน",
  "เงินออมและการลงทุน",
];

// Display label override for built-in groups (matches existing UX language)
const MAIN_CAT_DISPLAY: Record<string, string> = {
  "ค่าใช้จ่ายทั่วไป": "ค่าใช้จ่าย",
  "บิลและสาธารณูปโภค": "บิล/สาธารณูปโภค",
  "เงินออมและการลงทุน": "เงินออม/การลงทุน",
};

export function BudgetBreakdown({ data }: Props) {
  const [filter, setFilter] = useState<string>("ค่าใช้จ่ายทั่วไป");
  const [hideUnused, setHideUnused] = useState(true);

  const actualByCategory: Record<string, number> = {};
  data.transactions
    .filter((t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
    .forEach((t) => {
      actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount;
    });

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

  // Build dynamic filter options: income + every main category present in budget data
  const filterOptions = useMemo(() => {
    const present = new Set<string>();
    allBudgets.forEach((b) => {
      if (b.mainCategory) present.add(b.mainCategory);
    });
    // Built-ins first (in canonical order), then any custom mainCategory the user added
    const ordered: string[] = [];
    BUILTIN_EXPENSE_MAIN_CATS.forEach((c) => {
      if (present.has(c)) ordered.push(c);
    });
    Array.from(present)
      .filter((c) => !BUILTIN_EXPENSE_MAIN_CATS.includes(c))
      .sort((a, b) => a.localeCompare(b, "th"))
      .forEach((c) => ordered.push(c));
    return ordered;
  }, [allBudgets]);

  // Income labels (used for filter "รายรับ" + alert exclusion)
  const incomeLabels = useMemo(() => new Set(data.income.map((i) => i.label)), [data.income]);

  const baseFiltered = useMemo(() => {
    if (filter === "all") return allBudgets;
    if (filter === "รายรับ") return allBudgets.filter((b) => incomeLabels.has(b.label));
    return allBudgets.filter((b) => b.mainCategory === filter);
  }, [filter, allBudgets, incomeLabels]);

  const filtered = hideUnused
    ? baseFiltered.filter((b) => (actualByCategory[b.label] || 0) > 0)
    : baseFiltered;

  const totalActual = filtered.reduce((sum, item) => sum + (actualByCategory[item.label] || 0), 0);
  const totalBudget = filtered.reduce((sum, item) => sum + getMonthlyBudget(item, data.period), 0);

  // Budget alerts: items over 80% or 100% (exclude income — income over budget is good)

  const alerts = useMemo(() => {
    return allBudgets
      .filter((b) => {
        if (incomeLabels.has(b.label)) return false; // skip income
        const actual = actualByCategory[b.label] || 0;
        const monthly = getMonthlyBudget(b, data.period);
        return monthly > 0 && actual >= monthly * 0.8;
      })
      .map((b) => {
        const actual = actualByCategory[b.label] || 0;
        const monthly = getMonthlyBudget(b, data.period);
        const pct = Math.round((actual / monthly) * 100);
        return { label: b.label, actual, budget: monthly, pct, over: actual > monthly };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [allBudgets, actualByCategory, data.period]);

  return (
    <Card className="border-none shadow-sm animate-fade-in h-full" style={{ animationDelay: "640ms" }}>
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
              {data.income.length > 0 && <SelectItem value="รายรับ">รายรับ</SelectItem>}
              {filterOptions.map((g) => (
                <SelectItem key={g} value={g}>
                  {MAIN_CAT_DISPLAY[g] ?? g}
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
          const monthly = getMonthlyBudget(item, data.period);
          const rawPct = monthly > 0 ? (actual / monthly) * 100 : 0;
          const pct = Math.min(rawPct, 100);
          const over = actual > monthly;
          const nearLimit = rawPct >= 80 && !over;
          const isIncome = incomeLabels.has(item.label);

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="truncate mr-2 flex items-center gap-1">
                  {over && !isIncome && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                  {over && isIncome && <TrendingUp className="h-3 w-3 text-accent shrink-0" />}
                  {nearLimit && !isIncome && <TrendingUp className="h-3 w-3 text-amber-500 shrink-0" />}
                  {item.label}
                </span>
                <span className="flex items-center gap-1.5">
                  {(over || nearLimit) && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      isIncome
                        ? "bg-accent/10 text-accent"
                        : over ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-500"
                    )}>
                      {Math.round(rawPct)}%
                    </span>
                  )}
                  <span className={cn(
                    "font-display text-xs",
                    isIncome && over ? "text-accent font-semibold"
                      : over ? "text-expense font-semibold"
                      : "text-muted-foreground"
                  )}>
                    {formatCurrency(actual)} / {formatCurrency(monthly)}
                  </span>
                </span>
              </div>
              <Progress
                value={pct}
                className={cn("h-2",
                  isIncome ? "[&>div]:bg-income"
                    : over ? "[&>div]:bg-expense"
                    : nearLimit ? "[&>div]:bg-amber-500"
                    : "[&>div]:bg-income"
                )}
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
