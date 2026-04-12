import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { BudgetData, BudgetItem, Transaction } from "./useBudgetData";
import { useAuth } from "@/contexts/AuthContext";
import { expandRecurrence } from "@/lib/recurrence";

import { THAI_MONTHS, EXPENSE_CATEGORY_MAP, MAIN_CATEGORY_TYPE_MAP } from "@/lib/constants";

function mapTransaction(docId: string, docData: Record<string, unknown>): Transaction {
  const type = docData.type as string;
  const mainCategory = (docData.main_category as string) ?? "";
  let mappedType: string;
  if (type === "income") {
    mappedType = "รายรับ";
  } else if (type === "transfer") {
    mappedType = "โอน";
  } else {
    mappedType = MAIN_CATEGORY_TYPE_MAP[mainCategory] ?? "ค่าใช้จ่าย";
  }
  return {
    id: docId,
    date: (docData.date as string) ?? "",
    amount: (docData.amount as number) ?? 0,
    type: mappedType,
    category: (docData.sub_category as string) ?? "",
    description: (docData.note as string) ?? "",
    created_at: (docData.created_at as number) || undefined,
  };
}

export interface YearlyData {
  year: string;
  months: { month: string; data: BudgetData }[];
  aggregated: BudgetData;
}

function parseBudgetDocForYear(budgetDoc: any, period: string, transactions: Transaction[]): BudgetData {
  const data = budgetDoc;
  const [, monthNum] = period.split("-");
  const monthIdx = parseInt(monthNum, 10) - 1;
  const monthName = THAI_MONTHS[monthIdx] ?? period;

  const incomeEstimates = (data.income_estimates ?? {}) as Record<string, Record<string, number> | number>;
  const income: BudgetItem[] = [];
  for (const [key, val] of Object.entries(incomeEstimates)) {
    if (typeof val === "number") {
      income.push({ label: key, budget: val });
    } else if (typeof val === "object") {
      for (const [subLabel, subVal] of Object.entries(val)) {
        income.push({ label: subLabel, budget: subVal });
      }
    }
  }

  const expenseBudgets = (data.expense_budgets ?? {}) as Record<string, Record<string, unknown>>;
  const expenses: BudgetData["expenses"] = {
    general: [], bills: [], debts: [], subscriptions: [], savings: [],
  };
  for (const [mainCat, subs] of Object.entries(expenseBudgets)) {
    const key = EXPENSE_CATEGORY_MAP[mainCat];
    if (key && subs && typeof subs === "object") {
      expenses[key] = Object.entries(subs).map(([label, val]) => {
        const budget = typeof val === "number" ? val : (val as any)?.amount ?? 0;
        const dueDate = typeof val === "object" && val !== null ? (val as any)?.due_date ?? null : null;
        const recurrence = typeof val === "object" && val !== null ? (val as any)?.recurrence ?? null : null;
        const startDate = typeof val === "object" && val !== null ? (val as any)?.start_date ?? null : null;
        const endDate = typeof val === "object" && val !== null ? (val as any)?.end_date ?? null : null;
        const paidDates = typeof val === "object" && val !== null ? (val as any)?.paid_dates ?? [] : [];
        return { label, budget, dueDate, recurrence, startDate, endDate, paidDates };
      });
    }
  }

  return {
    status: "ok",
    month: monthName,
    period,
    timestamp: new Date().toISOString(),
    income,
    expenses,
    transactions,
    carryOver: (data.carry_over as number) ?? 0,
  };
}

