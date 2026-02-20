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
      name: item.label.length > 8 ? item.label.slice(0, 8) + "…" : item.label,
      "งบประมาณ": item.budget,
      "ใช้จริง": actualByCategory[item.label] || 0,
    }));

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "400ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">งบประมาณ vs ใช้จริง</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="h-52 sm:h-64 md:h-72 lg:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 90%)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10 }}
                angle={-30}
                textAnchor="end"
                height={50}
                interval={0}
              />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={35} />
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
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              <Bar dataKey="งบประมาณ" fill="hsl(217 72% 50%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="ใช้จริง" fill="hsl(160 60% 45%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
