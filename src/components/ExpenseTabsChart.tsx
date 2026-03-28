import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  data: BudgetData;
}

const COLORS = [
  "hsl(217 72% 50%)",
  "hsl(160 60% 45%)",
  "hsl(35 90% 55%)",
  "hsl(0 72% 55%)",
  "hsl(280 60% 55%)",
  "hsl(190 70% 50%)",
  "hsl(45 80% 50%)",
  "hsl(320 60% 50%)",
  "hsl(120 50% 45%)",
  "hsl(10 80% 55%)",
  "hsl(250 55% 55%)",
  "hsl(170 60% 40%)",
];

const ALL_TYPES = "__all__";

export function ExpenseTabsChart({ data }: Props) {
  const [selectedType, setSelectedType] = useState<string>(ALL_TYPES);

  const expenseTransactions = useMemo(
    () => data.transactions.filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี"),
    [data.transactions]
  );

  const types = useMemo(
    () => Array.from(new Set(expenseTransactions.map((t) => t.type))).filter((t) => t !== "").sort((a, b) => a.localeCompare(b, "th")),
    [expenseTransactions]
  );

  const chartData = useMemo(() => {
    if (selectedType === ALL_TYPES) {
      // Group by type
      const byType: Record<string, number> = {};
      expenseTransactions.forEach((t) => {
        byType[t.type] = (byType[t.type] || 0) + t.amount;
      });
      return Object.entries(byType)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    } else {
      // Group by category within selected type
      const byCategory: Record<string, number> = {};
      expenseTransactions
        .filter((t) => t.type === selectedType)
        .forEach((t) => {
          const key = t.category || "อื่นๆ";
          byCategory[key] = (byCategory[key] || 0) + t.amount;
        });
      return Object.entries(byCategory)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);
    }
  }, [expenseTransactions, selectedType]);

  const total = chartData.reduce((s, d) => s + d.value, 0);
  const showLabel = selectedType !== ALL_TYPES;
  const title = selectedType === ALL_TYPES
    ? "รายละเอียดสัดส่วน ทั้งหมด"
    : `รายละเอียดสัดส่วน ${selectedType}`;

  return (
    <Card className="border-none shadow-sm animate-fade-in h-full" style={{ animationDelay: "480ms" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm sm:text-base font-semibold truncate">{title}</CardTitle>
          <Select value={selectedType} onValueChange={setSelectedType}>
            <SelectTrigger className="w-36 sm:w-40 h-8 text-xs bg-card border-border shadow-sm">
              <SelectValue placeholder="เลือกประเภท" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border shadow-lg z-50">
              <SelectItem value={ALL_TYPES}>ทั้งหมด</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:w-1/2 h-52 sm:h-60 md:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="30%"
                  outerRadius="65%"
                  dataKey="value"
                  stroke="none"
                  label={
                    showLabel
                      ? ({ name, percent, x, y, textAnchor }) =>
                          percent > 0.05 ? (
                            <text x={x} y={y} textAnchor={textAnchor} fontSize={9} fill="currentColor">
                              {name} {(percent * 100).toFixed(0)}%
                            </text>
                          ) : null
                      : undefined
                  }
                  labelLine={false}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                    fontSize: "12px",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 w-full space-y-1.5 max-h-60 md:max-h-72 overflow-y-auto">
            {chartData.map((item, i) => {
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
              return (
                <div key={item.name} className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <div
                    className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-muted-foreground truncate min-w-0">{item.name}</span>
                  <span className="ml-auto font-medium font-display whitespace-nowrap text-xs sm:text-sm">
                    {formatCurrency(item.value)}
                  </span>
                  <span className="text-[11px] sm:text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
