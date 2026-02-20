import { SummaryCards } from "@/components/SummaryCards";
import { DailyChart } from "@/components/DailyChart";
import { ExpenseChart } from "@/components/ExpenseChart";
import { ExpensePieChart } from "@/components/ExpensePieChart";
import { ExpenseCategoryChart } from "@/components/ExpenseCategoryChart";
import { BudgetBreakdown } from "@/components/BudgetBreakdown";
import { TransactionTable } from "@/components/TransactionTable";
import { MonthlyTrendChart } from "@/components/MonthlyTrendChart";
import { YearlyData } from "@/hooks/useYearlyData";

interface Props {
  yearlyData: YearlyData;
}

export function YearlyView({ yearlyData }: Props) {
  const { aggregated } = yearlyData;

  return (
    <div className="space-y-6">
      <SummaryCards data={aggregated} />

      <MonthlyTrendChart yearlyData={yearlyData} />

      <DailyChart data={aggregated} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExpenseChart data={aggregated} />
        <ExpensePieChart data={aggregated} />
      </div>

      <ExpenseCategoryChart data={aggregated} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BudgetBreakdown data={aggregated} />
        <div className="lg:col-span-2">
          <TransactionTable data={aggregated} />
        </div>
      </div>
    </div>
  );
}
