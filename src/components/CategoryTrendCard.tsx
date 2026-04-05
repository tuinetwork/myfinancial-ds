import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface Props {
  data: BudgetData;
  previousData: BudgetData;
}

function buildCatMap(data: BudgetData): Record<string, number> {
  const map: Record<string, number> = {};
  data.transactions
    .filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
    .forEach((t) => { map[t.category] = (map[t.category] || 0) + t.amount; });
  return map;
}

export function CategoryTrendCard({ data, previousData }: Props) {
  const trends = useMemo(() => {
    const curr = buildCatMap(data);
    const prev = buildCatMap(previousData);
    const allCats = new Set([...Object.keys(curr), ...Object.keys(prev)]);

    return Array.from(allCats)
      .map((name) => {
        const current = curr[name] ?? 0;
        const previous = prev[name] ?? 0;
        const diff = current - previous;
        const pct = previous > 0 ? Math.round((diff / previous) * 100) : current > 0 ? 100 : 0;
        return { name, current, previous, diff, pct };
      })
      .filter((t) => t.current > 0 || t.previous > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
      .slice(0, 8);
  }, [data.transactions, previousData.transactions]);

  if (trends.length === 0) return null;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          เทรนด์รายจ่ายตามหมวดหมู่
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {trends.map((t) => (
            <div key={t.name} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {t.diff > 0 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-destructive shrink-0" />
                ) : t.diff < 0 ? (
                  <TrendingDown className="h-3.5 w-3.5 text-accent shrink-0" />
                ) : (
                  <Minus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                <span className="text-sm truncate">{t.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground tabular-nums">{formatCurrency(t.current)}</span>
                <span className={`text-xs font-semibold tabular-nums w-14 text-right ${t.diff > 0 ? "text-destructive" : t.diff < 0 ? "text-accent" : "text-muted-foreground"}`}>
                  {t.diff > 0 ? "+" : ""}{t.pct}%
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">เปรียบเทียบกับเดือนก่อน · เรียงตามการเปลี่ยนแปลงมากสุด</p>
      </CardContent>
    </Card>
  );
}
