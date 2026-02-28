import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { ArrowUpRight, ArrowDownRight, Clock } from "lucide-react";

interface Props {
  data: BudgetData;
}

export function RecentTransactions({ data }: Props) {
  const recent = useMemo(() => {
    return [...data.transactions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 7);
  }, [data.transactions]);

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split("-");
    const day = parseInt(parts[parts.length - 1] || "0", 10);
    const month = parts.length >= 2 ? parseInt(parts[parts.length - 2], 10) : 0;
    const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${day} ${thaiMonths[month - 1] || ""}`;
  };

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "480ms" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base font-semibold">รายการล่าสุด</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีรายการ</p>
        ) : (
          recent.map((t, i) => {
            const isIncome = t.type === "รายรับ";
            return (
              <div
                key={`${t.date}-${t.category}-${i}`}
                className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0"
              >
                <div className={`shrink-0 p-1.5 rounded-lg ${isIncome ? "bg-income/10" : "bg-expense/10"}`}>
                  {isIncome ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-income" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 text-expense" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.category}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                </div>
                <span className={`text-sm font-semibold font-display tabular-nums ${isIncome ? "text-income" : "text-expense"}`}>
                  {isIncome ? "+" : "-"}{formatCurrency(t.amount)}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
