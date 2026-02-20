import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

type ViewTab = "type" | "category";

export function ExpenseTabsChart({ data }: Props) {
  const [tab, setTab] = useState<ViewTab>("type");

  // Group by type
  const byType: Record<string, number> = {};
  data.transactions
    .filter((t) => t.type !== "รายรับ")
    .forEach((t) => {
      byType[t.type] = (byType[t.type] || 0) + t.amount;
    });
  const typeData = Object.entries(byType)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Group by category
  const byCategory: Record<string, number> = {};
  data.transactions
    .filter((t) => t.type !== "รายรับ")
    .forEach((t) => {
      const key = t.category || "อื่นๆ";
      byCategory[key] = (byCategory[key] || 0) + t.amount;
    });
  const categoryData = Object.entries(byCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const chartData = tab === "type" ? typeData : categoryData;
  const total = chartData.reduce((s, d) => s + d.value, 0);
  const showLabel = tab === "category";

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "480ms" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-semibold">สัดส่วนรายจ่าย</CardTitle>
          <Tabs value={tab} onValueChange={(v) => setTab(v as ViewTab)}>
            <TabsList className="h-8">
              <TabsTrigger value="type" className="text-xs px-3 py-1">ตามประเภท</TabsTrigger>
              <TabsTrigger value="category" className="text-xs px-3 py-1">ตามหมวดหมู่</TabsTrigger>
            </TabsList>
          </Tabs>
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
                <div key={item.name} className="flex items-center gap-1.5 text-[11px] sm:text-xs">
                  <div
                    className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-muted-foreground truncate min-w-0">{item.name}</span>
                  <span className="ml-auto font-medium font-display whitespace-nowrap text-[10px] sm:text-xs">
                    {formatCurrency(item.value)}
                  </span>
                  <span className="text-[10px] text-muted-foreground w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
