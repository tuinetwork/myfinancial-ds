import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  data: BudgetData;
}

export function BudgetBreakdown({ data }: Props) {
  const [filter, setFilter] = useState<string>("all");

  const actualByCategory: Record<string, number> = {};
  data.transactions.forEach((t) => {
    actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount;
  });

  const allBudgets = useMemo(
    () =>
      [
        ...data.expenses.general.map((b) => ({ ...b, group: "ทั่วไป" })),
        ...data.expenses.bills.map((b) => ({ ...b, group: "บิล" })),
        ...data.expenses.subscriptions.map((b) => ({ ...b, group: "สมัครสมาชิก" })),
      ].filter((b) => b.budget > 0),
    [data.expenses]
  );

  const groups = useMemo(() => {
    const set = new Set(allBudgets.map((b) => b.group));
    return Array.from(set);
  }, [allBudgets]);

  const filtered = filter === "all" ? allBudgets : allBudgets.filter((b) => b.group === filter);

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "640ms" }}>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold">ติดตามงบประมาณ</CardTitle>
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
      </CardHeader>
      <CardContent className="space-y-4">
        {filtered.map((item) => {
          const actual = actualByCategory[item.label] || 0;
          const pct = Math.min((actual / item.budget) * 100, 100);
          const over = actual > item.budget;

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="truncate mr-2">{item.label}</span>
                <span className={`font-display text-xs ${over ? "text-expense font-semibold" : "text-muted-foreground"}`}>
                  {formatCurrency(actual)} / {formatCurrency(item.budget)}
                </span>
              </div>
              <Progress
                value={pct}
                className={`h-2 ${over ? "[&>div]:bg-expense" : "[&>div]:bg-income"}`}
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
