import { useState, useMemo } from "react";
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

type ViewMode = "daily" | "weekly" | "monthly";

interface Props {
  data: BudgetData;
}

export function DailyChart({ data }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>("daily");

  const chartData = useMemo(() => {
    const groupMap: Record<string, { income: number; expense: number; label: string }> = {};

    data.transactions.forEach((t) => {
      // --- เพิ่มเงื่อนไข: ข้าม (Skip) รายการที่เป็นการโอนเงิน ---
      if (t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี") {
        return; // ไม่ต้องนำมาคำนวณในกราฟ
      }

      let key: string;
      let label: string;
      const dateParts = t.date.includes("-") ? t.date.split("-") : [t.date];

      if (viewMode === "daily") {
        key = t.date;
        const dayNum = dateParts[dateParts.length - 1];
        label = `${parseInt(dayNum || t.date, 10)}`;
      } else if (viewMode === "weekly") {
        // Group by week number within the month
        const dayNum = parseInt(dateParts[dateParts.length - 1] || "1", 10);
        const weekNum = Math.ceil(dayNum / 7);
        key = `w${weekNum}`;
        label = `สัปดาห์ ${weekNum}`;
      } else {
        // Monthly - group all into one or by month if cross-month
        const monthNum = dateParts.length >= 2 ? dateParts[dateParts.length - 2] : "01";
        key = monthNum;
        label = `เดือน ${parseInt(monthNum, 10)}`;
      }

      if (!groupMap[key]) groupMap[key] = { income: 0, expense: 0, label };
      if (t.type === "รายรับ") {
        groupMap[key].income += t.amount;
      } else {
        groupMap[key].expense += t.amount;
      }
    });

    const sortedKeys = Object.keys(groupMap).sort((a, b) => a.localeCompare(b));

    let cumIncome = 0;
    let cumExpense = 0;

    return sortedKeys.map((key) => {
      cumIncome += groupMap[key].income;
      cumExpense += groupMap[key].expense;
      return {
        day: groupMap[key].label,
        "รายรับ": groupMap[key].income,
        "รายจ่าย": groupMap[key].expense,
        "รายรับสะสม": cumIncome,
        "รายจ่ายสะสม": cumExpense,
      };
    });
  }, [data.transactions, viewMode]);

  return (
    <Card className="border-none shadow-sm animate-fade-in h-full flex flex-col" style={{ animationDelay: "360ms" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">รายรับ-รายจ่ายรายวัน</CardTitle>
          <div className="flex border border-border rounded-md overflow-hidden">
            {([
              { key: "daily", label: "วัน" },
              { key: "weekly", label: "สัปดาห์" },
            ] as const).map((opt) => (
              <button
                key={opt.key}
                onClick={() => setViewMode(opt.key)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === opt.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6 flex-1">
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
