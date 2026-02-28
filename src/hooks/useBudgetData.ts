import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ref, get, onValue, off } from "firebase/database";
import { db } from "@/lib/firebase";

const USER_ID = "xgkdmyxxeJVlNiqoahNJWBekqmh2";
const USER_PATH = `users/${USER_ID}`;

export interface BudgetItem {
  label: string;
  budget: number;
}

export interface Transaction {
  date: string;
  amount: number;
  type: string;
  category: string;
  description: string;
}

export interface BudgetData {
  status: string;
  month: string;
  timestamp: string;
  income: BudgetItem[];
  expenses: {
    general: BudgetItem[];
    bills: BudgetItem[];
    debts: BudgetItem[];
    subscriptions: BudgetItem[];
    savings: BudgetItem[];
  };
  transactions: Transaction[];
  carryOver: number;
}

export interface MonthOption {
  year: string;
  month: string;
  monthName: string;
  path: string;
  label: string;
  period: string;
}

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

function mapTransactionType(rawType: string, mainCategory: string): string {
  if (rawType === "income") return "รายรับ";
  return MAIN_CATEGORY_TO_TYPE[mainCategory] || "ค่าใช้จ่าย";
}

function normalizeBudgetData(
  budgetRaw: Record<string, unknown>,
  transactionsRaw: Record<string, Record<string, unknown>> | null,
  period: string,
): BudgetData {
  const expenseBudgets = (budgetRaw.expense_budgets ?? {}) as Record<string, Record<string, number>>;
  const incomeEstimates = (budgetRaw.income_estimates ?? {}) as Record<string, Record<string, number>>;

  // Flatten income estimates
  const income: BudgetItem[] = [];
  for (const group of Object.values(incomeEstimates)) {
    income.push(...flattenToItems(group));
  }

  // Map expense budgets to groups
  const expenses: BudgetData["expenses"] = {
    general: [], bills: [], debts: [], subscriptions: [], savings: [],
  };
  for (const [mainCat, subs] of Object.entries(expenseBudgets)) {
    const key = EXPENSE_GROUP_MAP[mainCat];
    if (key) {
      expenses[key] = flattenToItems(subs);
    }
  }

  // Filter and map transactions for this period
  const transactions: Transaction[] = [];
  if (transactionsRaw) {
    for (const tx of Object.values(transactionsRaw)) {
      if (tx.month_year !== period) continue;
      transactions.push({
        date: (tx.date as string) ?? "",
        amount: (tx.amount as number) ?? 0,
        type: mapTransactionType(tx.type as string, tx.main_category as string),
        category: (tx.sub_category as string) ?? "",
        description: (tx.note as string) ?? "",
      });
    }
  }

  const monthIdx = parseInt(period.split("-")[1], 10) - 1;
  const monthName = THAI_MONTHS[monthIdx] ?? period;

  return {
    status: "ok",
    month: monthName,
    timestamp: new Date().toISOString(),
    income,
    expenses,
    transactions,
    carryOver: (budgetRaw.carry_over as number) ?? 0,
  };
}

/** Fetch available year/month options from budgets node */
export function useAvailableMonths() {
  const queryClient = useQueryClient();
  const budgetsPath = `${USER_PATH}/budgets`;

  useEffect(() => {
    const dbRef = ref(db, budgetsPath);
    const unsubscribe = onValue(dbRef, (snapshot) => {
      if (!snapshot.exists()) return;
      queryClient.setQueryData(["available-months"], buildMonthOptions(snapshot.val()));
    });
    return () => off(dbRef, "value", unsubscribe);
  }, [queryClient, budgetsPath]);

  return useQuery<MonthOption[]>({
    queryKey: ["available-months"],
    queryFn: async () => {
      const snapshot = await get(ref(db, budgetsPath));
      if (!snapshot.exists()) return [];
      return buildMonthOptions(snapshot.val());
    },
    staleTime: Infinity,
  });
}

function buildMonthOptions(budgets: Record<string, Record<string, unknown>>): MonthOption[] {
  return Object.keys(budgets)
    .sort()
    .reverse()
    .map((period) => {
      const [year, month] = period.split("-");
      const monthIdx = parseInt(month, 10) - 1;
      const monthName = THAI_MONTHS[monthIdx] ?? month;
      return {
        year,
        month,
        monthName,
        path: `${USER_PATH}/budgets/${period}`,
        label: `${monthName} ${year}`,
        period,
      };
    });
}

/** Fetch budget data with realtime listener */
export function useBudgetData(path?: string) {
  const queryClient = useQueryClient();
  const period = path?.split("/").pop() ?? "";

  useEffect(() => {
    if (!path) return;
    const budgetRef = ref(db, path);
    const txRef = ref(db, `${USER_PATH}/transactions`);

    const unsubBudget = onValue(budgetRef, async (budgetSnap) => {
      if (!budgetSnap.exists()) return;
      const txSnap = await get(txRef);
      queryClient.setQueryData(
        ["budget-data", path],
        normalizeBudgetData(
          budgetSnap.val() as Record<string, unknown>,
          txSnap.exists() ? (txSnap.val() as Record<string, Record<string, unknown>>) : null,
          period,
        ),
      );
    });
    return () => off(budgetRef, "value", unsubBudget);
  }, [path, period, queryClient]);

  return useQuery<BudgetData>({
    queryKey: ["budget-data", path],
    queryFn: async () => {
      const [budgetSnap, txSnap] = await Promise.all([
        get(ref(db, path)),
        get(ref(db, `${USER_PATH}/transactions`)),
      ]);
      if (!budgetSnap.exists()) throw new Error("No data found");
      return normalizeBudgetData(
        budgetSnap.val() as Record<string, unknown>,
        txSnap.exists() ? (txSnap.val() as Record<string, Record<string, unknown>>) : null,
        period,
      );
    },
    enabled: !!path,
    staleTime: Infinity,
  });
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
