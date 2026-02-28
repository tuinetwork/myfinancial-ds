import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ref, get, onValue, off } from "firebase/database";
import { db } from "@/lib/firebase";

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
}

export interface MonthOption {
  year: string;
  month: string;
  monthName: string;
  path: string;
  label: string;
}

function toArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val;
  if (val && typeof val === "object") return Object.values(val) as T[];
  return [];
}

function normalizeBudgetData(raw: Record<string, unknown>): BudgetData {
  const expenses = (raw.expenses ?? {}) as Record<string, unknown>;
  return {
    status: (raw.status as string) ?? "",
    month: (raw.monthName as string) ?? (raw.month as string) ?? "",
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

const USER_ID = "xgkdmyxxeJVlNiqoahNJWBekqmh2";

/** Fetch available year/month options from history node + realtime updates */
export function useAvailableMonths() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const dbRef = ref(db, `users/${USER_ID}/history`);
    const unsubscribe = onValue(dbRef, (snapshot) => {
      if (!snapshot.exists()) return;
      const years = snapshot.val() as Record<string, Record<string, Record<string, unknown>>>;
      const options: MonthOption[] = [];
      for (const year of Object.keys(years).sort().reverse()) {
        const months = years[year];
        if (typeof months === "object" && months !== null) {
          for (const month of Object.keys(months).sort().reverse()) {
            const monthData = months[month];
            const monthName = (monthData?.monthName as string) ?? month;
            options.push({ year, month, monthName, path: `users/${USER_ID}/history/${year}/${month}`, label: `${monthName} ${year}` });
          }
        }
      }
      queryClient.setQueryData(["available-months"], options);
    });
    return () => off(dbRef, "value", unsubscribe);
  }, [queryClient]);

  return useQuery<MonthOption[]>({
    queryKey: ["available-months"],
    queryFn: async () => {
      const snapshot = await get(ref(db, `users/${USER_ID}/history`));
      if (!snapshot.exists()) return [];
      const years = snapshot.val() as Record<string, Record<string, Record<string, unknown>>>;
      const options: MonthOption[] = [];
      for (const year of Object.keys(years).sort().reverse()) {
        const months = years[year];
        if (typeof months === "object" && months !== null) {
          for (const month of Object.keys(months).sort().reverse()) {
            const monthData = months[month];
            const monthName = (monthData?.monthName as string) ?? month;
            options.push({ year, month, monthName, path: `users/${USER_ID}/history/${year}/${month}`, label: `${monthName} ${year}` });
          }
        }
      }
      return options;
    },
    staleTime: Infinity,
  });
}

/** Fetch budget data with realtime listener */
export function useBudgetData(path?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!path) return;
    const dbRef = ref(db, path);
    const unsubscribe = onValue(dbRef, (snapshot) => {
      if (!snapshot.exists()) return;
      queryClient.setQueryData(
        ["budget-data", path],
        normalizeBudgetData(snapshot.val() as Record<string, unknown>)
      );
    });
    return () => off(dbRef, "value", unsubscribe);
  }, [path, queryClient]);

  return useQuery<BudgetData>({
    queryKey: ["budget-data", path],
    queryFn: async () => {
      const snapshot = await get(ref(db, path));
      if (!snapshot.exists()) throw new Error("No data found");
      return normalizeBudgetData(snapshot.val() as Record<string, unknown>);
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
