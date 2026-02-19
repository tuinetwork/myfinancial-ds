import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";

interface Props {
  data: BudgetData;
}

export function BudgetBreakdown({ data }: Props) {
  const actualByCategory: Record<string, number> = {};
  data.transactions.forEach((t) => {
    actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount;
  });

  const allBudgets = [
    ...data.expenses.general,
    ...data.expenses.bills,
    ...data.expenses.subscriptions,
  ].filter((b) => b.budget > 0);

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "640ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">ติดตามงบประมาณ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {allBudgets.map((item) => {
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
      </CardContent>
    </Card>
  );
}
