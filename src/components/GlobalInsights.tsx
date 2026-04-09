import { useAvailableMonths, useBudgetData } from "@/hooks/useBudgetData";
import { useSpendingInsights } from "@/hooks/useSpendingInsights";
import { SpendingInsightsButton } from "@/components/SpendingInsights";

/**
 * Global insights button — fetches current month data automatically.
 * Place inside each page's header alongside ThemeToggle/NotificationBell.
 */
export function GlobalInsights() {
  const { data: months } = useAvailableMonths();
  const currentPeriod = months?.[0]?.period;
  const { data } = useBudgetData(currentPeriod);
  const carryOver = data?.carryOver ?? 0;
  const insights = useSpendingInsights(data, carryOver);

  if (!data || insights.length === 0) return null;

  return <SpendingInsightsButton insights={insights} />;
}
