import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { computeWalletHistory, type WalletHistoryRow } from "@/lib/carry-over-recalc";

export type { WalletHistoryRow };

export function useWalletHistory(year?: string) {
  const { userId } = useAuth();
  return useQuery<WalletHistoryRow[]>({
    queryKey: ["wallet-history", userId, year],
    queryFn: async () => {
      if (!userId) return [];
      const all = await computeWalletHistory(userId);
      if (!year) return all;
      return all.filter((r) => r.period.startsWith(year));
    },
    enabled: !!userId && !!year,
    staleTime: 5 * 60 * 1000,
  });
}
