import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  data: BudgetData;
  previousData?: BudgetData;
}

const BAR_COLORS = [
  "bg-[hsl(225,75%,57%)]",
  "bg-[hsl(180,70%,50%)]",
  "bg-[hsl(280,60%,55%)]",
  "bg-[hsl(35,85%,55%)]",
  "bg-[hsl(340,65%,55%)]",
];

function buildCatMap(data: BudgetData): Record<string, number> {
  const catMap: Record<string, number> = {};
  data.transactions
    .filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
    .forEach((t) => {
      catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });
  return catMap;
}

export function TopSpendingCategories({ data, previousData }: Props) {
  const topCategories = useMemo(() => {
    const catMap = buildCatMap(data);
    const prevMap = previousData ? buildCatMap(previousData) : {};

    return Object.entries(catMap)
      .map(([name, amount]) => ({
        name,
        amount,
        prevAmount: prevMap[name] ?? 0,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [data.transactions, previousData?.transactions]);

  const maxAmount = topCategories[0]?.amount || 1;

  return (
    <Card className="border-none shadow-sm animate-fade-in h-full" style={{ animationDelay: "560ms" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">Top 5 รายจ่าย</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {topCategories.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีข้อมูล</p>
        ) : (
          topCategories.map((cat, i) => {
            const pct = (cat.amount / maxAmount) * 100;
            const hasPrev = previousData && cat.prevAmount > 0;
            const diff = cat.amount - cat.prevAmount;
            const diffPct = cat.prevAmount > 0 ? Math.round((diff / cat.prevAmount) * 100) : null;

            return (
              <div key={cat.name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm truncate">{cat.name}</span>
                    {hasPrev && diffPct !== null && (
                      <span className={`flex items-center gap-0.5 text-[10px] font-medium shrink-0 ${diff > 0 ? "text-destructive" : diff < 0 ? "text-accent" : "text-muted-foreground"}`}>
                        {diff > 0 ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                        {diff > 0 ? "+" : ""}{diffPct}%
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold font-display text-muted-foreground tabular-nums ml-2 shrink-0">
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
