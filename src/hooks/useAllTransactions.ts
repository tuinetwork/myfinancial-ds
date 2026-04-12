import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface RawTransaction {
  id: string;
  type: string;
  amount: number;
  date: string;
  month_year: string;
  main_category?: string;
  sub_category?: string;
  note?: string;
  from_account_id?: string;
  to_account_id?: string;
  tags?: string[];
  is_deleted?: boolean;
  created_at?: number;
}

/**
 * Shared hook to load ALL transactions for the current user.
 * Uses React Query caching so multiple pages share the same data
 * instead of each doing a separate full collection scan.
 *
 * Returns raw Firestore data (not mapped to Thai types).
 */
export function useAllTransactions() {
  const { userId } = useAuth();

  return useQuery({
    queryKey: ["all-transactions", userId],
    queryFn: async () => {
      if (!userId) return [];
      const snap = await getDocs(collection(firestore, "users", userId, "transactions"));
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as RawTransaction))
        .filter((t) => !t.is_deleted);
    },
    enabled: !!userId,
    staleTime: 60_000, // 1 min — avoid re-fetching on every page switch
    gcTime: 5 * 60_000, // keep in cache 5 min
  });
}

/**
 * Compute trueNetWorth from all transactions (income - expense).
 * Same logic as AccountsPage — used for Net Worth calculations.
 */
export function useTrueNetWorth() {
  const { data: txs } = useAllTransactions();

  if (!txs) return 0;
  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === "income") income += t.amount;
    if (t.type === "expense") expense += t.amount;
  }
  return income - expense;
}
