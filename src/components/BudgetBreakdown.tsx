import { useState, useMemo } from "react";
import { EyeOff, Eye } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

  return (
    <Card className="border-none shadow-argon animate-fade-in" style={{ animationDelay: "640ms" }}>
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
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3 px-1">
          <span>ใช้จริงรวม: <span className="font-semibold text-foreground">{formatCurrency(totalActual)}</span></span>
          <span>งบรวม: <span className="font-semibold text-foreground">{formatCurrency(totalBudget)}</span></span>
        </div>
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
