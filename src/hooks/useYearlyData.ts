import { useQuery } from "@tanstack/react-query";
import { ref, get } from "firebase/database";
import { db } from "@/lib/firebase";
import { BudgetData, BudgetItem, Transaction } from "./useBudgetData";

function toArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") return Object.values(val) as T[];
  return [];
}

function normalizeBudgetData(raw: Record<string, unknown>): BudgetData {
  const expenses = (raw.expenses ?? {}) as Record<string, unknown>;
  return {
    status: (raw.status as string) ?? "",
    month: (raw.month as string) ?? "",
    timestamp: (raw.timestamp as string) ?? new Date().toISOString(),
    income: toArray<BudgetItem>(raw.income),
    expenses: {
      general: toArray<BudgetItem>(expenses.general),
      bills: toArray<BudgetItem>(expenses.bills),
      debts: toArray<BudgetItem>(expenses.debts),
      subscriptions: toArray<BudgetItem>(expenses.subscriptions),
      savings: toArray<BudgetItem>(expenses.savings),
    },
    transactions: toArray<Transaction>(raw.transactions),
  };
}

export interface YearlyData {
  year: string;
  months: { month: string; data: BudgetData }[];
  aggregated: BudgetData;
}

function mergeMonths(year: string, monthsData: { month: string; data: BudgetData }[]): YearlyData {
  const allTransactions: Transaction[] = [];
  const incomeMap: Record<string, number> = {};
  const expenseGroups = {
    general: {} as Record<string, number>,
    bills: {} as Record<string, number>,
    debts: {} as Record<string, number>,
    subscriptions: {} as Record<string, number>,
    savings: {} as Record<string, number>,
  };

  for (const { data } of monthsData) {
    allTransactions.push(...data.transactions);

    for (const item of data.income) {
      incomeMap[item.label] = (incomeMap[item.label] || 0) + item.budget;
    }
    for (const key of Object.keys(expenseGroups) as (keyof typeof expenseGroups)[]) {
      for (const item of data.expenses[key]) {
        expenseGroups[key][item.label] = (expenseGroups[key][item.label] || 0) + item.budget;
      }
    }
  }

  const toBudgetItems = (map: Record<string, number>): BudgetItem[] =>
    Object.entries(map).map(([label, budget]) => ({ label, budget }));

  const aggregated: BudgetData = {
    status: "ok",
    month: `ปี ${year}`,
    timestamp: new Date().toISOString(),
    income: toBudgetItems(incomeMap),
    expenses: {
      general: toBudgetItems(expenseGroups.general),
      bills: toBudgetItems(expenseGroups.bills),
      debts: toBudgetItems(expenseGroups.debts),
      subscriptions: toBudgetItems(expenseGroups.subscriptions),
      savings: toBudgetItems(expenseGroups.savings),
    },
    transactions: allTransactions,
  };

  return { year, months: monthsData, aggregated };
}

export function useYearlyData(year?: string) {
  return useQuery<YearlyData>({
    queryKey: ["yearly-data", year],
    queryFn: async () => {
      const snapshot = await get(ref(db, `history/${year}`));
      if (!snapshot.exists()) throw new Error("No data found");
      const raw = snapshot.val() as Record<string, Record<string, unknown>>;
      const monthsData = Object.entries(raw)
        .map(([month, val]) => ({ month, data: normalizeBudgetData(val) }))
        .sort((a, b) => a.month.localeCompare(b.month));
      return mergeMonths(year!, monthsData);
    },
    enabled: !!year,
    staleTime: 5 * 60 * 1000,
  });
}
