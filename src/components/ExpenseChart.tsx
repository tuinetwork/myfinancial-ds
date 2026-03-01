import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetData } from "@/hooks/useBudgetData";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  LabelList,
} from "recharts";

interface Props {
  data: BudgetData;
}

export function ExpenseChart({ data }: Props) {
  const actualByCategory: Record<string, number> = {};
  data.transactions
    .filter((t) => t.type === "ค่าใช้จ่าย")
    .forEach((t) => {
      actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount;
    });

  const chartData = data.expenses.general
    .filter((item) => item.budget > 0 || (actualByCategory[item.label] || 0) > 0)
    .map((item) => ({
      name: item.label,
      "งบประมาณ": item.budget,
      "ใช้จริง": actualByCategory[item.label] || 0,
    }));

  const formatValue = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
    return String(v);
  };

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "400ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">งบประมาณ vs ใช้จริง</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div style={{ height: Math.max(200, chartData.length * 50 + 40) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 40, left: 5, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 90%)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => formatValue(v)}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={0}
                tick={false}
              />
              <Tooltip
                formatter={(value: number) =>
                  new Intl.NumberFormat("th-TH").format(value) + " ฿"
                }
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                  fontSize: "12px",
                }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="งบประมาณ" fill="hsl(199 89% 48%)" radius={[0, 4, 4, 0]} barSize={14}>
                <LabelList
                  dataKey="งบประมาณ"
                  position="insideRight"
                  formatter={(v: number) => formatValue(v)}
                  style={{ fill: "white", fontSize: 10, fontWeight: 600 }}
                />
              </Bar>
              <Bar dataKey="ใช้จริง" fill="hsl(166 72% 56%)" radius={[0, 4, 4, 0]} barSize={14}>
                <LabelList
                  dataKey="ใช้จริง"
                  position="insideRight"
                  formatter={(v: number) => formatValue(v)}
                  style={{ fill: "white", fontSize: 10, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
