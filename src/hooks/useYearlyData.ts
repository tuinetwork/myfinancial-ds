import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { BudgetData, BudgetItem, Transaction } from "./useBudgetData";
import { useAuth } from "@/contexts/AuthContext";

const EXPENSE_CATEGORY_MAP: Record<string, keyof BudgetData["expenses"]> = {
  "ค่าใช้จ่ายทั่วไป": "general",
  "บิลและสาธารณูปโภค": "bills",
  "หนี้สิน": "debts",
  "ค่าสมาชิกรายเดือน": "subscriptions",
  "เงินออมและการลงทุน": "savings",
};

const MAIN_CATEGORY_TYPE_MAP: Record<string, string> = {
  "ค่าใช้จ่ายทั่วไป": "ค่าใช้จ่าย",
  "บิลและสาธารณูปโภค": "บิล/สาธารณูปโภค",
  "หนี้สิน": "หนี้สิน",
  "ค่าสมาชิกรายเดือน": "ค่าสมาชิกรายเดือน",
  "เงินออมและการลงทุน": "เงินออม/การลงทุน",
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function mapTransaction(docId: string, docData: Record<string, unknown>): Transaction {
  const type = docData.type as string;
  const mainCategory = (docData.main_category as string) ?? "";
  let mappedType: string;
  if (type === "income") {
    mappedType = "รายรับ";
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
    timestamp: new Date().toISOString(),
    income,
    expenses,
    transactions,
    carryOver: (data.carry_over as number) ?? 0,
  };
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
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  // Real-time listener for yearly data
  useEffect(() => {
    if (!year || !userId) return;

    const budgetsCol = collection(firestore, "users", userId, "budgets");
    const txCol = collection(firestore, "users", userId, "transactions");

    const buildYearlyData = async (budgetSnap: any, txSnap: any) => {
      const yearBudgets = budgetSnap.docs.filter((d: any) => {
        const period = (d.data().period as string) ?? d.id;
        return period.startsWith(year);
      });

      if (yearBudgets.length === 0) return;

      const txByMonth: Record<string, Transaction[]> = {};
      txSnap.docs.forEach((d: any) => {
        const data = d.data();
        const monthYear = (data.month_year as string) ?? "";
        if (monthYear.startsWith(year)) {
          if (!txByMonth[monthYear]) txByMonth[monthYear] = [];
          txByMonth[monthYear].push(mapTransaction(d.id, data as Record<string, unknown>));
        }
      });

      const monthsData = yearBudgets.map((budgetDoc: any) => {
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

    const unsubBudgets = onSnapshot(budgetsCol, (snap) => {
      latestBudgetSnap = snap;
      if (latestTxSnap) buildYearlyData(snap, latestTxSnap);
    });

    const unsubTx = onSnapshot(txCol, (snap) => {
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
      const budgetsCol = collection(firestore, "users", userId, "budgets");
      const budgetSnap = await getDocs(budgetsCol);
      
      const yearBudgets = budgetSnap.docs.filter((d) => {
        const period = (d.data().period as string) ?? d.id;
        return period.startsWith(year!);
      });

      if (yearBudgets.length === 0) throw new Error("No data found");

      const txCol = collection(firestore, "users", userId, "transactions");
      const allTxSnap = await getDocs(txCol);
      const txByMonth: Record<string, Transaction[]> = {};
      allTxSnap.forEach((d) => {
        const data = d.data();
        const monthYear = (data.month_year as string) ?? "";
        if (monthYear.startsWith(year!)) {
          if (!txByMonth[monthYear]) txByMonth[monthYear] = [];
          txByMonth[monthYear].push(mapTransaction(d.id, data as Record<string, unknown>));
        }
      });

      const monthsData = yearBudgets.map((budgetDoc) => {
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
