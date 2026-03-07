import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { ChartBarIcon as BarChart3 } from "@heroicons/react/24/outline";

interface Props {
  data: BudgetData;
}

const BAR_COLORS = [
  "bg-[hsl(225,75%,57%)]",
  "bg-[hsl(180,70%,50%)]",
  "bg-[hsl(280,60%,55%)]",
  "bg-[hsl(35,85%,55%)]",
  "bg-[hsl(340,65%,55%)]",
  "bg-[hsl(160,60%,45%)]",
];

export function TopSpendingCategories({ data }: Props) {
  const topCategories = useMemo(() => {
    const catMap: Record<string, number> = {};
    data.transactions
      .filter((t) => t.type !== "รายรับ")
      .forEach((t) => {
        catMap[t.category] = (catMap[t.category] || 0) + t.amount;
      });

    return Object.entries(catMap)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [data.transactions]);

  const maxAmount = topCategories[0]?.amount || 1;

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "560ms" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">รายจ่ายสูงสุด</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {topCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีข้อมูล</p>
        ) : (
          topCategories.map((cat, i) => {
            const pct = (cat.amount / maxAmount) * 100;
            return (
              <div key={cat.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm truncate mr-2">{cat.name}</span>
                  <span className="text-xs font-semibold font-display text-muted-foreground tabular-nums">
                    {formatCurrency(cat.amount)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${BAR_COLORS[i % BAR_COLORS.length]}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
