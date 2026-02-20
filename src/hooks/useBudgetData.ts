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

export function useBudgetData() {
  return useQuery<BudgetData>({
    queryKey: ["budget-data"],
    queryFn: async () => {
      const snapshot = await get(ref(db));
      if (!snapshot.exists()) throw new Error("No data found");
      return snapshot.val() as BudgetData;
    },
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
