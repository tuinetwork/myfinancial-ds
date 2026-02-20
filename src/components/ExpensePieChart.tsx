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
];

export function ExpensePieChart({ data }: Props) {
  const byType: Record<string, number> = {};
  data.transactions
    .filter((t) => t.type !== "รายรับ")
    .forEach((t) => {
      const key = t.type;
      byType[key] = (byType[key] || 0) + t.amount;
    });

  const chartData = Object.entries(byType)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "480ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">สัดส่วนรายจ่าย</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:w-1/2 h-48 sm:h-56 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="35%"
                  outerRadius="70%"
                  dataKey="value"
                  stroke="none"
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
          <div className="flex-1 w-full space-y-1.5">
            {chartData.map((item, i) => (
              <div key={item.name} className="flex items-center gap-2 text-xs sm:text-sm">
                <div
                  className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="text-muted-foreground truncate">{item.name}</span>
                <span className="ml-auto font-medium font-display">{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
