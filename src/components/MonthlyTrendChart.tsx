import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/hooks/useBudgetData";
import { YearlyData } from "@/hooks/useYearlyData";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Props {
  yearlyData: YearlyData;
}

export function MonthlyTrendChart({ yearlyData }: Props) {
  const chartData = yearlyData.months.map(({ month, data }) => {
    const income = data.transactions
      .filter((t) => t.type === "รายรับ")
      .reduce((s, t) => s + t.amount, 0);
    const expense = data.transactions
      .filter((t) => t.type !== "รายรับ")
      .reduce((s, t) => s + t.amount, 0);
    return { month, "รายรับ": income, "รายจ่าย": expense };
  });

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "200ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">แนวโน้มรายเดือน</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="h-52 sm:h-64 md:h-72 lg:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                width={35}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  backgroundColor: "hsl(var(--card))",
                  color: "hsl(var(--card-foreground))",
                  fontSize: "12px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="รายรับ" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="รายจ่าย" fill="hsl(var(--expense))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
