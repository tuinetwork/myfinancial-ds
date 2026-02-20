import { useQuery } from "@tanstack/react-query";
import { ref, get } from "firebase/database";
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

// Firebase stores arrays as objects with numeric keys; convert them back
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

/** Fetch list of available month keys from Firebase root */
export function useAvailableMonths() {
  return useQuery<string[]>({
    queryKey: ["available-months"],
    queryFn: async () => {
      const snapshot = await get(ref(db));
      if (!snapshot.exists()) return [];
      const val = snapshot.val();
      if (typeof val === "object" && val !== null) {
        return Object.keys(val).sort().reverse();
      }
      return [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetch budget data for a specific month key */
export function useBudgetData(monthKey?: string) {
  return useQuery<BudgetData>({
    queryKey: ["budget-data", monthKey],
    queryFn: async () => {
      const path = monthKey ? monthKey : undefined;
      const snapshot = await get(ref(db, path));
      if (!snapshot.exists()) throw new Error("No data found");
      const raw = snapshot.val();

      // If monthKey is not specified and root contains month keys, pick the latest
      if (!monthKey && typeof raw === "object" && raw !== null) {
        const keys = Object.keys(raw).sort().reverse();
        // Check if root is a month container (keys look like month keys) or direct data
        if (keys.length > 0 && !raw.status && !raw.income) {
          // Root contains month keys, use the latest one
          return normalizeBudgetData(raw[keys[0]] as Record<string, unknown>);
        }
      }

      return normalizeBudgetData(raw as Record<string, unknown>);
    },
    enabled: true,
    staleTime: 5 * 60 * 1000,
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
