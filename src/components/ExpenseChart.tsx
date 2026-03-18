import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetData } from "@/hooks/useBudgetData";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const CATEGORY_MAP: Record<string, { label: string; key: keyof BudgetData["expenses"] }> = {
  general: { label: "ค่าใช้จ่าย", key: "general" },
  bills: { label: "บิล/สาธารณูปโภค", key: "bills" },
  debts: { label: "หนี้สิน", key: "debts" },
  subscriptions: { label: "ค่าสมาชิกรายเดือน", key: "subscriptions" },
  savings: { label: "เงินออม/การลงทุน", key: "savings" },
};

export function ExpenseChart({ data }: Props) {
  const [selectedCategory, setSelectedCategory] = useState("general");

  const chartData = useMemo(() => {
    const actualByCategory: Record<string, number> = {};
    data.transactions
      .filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
      .forEach((t) => {
        actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount;
      });

    const cat = CATEGORY_MAP[selectedCategory];
    const budgetItems = cat ? data.expenses[cat.key] : [];

    return budgetItems
      .filter((item) => item.budget > 0 || (actualByCategory[item.label] || 0) > 0)
      .map((item) => {
        const actual = actualByCategory[item.label] || 0;
        return {
          name: item.label,
          "งบประมาณ": item.budget,
          "ใช้จริง": actual,
          overBudget: actual > item.budget && item.budget > 0,
        };
      });
  }, [data, selectedCategory]);

  const formatValue = (v: number) => {
    if (v >= 1000) return `${(v / 1000).toFixed(2)}k`;
    return v.toFixed(2);
  };

  const renderSmartLabel = (props: any) => {
    const { x, y, width, height, value } = props;
    const text = formatValue(value);
    const textWidth = text.length * 6.5;
    const isInside = width > textWidth + 8;
    return (
      <text
        x={isInside ? x + width - 5 : x + width + 4}
        y={y + height / 2}
        dy={4}
        textAnchor={isInside ? "end" : "start"}
        fill={isInside ? "white" : "hsl(220 10% 40%)"}
        fontSize={10}
        fontWeight={600}
      >
        {text}
      </text>
    );
  };

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "400ms" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold">งบประมาณ vs ใช้จริง</CardTitle>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-44 h-8 text-xs bg-card border-border shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-card border-border shadow-lg z-50">
              {Object.entries(CATEGORY_MAP).map(([key, { label }]) => (
                <SelectItem key={key} value={key} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {chartData.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-muted-foreground">ไม่มีข้อมูลในหมวดหมู่นี้</p>
          </div>
        ) : (
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
                <Legend
                  wrapperStyle={{ fontSize: "11px" }}
                  payload={[
                    { value: "งบประมาณ", type: "square", color: "hsl(199 89% 48%)" },
                    { value: "ใช้จริง", type: "square", color: "hsl(166 72% 56%)" },
                    { value: "เกินงบ", type: "square", color: "hsl(0 72% 51%)" },
                  ]}
                />
                <Bar dataKey="งบประมาณ" fill="hsl(199 89% 48%)" radius={[0, 4, 4, 0]} barSize={14}>
                  <LabelList dataKey="งบประมาณ" content={renderSmartLabel} />
                </Bar>
                <Bar dataKey="ใช้จริง" radius={[0, 4, 4, 0]} barSize={14}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.overBudget ? "hsl(0 72% 51%)" : "hsl(166 72% 56%)"}
                    />
                  ))}
                  <LabelList dataKey="ใช้จริง" content={renderSmartLabel} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
