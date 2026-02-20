import { SummaryCards } from "@/components/SummaryCards";
import { ExpenseChart } from "@/components/ExpenseChart";
import { ExpenseTabsChart } from "@/components/ExpenseTabsChart";
import { BudgetBreakdown } from "@/components/BudgetBreakdown";
import { YearlyTransactionTable } from "@/components/YearlyTransactionTable";
import { MonthlyTrendChart } from "@/components/MonthlyTrendChart";
import { MonthlyHighlights } from "@/components/MonthlyHighlights";
import { YearlySummaryCard } from "@/components/YearlySummaryCard";
import { YearlyData } from "@/hooks/useYearlyData";

interface Props {
  yearlyData: YearlyData;
}

export function YearlyView({ yearlyData }: Props) {
  const { aggregated } = yearlyData;

  return (
    <div className="space-y-6">
      <SummaryCards data={aggregated} hideNetBalance />

      <YearlySummaryCard yearlyData={yearlyData} />

      <MonthlyHighlights yearlyData={yearlyData} />

      <MonthlyTrendChart yearlyData={yearlyData} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExpenseChart data={aggregated} />
        <ExpenseTabsChart data={aggregated} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BudgetBreakdown data={aggregated} />
        <div className="lg:col-span-2">
          <YearlyTransactionTable yearlyData={yearlyData} />
        </div>
      </div>
    </div>
  );
}
