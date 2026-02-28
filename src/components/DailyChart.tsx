import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import {
  AreaChart,
  Area,
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

export function DailyChart({ data }: Props) {
  // Group transactions by date
  const dailyMap: Record<string, { income: number; expense: number }> = {};

  data.transactions.forEach((t) => {
    const day = t.date;
    if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 };
    if (t.type === "รายรับ") {
      dailyMap[day].income += t.amount;
    } else {
      dailyMap[day].expense += t.amount;
    }
  });

  const sortedDays = Object.keys(dailyMap).sort((a, b) => a.localeCompare(b));

  let cumIncome = 0;
  let cumExpense = 0;

  const chartData = sortedDays.map((day) => {
    cumIncome += dailyMap[day].income;
    cumExpense += dailyMap[day].expense;
    const dayNum = day.includes("-") ? day.split("-").pop() : day;
    return {
      day: `${parseInt(dayNum || day, 10)}`,
      "รายรับ": dailyMap[day].income,
      "รายจ่าย": dailyMap[day].expense,
      "รายรับสะสม": cumIncome,
      "รายจ่ายสะสม": cumExpense,
    };
  });

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "360ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">รายรับ-รายจ่ายรายวัน</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="h-52 sm:h-64 md:h-72 lg:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(160 60% 45%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(160 60% 45%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(0 72% 51%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(0 72% 51%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 90%)" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
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
              <Area
                type="monotone"
                dataKey="รายรับสะสม"
                stroke="hsl(160 60% 45%)"
                fill="url(#colorIncome)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="รายจ่ายสะสม"
                stroke="hsl(0 72% 51%)"
                fill="url(#colorExpense)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
