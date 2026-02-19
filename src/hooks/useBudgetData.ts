import { useQuery } from "@tanstack/react-query";

const API_URL =
  "https://script.googleusercontent.com/macros/echo?user_content_key=AY5xjrQIoRALCnCx_0nbg5-Cy60z3bWp9YD_gpz0F2JS6AdL8DFH0CuvJx-nbexZabxku5Z23cvK62E1B7-am0q7__XWmh_LQCAefONY4s3Mp9fy_tOIYjlNWLgRpYMHLEddpzXwTKyRDQiPeoNHYnzaLNru_vRvFbHyitgeqae_9nHjdgve6hZ4kKhSrTSEfuPa84zanaq0a6RWot-XvKBqQs_WwUyv5zz-Vi9pQOgApdJ_TS4yMIRxMVgmU08YFeOx_4vtVPVI9gXGtsC2lFZQbVbxBYl4rg&lib=Mx_ytsl3VCHixI3UCWdD2sWZXvhknfx_y";

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
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
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
