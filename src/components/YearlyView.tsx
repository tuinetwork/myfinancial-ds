import { SummaryCards } from "@/components/SummaryCards";
import { ExpenseChart } from "@/components/ExpenseChart";
import { ExpenseTabsChart } from "@/components/ExpenseTabsChart";
import { BudgetBreakdown } from "@/components/BudgetBreakdown";
import { YearlyTransactionTable } from "@/components/YearlyTransactionTable";
import { MonthlyTrendChart } from "@/components/MonthlyTrendChart";
import { MonthlyHighlights } from "@/components/MonthlyHighlights";
import { YearlySummaryCard } from "@/components/YearlySummaryCard";
import { YearlyData } from "@/hooks/useYearlyData";
import { useWalletHistory } from "@/hooks/useWalletHistory";
import type { Account } from "@/types/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wallet, Loader2 } from "lucide-react";

interface Props {
  yearlyData: YearlyData;
  accounts?: Account[];
}

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function YearlyView({ yearlyData, accounts = [] }: Props) {
  const { aggregated } = yearlyData;
  const { data: walletRows, isLoading: walletLoading } = useWalletHistory(yearlyData.year);

  // ตัด period ที่เกินเดือนปัจจุบันออก (เช่น เดือนที่ตั้ง budget ล่วงหน้า)
  const currentPeriod = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();
  const filteredWalletRows = walletRows?.filter((r) => r.period <= currentPeriod) ?? [];

  const lastWalletRow = filteredWalletRows.length > 0 ? filteredWalletRows[filteredWalletRows.length - 1] : null;

  // สูตรเดียวกับหน้ากระเป๋าเงิน: ใช้ walletHistory row ล่าสุด (≤ เดือนปัจจุบัน)
  const walletSnapshot = lastWalletRow ? {
    assets: lastWalletRow.mainWalletBalance + lastWalletRow.otherAssets,
    liabilities: lastWalletRow.liabilities,
    netWorth: lastWalletRow.trueNetWorth,
  } : undefined;

  return (
    <div className="space-y-6">
      <SummaryCards
        data={aggregated}
        hideNetBalance
        accounts={accounts}
        historicalOtherAssets={lastWalletRow?.otherAssets}
        historicalLiabilities={lastWalletRow?.liabilities}
        walletSnapshot={walletSnapshot}
      />

      <YearlySummaryCard yearlyData={yearlyData} />

      <MonthlyHighlights yearlyData={yearlyData} />

      {/* ตารางเงินสดในมือรายเดือน */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            เงินสดในมือรายเดือน
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {walletLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredWalletRows.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">ไม่พบข้อมูล</p>
          ) : (
            <ScrollArea className="rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b border-border">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">เดือน</th>
                    <th className="px-3 py-2 font-semibold text-right">ยกยอด</th>
                    <th className="px-3 py-2 font-semibold text-right">รายรับ</th>
                    <th className="px-3 py-2 font-semibold text-right">รายจ่าย</th>
                    <th className="px-3 py-2 font-semibold text-right">Net Worth</th>
                    <th className="px-3 py-2 font-semibold text-right">สินทรัพย์อื่น</th>
                    <th className="px-3 py-2 font-semibold text-right">หนี้สิน</th>
                    <th className="px-3 py-2 font-semibold text-right">เงินสดในมือ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWalletRows.map((r) => (
                    <tr key={r.period} className="border-b border-border/50 last:border-0">
                      <td className="px-3 py-2 font-mono">{r.period}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(r.carryOver)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-accent">{fmt(r.income)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-destructive">{fmt(r.expenses)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.trueNetWorth >= 0 ? "text-accent" : "text-destructive"}`}>
                        {fmt(r.trueNetWorth)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmt(r.otherAssets)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[hsl(var(--debt))]">{fmt(r.liabilities)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.mainWalletBalance >= 0 ? "text-accent" : "text-destructive"}`}>
                        {fmt(r.mainWalletBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <MonthlyTrendChart yearlyData={yearlyData} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
        <ExpenseChart data={aggregated} />
        <ExpenseTabsChart data={aggregated} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-stretch">
        <BudgetBreakdown data={aggregated} />
        <div className="xl:col-span-2 min-h-0">
          <YearlyTransactionTable yearlyData={yearlyData} />
        </div>
      </div>
    </div>
  );
}
