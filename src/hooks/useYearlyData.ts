import { useQuery } from "@tanstack/react-query";
import { ref, get } from "firebase/database";
import { db } from "@/lib/firebase";
import { BudgetData, BudgetItem, Transaction } from "./useBudgetData";

const USER_ID = "xgkdmyxxeJVlNiqoahNJWBekqmh2";
const USER_PATH = `users/${USER_ID}`;

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const EXPENSE_GROUP_MAP: Record<string, keyof BudgetData["expenses"]> = {
  "ค่าใช้จ่ายทั่วไป": "general",
  "บิลและสาธารณูปโภค": "bills",
  "หนี้สิน": "debts",
  "ค่าสมาชิกรายเดือน": "subscriptions",
  "เงินออมและการลงทุน": "savings",
};

const MAIN_CATEGORY_TO_TYPE: Record<string, string> = {
  "ค่าใช้จ่ายทั่วไป": "ค่าใช้จ่าย",
  "หนี้สิน": "หนี้สิน",
  "บิลและสาธารณูปโภค": "บิล/สาธารณูปโภค",
  "ค่าสมาชิกรายเดือน": "ค่าสมาชิกรายเดือน",
  "เงินออมและการลงทุน": "เงินออม/การลงทุน",
};

function flattenToItems(group: Record<string, number> | undefined): BudgetItem[] {
  if (!group || typeof group !== "object") return [];
  return Object.entries(group).map(([label, budget]) => ({ label, budget: budget || 0 }));
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
    carryOver: 0,
  };

  return { year, months: monthsData, aggregated };
}

export function useYearlyData(year?: string) {
  return useQuery<YearlyData>({
    queryKey: ["yearly-data", year],
    queryFn: async () => {
      const [budgetsSnap, txSnap] = await Promise.all([
        get(ref(db, `${USER_PATH}/budgets`)),
        get(ref(db, `${USER_PATH}/transactions`)),
      ]);
      if (!budgetsSnap.exists()) throw new Error("No data found");

      const allBudgets = budgetsSnap.val() as Record<string, Record<string, unknown>>;
      const allTx = txSnap.exists()
        ? (txSnap.val() as Record<string, Record<string, unknown>>)
        : null;

      const monthsData: { month: string; data: BudgetData }[] = [];

      for (const [period, budgetRaw] of Object.entries(allBudgets)) {
        if (!period.startsWith(year!)) continue;
        const monthIdx = parseInt(period.split("-")[1], 10) - 1;
        const monthName = THAI_MONTHS[monthIdx] ?? period;

        // Build income
        const incomeEstimates = (budgetRaw.income_estimates ?? {}) as Record<string, Record<string, number>>;
        const income: BudgetItem[] = [];
        for (const group of Object.values(incomeEstimates)) {
          income.push(...flattenToItems(group));
        }

        // Build expenses
        const expenseBudgets = (budgetRaw.expense_budgets ?? {}) as Record<string, Record<string, number>>;
        const expenses: BudgetData["expenses"] = {
          general: [], bills: [], debts: [], subscriptions: [], savings: [],
        };
        for (const [mainCat, subs] of Object.entries(expenseBudgets)) {
          const key = EXPENSE_GROUP_MAP[mainCat];
          if (key) expenses[key] = flattenToItems(subs);
        }

        // Filter transactions
        const transactions: Transaction[] = [];
        if (allTx) {
          for (const tx of Object.values(allTx)) {
            if (tx.month_year !== period) continue;
            const rawType = tx.type as string;
            const mainCat = tx.main_category as string;
            transactions.push({
              date: (tx.date as string) ?? "",
              amount: (tx.amount as number) ?? 0,
              type: rawType === "income" ? "รายรับ" : (MAIN_CATEGORY_TO_TYPE[mainCat] || "ค่าใช้จ่าย"),
              category: (tx.sub_category as string) ?? "",
              description: (tx.note as string) ?? "",
            });
          }
        }

        monthsData.push({
          month: period.split("-")[1],
          data: {
            status: "ok",
            month: monthName,
            timestamp: new Date().toISOString(),
            income,
            expenses,
            transactions,
            carryOver: (budgetRaw.carry_over as number) ?? 0,
          },
        });
      }

      monthsData.sort((a, b) => a.month.localeCompare(b.month));
      return mergeMonths(year!, monthsData);
    },
    enabled: !!year,
    staleTime: 5 * 60 * 1000,
  });
}
