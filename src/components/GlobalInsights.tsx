import { useAvailableMonths, useBudgetData } from "@/hooks/useBudgetData";
import { useSpendingInsights } from "@/hooks/useSpendingInsights";
import { SpendingInsightsButton } from "@/components/SpendingInsights";

/**
 * Global insights widget — fetches current month data and shows the insights button.
 * Placed in AuthenticatedApp so it's visible on every page.
 */
export function GlobalInsights() {
  const { data: months } = useAvailableMonths();
  const currentPeriod = months?.[0]?.period;
  const { data } = useBudgetData(currentPeriod);
  const carryOver = data?.carryOver ?? 0;
  const insights = useSpendingInsights(data, carryOver);

  if (!data || insights.length === 0) return null;

  return (
    <div className="fixed top-16 right-4 z-40">
      <SpendingInsightsButton insights={insights} />
    </div>
  );
}
