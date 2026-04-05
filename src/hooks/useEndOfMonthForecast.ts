import { useMemo } from "react";
import { BudgetData } from "./useBudgetData";

export interface ForecastResult {
  projectedBalance: number;
  dailyBurnRate: number;
  remainingDays: number;
  elapsedDays: number;
  totalDays: number;
  actualExpense: number;
  actualIncome: number;
  confidence: "high" | "medium" | "low";
  isCurrentMonth: boolean;
}

export function useEndOfMonthForecast(data: BudgetData | undefined, carryOver: number): ForecastResult | null {
  return useMemo(() => {
    if (!data?.period) return null;

    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const isCurrentMonth = data.period === currentPeriod;

    const [yearStr, monthStr] = data.period.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const totalDays = new Date(year, month, 0).getDate();

    const todayDay = isCurrentMonth ? now.getDate() : totalDays;
    const elapsedDays = Math.max(todayDay, 1);
    const remainingDays = isCurrentMonth ? totalDays - todayDay : 0;

    const activeTransactions = data.transactions.filter(
      (t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี"
    );

    const actualIncome = activeTransactions
      .filter((t) => t.type === "รายรับ")
      .reduce((s, t) => s + t.amount, 0) + carryOver;

    const actualExpense = activeTransactions
      .filter((t) => t.type !== "รายรับ")
      .reduce((s, t) => s + t.amount, 0);

    const dailyBurnRate = elapsedDays > 0 ? actualExpense / elapsedDays : 0;
    const projectedAdditionalExpense = remainingDays * dailyBurnRate;
    const projectedBalance = actualIncome - (actualExpense + projectedAdditionalExpense);

    const confidence: "high" | "medium" | "low" =
      elapsedDays >= 15 ? "high" : elapsedDays >= 7 ? "medium" : "low";

    return {
      projectedBalance,
      dailyBurnRate,
      remainingDays,
      elapsedDays,
      totalDays,
      actualExpense,
      actualIncome,
      confidence,
      isCurrentMonth,
    };
  }, [data, carryOver]);
}
