import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

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
  carryOver?: number;
}

export interface MonthOption {
  year: string;
  month: string;
  monthName: string;
  period: string;
  label: string;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function periodToMonthName(period: string): string {
  const [, monthStr] = period.split("-");
  const idx = parseInt(monthStr, 10) - 1;
  return THAI_MONTHS[idx] ?? period;
}

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

function budgetsCollection(userId: string) {
  return collection(firestore, "users", userId, "budgets");
}

function transactionsCollection(userId: string) {
  return collection(firestore, "users", userId, "transactions");
}

function parseBudgetDoc(
  docData: Record<string, unknown>,
  transactions: Transaction[]
): BudgetData {
  const period = (docData.period as string) ?? "";
  const monthName = periodToMonthName(period);
  const carryOver = (docData.carry_over as number) ?? 0;

  // income_estimates → BudgetItem[]
  const incomeEstimates = (docData.income_estimates ?? {}) as Record<string, number>;
  const income: BudgetItem[] = Object.entries(incomeEstimates).map(
    ([label, budget]) => ({ label, budget })
  );

  // expense_budgets → expenses groups
  const expenseBudgets = (docData.expense_budgets ?? {}) as Record<
    string,
    Record<string, number>
  >;
  const expenses: BudgetData["expenses"] = {
    general: [],
    bills: [],
    debts: [],
    subscriptions: [],
    savings: [],
  };
  for (const [mainCat, subs] of Object.entries(expenseBudgets)) {
    const key = EXPENSE_CATEGORY_MAP[mainCat];
    if (key && subs && typeof subs === "object") {
      expenses[key] = Object.entries(subs).map(([label, budget]) => ({
        label,
        budget,
      }));
    }
  }

  return {
    status: "ok",
    month: monthName,
    timestamp: new Date().toISOString(),
    income,
    expenses,
    transactions,
    carryOver,
  };
}

function mapTransaction(docData: Record<string, unknown>): Transaction {
  const type = docData.type as string;
  const mainCategory = (docData.main_category as string) ?? "";
  let mappedType: string;
  if (type === "income") {
    mappedType = "รายรับ";
  } else {
    mappedType = MAIN_CATEGORY_TYPE_MAP[mainCategory] ?? "ค่าใช้จ่าย";
  }

  return {
    date: (docData.date as string) ?? "",
    amount: (docData.amount as number) ?? 0,
    type: mappedType,
    category: (docData.sub_category as string) ?? "",
    description: (docData.note as string) ?? "",
  };
}

/** Fetch available year/month options from budgets collection */
export function useAvailableMonths() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = onSnapshot(budgetsCollection(userId), (snapshot) => {
      const options: MonthOption[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const period = (data.period as string) ?? doc.id;
        const [year, monthNum] = period.split("-");
        const monthName = periodToMonthName(period);
        options.push({
          year,
          month: monthNum,
          monthName,
          period,
          label: `${monthName} ${year}`,
        });
      });
      options.sort((a, b) => b.period.localeCompare(a.period));
      queryClient.setQueryData(["available-months", userId], options);
    });
    return () => unsubscribe();
  }, [queryClient, userId]);

  return useQuery<MonthOption[]>({
    queryKey: ["available-months", userId],
    queryFn: async () => {
      if (!userId) return [];
      const snapshot = await getDocs(budgetsCollection(userId));
      const options: MonthOption[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const period = (data.period as string) ?? doc.id;
        const [year, monthNum] = period.split("-");
        const monthName = periodToMonthName(period);
        options.push({
          year,
          month: monthNum,
          monthName,
          period,
          label: `${monthName} ${year}`,
        });
      });
      options.sort((a, b) => b.period.localeCompare(a.period));
      return options;
    },
    enabled: !!userId,
    staleTime: Infinity,
  });
}

/** Fetch budget data + transactions for a period */
export function useBudgetData(period?: string) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  useEffect(() => {
    if (!period || !userId) return;

    const budgetDocRef = doc(firestore, "users", userId, "budgets", period);
    const unsubBudget = onSnapshot(budgetDocRef, async (budgetSnap) => {
      if (!budgetSnap.exists()) return;
      const txQuery = query(
        transactionsCollection(userId),
        where("month_year", "==", period)
      );
      const txSnap = await getDocs(txQuery);
      const transactions = txSnap.docs.map((d) =>
        mapTransaction(d.data() as Record<string, unknown>)
      );
      queryClient.setQueryData(
        ["budget-data", period],
        parseBudgetDoc(budgetSnap.data() as Record<string, unknown>, transactions)
      );
    });

    const txQuery = query(
      transactionsCollection(userId),
      where("month_year", "==", period)
    );
    const unsubTx = onSnapshot(txQuery, async (txSnap) => {
      const budgetSnap = await getDoc(budgetDocRef);
      if (!budgetSnap.exists()) return;
      const transactions = txSnap.docs.map((d) =>
        mapTransaction(d.data() as Record<string, unknown>)
      );
      queryClient.setQueryData(
        ["budget-data", period],
        parseBudgetDoc(budgetSnap.data() as Record<string, unknown>, transactions)
      );
    });

    return () => {
      unsubBudget();
      unsubTx();
    };
  }, [period, queryClient, userId]);

  return useQuery<BudgetData>({
    queryKey: ["budget-data", period],
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const budgetSnap = await getDoc(
        doc(firestore, "users", userId, "budgets", period!)
      );
      if (!budgetSnap.exists()) throw new Error("No data found");
      const txQuery = query(
        transactionsCollection(userId),
        where("month_year", "==", period!)
      );
      const txSnap = await getDocs(txQuery);
      const transactions = txSnap.docs.map((d) =>
        mapTransaction(d.data() as Record<string, unknown>)
      );
      return parseBudgetDoc(
        budgetSnap.data() as Record<string, unknown>,
        transactions
      );
    },
    enabled: !!period && !!userId,
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