/** Get effective monthly budget by expanding recurrence occurrences */
function getExpandedBudget(item: BudgetItem, period: string): number {
  if (!item.recurrence || !item.dueDate) return item.budget;
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return item.budget;
  const occurrences = expandRecurrence(item.dueDate, item.recurrence, y, m, item.startDate, item.endDate).length;
  return occurrences > 0 ? item.budget * occurrences : item.budget;
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

  for (const { month, data } of monthsData) {
    allTransactions.push(...data.transactions);
    for (const item of data.income) {
      incomeMap[item.label] = (incomeMap[item.label] || 0) + item.budget;
    }
    for (const key of Object.keys(expenseGroups) as (keyof typeof expenseGroups)[]) {
      for (const item of data.expenses[key]) {
        const expanded = getExpandedBudget(item, month);
        expenseGroups[key][item.label] = (expenseGroups[key][item.label] || 0) + expanded;
      }
    }
  }

  const toBudgetItems = (map: Record<string, number>): BudgetItem[] =>
    Object.entries(map).map(([label, budget]) => ({ label, budget }));

  const aggregated: BudgetData = {
    status: "ok",
    month: `ปี ${year}`,
    period: year,
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
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  // Real-time listener for yearly data — scoped to selected year only
  useEffect(() => {
    if (!year || !userId) return;

    const periodStart = `${year}-01`;
    const periodEnd = `${year}-12`;

    // Budgets: filter by document ID range (period field = "YYYY-MM")
    const budgetsQ = query(
      collection(firestore, "users", userId, "budgets"),
      where("period", ">=", periodStart),
      where("period", "<=", periodEnd)
    );
    // Transactions: filter by month_year range
    const txQ = query(
      collection(firestore, "users", userId, "transactions"),
      where("month_year", ">=", periodStart),
      where("month_year", "<=", periodEnd)
    );

    const buildYearlyData = (budgetSnap: any, txSnap: any) => {
      if (budgetSnap.empty) return;

      const txByMonth: Record<string, Transaction[]> = {};
      txSnap.docs.forEach((d: any) => {
        const data = d.data();
        const monthYear = (data.month_year as string) ?? "";
        if (!txByMonth[monthYear]) txByMonth[monthYear] = [];
        txByMonth[monthYear].push(mapTransaction(d.id, data as Record<string, unknown>));
      });

      const monthsData = budgetSnap.docs.map((budgetDoc: any) => {
        const data = budgetDoc.data();
        const period = (data.period as string) ?? budgetDoc.id;
        return {
          month: period,
          data: parseBudgetDocForYear(data, period, txByMonth[period] ?? []),
        };
      });

      monthsData.sort((a: any, b: any) => a.month.localeCompare(b.month));
      queryClient.setQueryData(["yearly-data", year, userId], mergeMonths(year, monthsData));
    };

    let latestBudgetSnap: any = null;
    let latestTxSnap: any = null;

    const unsubBudgets = onSnapshot(budgetsQ, (snap) => {
      latestBudgetSnap = snap;
      if (latestTxSnap) buildYearlyData(snap, latestTxSnap);
    });

    const unsubTx = onSnapshot(txQ, (snap) => {
      latestTxSnap = snap;
      if (latestBudgetSnap) buildYearlyData(latestBudgetSnap, snap);
    });

    return () => {
      unsubBudgets();
      unsubTx();
    };
  }, [year, userId, queryClient]);

  return useQuery<YearlyData>({
    queryKey: ["yearly-data", year, userId],
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");

      const periodStart = `${year}-01`;
      const periodEnd = `${year}-12`;

      const budgetsQ = query(
        collection(firestore, "users", userId, "budgets"),
        where("period", ">=", periodStart),
        where("period", "<=", periodEnd)
      );
      const txQ = query(
        collection(firestore, "users", userId, "transactions"),
        where("month_year", ">=", periodStart),
        where("month_year", "<=", periodEnd)
      );

      const [budgetSnap, txSnap] = await Promise.all([getDocs(budgetsQ), getDocs(txQ)]);
      if (budgetSnap.empty) throw new Error("No data found");

      const txByMonth: Record<string, Transaction[]> = {};
      txSnap.forEach((d) => {
        const data = d.data();
        const monthYear = (data.month_year as string) ?? "";
        if (!txByMonth[monthYear]) txByMonth[monthYear] = [];
        txByMonth[monthYear].push(mapTransaction(d.id, data as Record<string, unknown>));
      });

      const monthsData = budgetSnap.docs.map((budgetDoc) => {
        const data = budgetDoc.data();
        const period = (data.period as string) ?? budgetDoc.id;
        return {
          month: period,
          data: parseBudgetDocForYear(data, period, txByMonth[period] ?? []),
        };
      });

      monthsData.sort((a, b) => a.month.localeCompare(b.month));
      return mergeMonths(year!, monthsData);
    },
    enabled: !!year && !!userId,
    staleTime: Infinity,
  });
}
