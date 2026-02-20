import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function ExpenseCategoryChart({ data }: Props) {
  const byCategory: Record<string, number> = {};
  data.transactions
    .filter((t) => t.type !== "รายรับ")
    .forEach((t) => {
      const key = t.category || "อื่นๆ";
      byCategory[key] = (byCategory[key] || 0) + t.amount;
    });

  const chartData = Object.entries(byCategory)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="border-none shadow-sm animate-fade-in col-span-1 lg:col-span-2" style={{ animationDelay: "520ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">รายละเอียดสัดส่วนค่าใช้จ่าย</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="h-52 sm:h-60 md:h-72 w-full md:w-1/2">
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
                  label={({ name, percent, x, y, textAnchor }) =>
                    percent > 0.05 ? (
                      <text x={x} y={y} textAnchor={textAnchor} fontSize={9} fill="currentColor">
                        {name} {(percent * 100).toFixed(0)}%
                      </text>
                    ) : null
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
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-muted-foreground truncate">{item.name}</span>
                  <span className="ml-auto font-medium font-display whitespace-nowrap">
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
