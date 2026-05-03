import { useState, useEffect, useMemo } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalInsights } from "@/components/GlobalInsights";
import { AppFooter } from "@/components/AppFooter";
import { useAuth } from "@/contexts/AuthContext";
import { useAvailableMonths, useBudgetData, formatCurrency, type BudgetData, type BudgetItem } from "@/hooks/useBudgetData";
import { expandRecurrence } from "@/lib/recurrence";
import { getAccounts, getGoals, getInvestments } from "@/lib/firestore-services";
import type { Account, Goal, Investment } from "@/types/finance";
import { cn } from "@/lib/utils";
import {
  Eye, TrendingUp, TrendingDown, Wallet, Target, CreditCard, PiggyBank,
  ArrowUpRight, ArrowDownRight, Minus, Receipt, Sparkles,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEndOfMonthForecast } from "@/hooks/useEndOfMonthForecast";
import { useWalletHistory } from "@/hooks/useWalletHistory";
import { UpcomingBills } from "@/components/UpcomingBills";
import { FinancialHealthCard } from "@/components/FinancialHealthCard";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
  PieChart, Pie, Cell,
} from "recharts";

// ===== Helpers =====
const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const LIABILITY_TYPES_OVW = new Set(["credit_card", "loan", "payable"]);

const fmt = (v: number) => v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Format "2026-04-09" → "9 เม.ย. 69" (Thai Buddhist short year) */
function formatThaiDateShort(dateStr: string): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const buddhistYear = (y + 543) % 100; // short year e.g. 69
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${buddhistYear}`;
}

// ===== Net Worth Card =====
function NetWorthCard({ accounts, trueNetWorth, loading }: { accounts: Account[]; trueNetWorth: number; loading: boolean }) {
  const { totalAssets, totalLiabilities, netWorth, breakdown } = useMemo(() => {
    const liabilityTypes = ["credit_card", "loan", "payable"];
    const isMainAccount = (a: Account) => a.name === "กระเป๋าเงินสดหลัก";
    const active = accounts.filter((a) => a.is_active && !a.is_deleted);

    // Calculate main wallet balance from trueNetWorth (same as AccountsPage)
    let otherAssetsTotal = 0;
    let liabilitiesTotal = 0;
    active.forEach((a) => {
      if (isMainAccount(a)) return;
      const bal = Number(a.balance) || 0;
      if (liabilityTypes.includes(a.type)) {
        liabilitiesTotal += Math.abs(bal);
      } else {
        otherAssetsTotal += bal;
      }
    });
    const mainBalance = trueNetWorth - otherAssetsTotal + liabilitiesTotal;

    let assets = 0;
    let liabilities = 0;
    const groups: Record<string, number> = {};
    active.forEach((a) => {
      const bal = isMainAccount(a) ? mainBalance : (Number(a.balance) || 0);
      if (liabilityTypes.includes(a.type)) {
        liabilities += Math.abs(bal);
        groups[a.type] = (groups[a.type] ?? 0) - Math.abs(bal);
      } else {
        assets += bal;
        groups[a.type] = (groups[a.type] ?? 0) + bal;
      }
    });
    return { totalAssets: assets, totalLiabilities: liabilities, netWorth: assets - liabilities, breakdown: groups };
  }, [accounts, trueNetWorth]);

  if (loading) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">มูลค่าสุทธิ (Net Worth)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className={cn("text-3xl font-bold font-display tabular-nums", netWorth >= 0 ? "text-foreground" : "text-destructive")}>
          {formatCurrency(netWorth)}
        </p>
        <div className="flex gap-4 text-xs">
          <div>
            <p className="text-muted-foreground">สินทรัพย์</p>
            <p className="font-semibold text-accent tabular-nums">{formatCurrency(totalAssets)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">หนี้สิน</p>
            <p className="font-semibold text-destructive tabular-nums">{formatCurrency(totalLiabilities)}</p>
          </div>
        </div>
        {/* Mini breakdown */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground pt-1 border-t">
          {Object.entries(breakdown).map(([type, val]) => (
            <span key={type} className="tabular-nums">
              {type === "cash" ? "เงินสด" : type === "bank" ? "ธนาคาร" : type === "savings" ? "ออมทรัพย์" :
               type === "investment" ? "ลงทุน" : type === "credit_card" ? "บัตรเครดิต" : type === "loan" ? "สินเชื่อ" : type}
              : <span className={val >= 0 ? "text-foreground" : "text-destructive"}>{fmt(val)}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Income vs Expense Trend =====
interface MonthSummary {
  period: string;
  label: string;
  income: number;
  expense: number;
  savings: number;
  savingsRate: number;
}

function TrendChart({ data, loading }: { data: MonthSummary[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (data.length === 0) return null;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">รายรับ vs รายจ่าย (6 เดือน)</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} width={40} />
            <ReTooltip
              formatter={(value: number, name: string) => [fmt(value), name === "income" ? "รายรับ" : "รายจ่าย"]}
              labelFormatter={(l) => l}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="income" name="income" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="expense" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ===== Savings Rate Trend =====
function SavingsRateChart({ data, loading }: { data: MonthSummary[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (data.length === 0) return null;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">อัตราการออม (%)</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={35} domain={["auto", "auto"]} />
            <ReTooltip
              formatter={(v: number) => [`${v.toFixed(1)}%`, "อัตราการออม"]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Line type="monotone" dataKey="savingsRate" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ===== Accounts Summary =====
function AccountsSummary({ accounts, trueNetWorth, loading }: { accounts: Account[]; trueNetWorth: number; loading: boolean }) {
  if (loading) return <Skeleton className="h-36 rounded-xl" />;
  const active = accounts.filter((a) => a.is_active && !a.is_deleted);
  if (active.length === 0) return null;

  const liabilityTypes = ["credit_card", "loan", "payable"];
  const isMainAccount = (a: Account) => a.name === "กระเป๋าเงินสดหลัก";

  // Calculate main wallet balance (same as AccountsPage)
  let otherAssets = 0;
  let liabTotal = 0;
  active.forEach((a) => {
    if (isMainAccount(a)) return;
    const bal = Number(a.balance) || 0;
    if (liabilityTypes.includes(a.type)) liabTotal += Math.abs(bal);
    else otherAssets += bal;
  });
  const mainBalance = trueNetWorth - otherAssets + liabTotal;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">บัญชีทั้งหมด</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {active.map((a) => {
          const bal = isMainAccount(a) ? mainBalance : (Number(a.balance) || 0);
          const isLiability = liabilityTypes.includes(a.type);
          return (
            <div key={a.id} className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
              <span className="text-sm truncate">{a.name}</span>
              <span className={cn("text-sm font-semibold tabular-nums", isLiability ? "text-destructive" : "text-foreground")}>
                {isLiability ? "-" : ""}{formatCurrency(Math.abs(bal))}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ===== Goals Progress =====
function countTotalInstallments(item: BudgetItem): number {
  if (!item.recurrence || !item.startDate || !item.endDate) return 0;
  const start = new Date(item.startDate);
  const end = new Date(item.endDate);
  let count = 0;
  let y = start.getFullYear();
  let m = start.getMonth() + 1;
  const endY = end.getFullYear();
  const endM = end.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    count += expandRecurrence(item.dueDate, item.recurrence, y, m, item.startDate, item.endDate).length;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return count;
}

function GoalsMini({ goals, accounts, data, loading }: { goals: Goal[]; accounts: Account[]; data: BudgetData | undefined; loading: boolean }) {
  const resolved = useMemo(() => {
    const active = goals.filter((g) => g.status === "active" && !g.is_deleted);
    if (!data) return active;

    // Build account map
    const accMap = new Map<string, Account>();
    accounts.forEach((a) => accMap.set(a.id, a));

    // Build budget map from savings
    const budgetMap = new Map<string, { budgetTotal: number }>();
    const savingsItems = data.expenses.savings ?? [];
    savingsItems.forEach((item) => {
      if (item.recurrence && item.budget > 0) {
        const total = countTotalInstallments(item);
        budgetMap.set(item.label, { budgetTotal: item.budget * total });
      }
    });

    return active.map((g) => {
      let currentAmount = g.current_amount;
      let targetAmount = g.target_amount;
      // Sync current_amount from linked account balance
      if (g.linked_account_id) {
        const acc = accMap.get(g.linked_account_id);
        if (acc) currentAmount = acc.balance;
      }
      // Sync target_amount from budget installment total
      const matched = budgetMap.get(g.name);
      if (matched && matched.budgetTotal > 0) targetAmount = matched.budgetTotal;
      return { ...g, current_amount: currentAmount, target_amount: targetAmount };
    });
  }, [goals, accounts, data]);

  if (loading) return <Skeleton className="h-36 rounded-xl" />;
  if (resolved.length === 0) return null;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">เป้าหมาย</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {resolved.map((g) => {
          const pct = g.target_amount > 0 ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0;
          return (
            <div key={g.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate">{g.name}</span>
                <span className="text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all", pct >= 100 ? "bg-accent" : "bg-primary")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
                <span>{formatCurrency(g.current_amount)}</span>
                <span>{formatCurrency(g.target_amount)}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ===== Average Monthly Expense =====
function SixMonthStatsCard({ data, loading }: { data: MonthSummary[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-40 rounded-xl" />;
  if (data.length < 2) return null;

  const n = data.length;
  const avgIncome = data.reduce((s, d) => s + d.income, 0) / n;
  const avgExpense = data.reduce((s, d) => s + d.expense, 0) / n;
  const avgSavings = avgIncome - avgExpense;
  const avgSavingsRate = avgIncome > 0 ? (avgSavings / avgIncome) * 100 : 0;
  const current = data[data.length - 1];

  const expDiff = current.expense - avgExpense;
  const expDiffPct = avgExpense > 0 ? (expDiff / avgExpense) * 100 : 0;
  const incDiff = current.income - avgIncome;
  const incDiffPct = avgIncome > 0 ? (incDiff / avgIncome) * 100 : 0;

  // Best/worst expense months
  const sorted = [...data].sort((a, b) => a.expense - b.expense);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">สถิติ {n} เดือน</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Average row */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <p className="text-muted-foreground">รายรับเฉลี่ย</p>
            <p className="font-semibold text-accent tabular-nums">{formatCurrency(avgIncome)}</p>
            <div className="flex items-center gap-0.5 mt-0.5">
              <span className="text-muted-foreground">{current.label}:</span>
              {incDiff !== 0 && (
                <span className={cn("flex items-center gap-0.5", incDiff > 0 ? "text-accent" : "text-destructive")}>
                  {incDiff > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(incDiffPct).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground">รายจ่ายเฉลี่ย</p>
            <p className="font-semibold text-destructive tabular-nums">{formatCurrency(avgExpense)}</p>
            <div className="flex items-center gap-0.5 mt-0.5">
              <span className="text-muted-foreground">{current.label}:</span>
              {expDiff !== 0 && (
                <span className={cn("flex items-center gap-0.5", expDiff > 0 ? "text-destructive" : "text-accent")}>
                  {expDiff > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  {Math.abs(expDiffPct).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
          <div>
            <p className="text-muted-foreground">เก็บออมเฉลี่ย</p>
            <p className={cn("font-semibold tabular-nums", avgSavings >= 0 ? "text-foreground" : "text-destructive")}>
              {formatCurrency(avgSavings)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">อัตราออมเฉลี่ย</p>
            <p className={cn("font-semibold tabular-nums", avgSavingsRate >= 20 ? "text-accent" : avgSavingsRate >= 0 ? "text-foreground" : "text-destructive")}>
              {avgSavingsRate.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Best / Worst */}
        <div className="border-t pt-2 grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-muted-foreground">เดือนที่ใช้น้อยสุด</p>
            <p className="font-medium">{best.label} <span className="text-accent tabular-nums">{formatCurrency(best.expense)}</span></p>
          </div>
          <div>
            <p className="text-muted-foreground">เดือนที่ใช้มากสุด</p>
            <p className="font-medium">{worst.label} <span className="text-destructive tabular-nums">{formatCurrency(worst.expense)}</span></p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Month Cash Flow Summary =====
type ComparisonData = { curOther: number; prevOther: number; curLiab: number; prevLiab: number; currentNetWorth: number; prevNetWorth: number };

function CompareChip({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const diff = current - previous;
  if (diff === 0 || previous === 0) return null;
  const pct = Math.round((diff / Math.abs(previous)) * 100);
  const isUp = diff > 0;
  const isGood = invert ? !isUp : isUp;
  return (
    <span className={cn("text-[10px] tabular-nums", isGood ? "text-accent" : "text-destructive")}>
      {isUp ? "↑" : "↓"}{Math.abs(pct)}% ({isUp ? "+" : ""}{formatCurrency(Math.abs(diff))})
    </span>
  );
}

function MonthCashFlowCard({ data, carryOver, loading, cashInHand, comparisonData }: { data: BudgetData | undefined; carryOver: number; loading: boolean; cashInHand?: number; comparisonData?: ComparisonData | null }) {
  const forecast = useEndOfMonthForecast(data, carryOver);
  const { includeCarryOver } = useSettings();

  const { actualIncome, actualExpense, balance, avgDailyExpense, expenseDays } = useMemo(() => {
    if (!data) return { actualIncome: 0, actualExpense: 0, balance: 0, avgDailyExpense: 0, expenseDays: 0 };
    const active = data.transactions.filter((t) => t.type !== "โอน" && t.category !== "โอนระหว่างบัญชี");
    const inc = active.filter((t) => t.type === "รายรับ").reduce((s, t) => s + t.amount, 0);
    const expTx = active.filter((t) => t.type !== "รายรับ");
    const exp = expTx.reduce((s, t) => s + t.amount, 0);
    const uniqueDays = new Set(expTx.map((t) => t.date)).size;
    const avg = uniqueDays > 0 ? exp / uniqueDays : 0;
    const effectiveCarry = includeCarryOver ? carryOver : 0;
    return { actualIncome: inc + effectiveCarry, actualExpense: exp, balance: inc + effectiveCarry - exp, avgDailyExpense: avg, expenseDays: uniqueDays };
  }, [data, carryOver, includeCarryOver]);

  if (loading || !data) return <Skeleton className="h-40 rounded-xl" />;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">สรุปเดือนนี้</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground">รายรับ</p>
            <p className="text-sm font-bold text-accent tabular-nums">{formatCurrency(actualIncome)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">รายจ่าย</p>
            <p className="text-sm font-bold text-destructive tabular-nums">{formatCurrency(actualExpense)}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">คงเหลือ</p>
            <p className={cn("text-sm font-bold tabular-nums", balance >= 0 ? "text-foreground" : "text-destructive")}>
              {formatCurrency(balance)}
            </p>
          </div>
        </div>
        {comparisonData && (
          <div className="grid grid-cols-3 gap-2 text-center border-t pt-2">
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">สินทรัพย์</p>
              <CompareChip current={comparisonData.curOther} previous={comparisonData.prevOther} />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">หนี้สิน</p>
              <CompareChip current={comparisonData.curLiab} previous={comparisonData.prevLiab} invert />
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-muted-foreground">Net Worth</p>
              <CompareChip current={comparisonData.currentNetWorth} previous={comparisonData.prevNetWorth} />
            </div>
          </div>
        )}
        {cashInHand !== undefined && (
          <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">เงินสดในมือ (พร้อมใช้)</p>
            <p className={cn("text-sm font-bold tabular-nums", cashInHand >= 0 ? "text-foreground" : "text-destructive")}>
              {cashInHand < 0 ? "-" : ""}{formatCurrency(Math.abs(cashInHand))}
            </p>
          </div>
        )}
        {forecast && (
          <div className="border-t pt-2 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">คาดการณ์สิ้นเดือน</span>
              <span className={cn("font-semibold tabular-nums", forecast.projectedBalance >= 0 ? "text-accent" : "text-destructive")}>
                {forecast.projectedBalance >= 0 ? "" : "-"}{formatCurrency(Math.abs(forecast.projectedBalance))}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">ใช้จ่ายเฉลี่ย/วัน</span>
              <span className="tabular-nums">{formatCurrency(avgDailyExpense)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">{expenseDays} วันที่มีรายจ่าย · เหลืออีก {forecast.remainingDays} วัน</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ===== Top 5 Spending Categories (donut) =====
const DONUT_COLORS = ["hsl(var(--primary))", "hsl(var(--destructive))", "hsl(var(--accent))", "hsl(var(--debt))", "hsl(var(--saving))"];

function TopSpendingDonut({ data, loading }: { data: BudgetData | undefined; loading: boolean }) {
  const top5 = useMemo(() => {
    if (!data) return [];
    const byCategory: Record<string, number> = {};
    data.transactions
      .filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.category !== "โอนระหว่างบัญชี")
      .forEach((t) => {
        byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount;
      });
    return Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [data]);

  if (loading || !data) return <Skeleton className="h-52 rounded-xl" />;
  if (top5.length === 0) return null;

  const total = top5.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <PiggyBank className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">Top 5 หมวดใช้จ่าย</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="w-28 h-28 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={top5} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={50} paddingAngle={2} strokeWidth={0}>
                  {top5.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-1.5 min-w-0">
            {top5.map((item, i) => {
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : 0;
              return (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  <span className="truncate flex-1">{item.name}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0">{pct}%</span>
                  <span className="tabular-nums font-medium shrink-0">{formatCurrency(item.value)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Recent Transactions (same layout as TransactionTable) =====
function getTypeBadgeClass(type: string) {
  switch (type) {
    case "รายรับ": return "bg-income/15 text-income border-none";
    case "ค่าใช้จ่าย": return "bg-expense/15 text-expense border-none";
    case "หนี้สิน": return "bg-debt/15 text-debt border-none";
    case "บิล/สาธารณูปโภค": return "bg-saving/15 text-saving border-none";
    case "ค่าสมาชิกรายเดือน": return "bg-primary/15 text-primary border-none";
    case "เงินออมและการลงทุน": return "bg-investment/15 text-investment border-none";
    case "โอน": return "bg-muted text-foreground border-none";
    default: return "bg-muted text-muted-foreground border-none";
  }
}

interface RecentTx {
  date: string; description: string; amount: number; type: string;
  category: string; main_category?: string; created_at?: number;
}

function RecentTransactionsTable({ transactions, loading }: { transactions: RecentTx[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 rounded-xl" />;
  if (transactions.length === 0) return null;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">รายการล่าสุด</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">วันที่</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">ประเภท</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">หมวดหมู่</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground hidden md:table-cell">หมวดหมู่ย่อย</th>
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">รายละเอียด</th>
                <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">จำนวน</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx, i) => {
                const isIncome = tx.type === "รายรับ";
                const isTransfer = tx.type === "โอน" || tx.category === "โอนระหว่างบัญชี";
                return (
                  <tr key={i} className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 sm:py-2.5 text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                      <div>{formatThaiDateShort(tx.date)}</div>
                      {tx.created_at && (
                        <div className="text-[10px] text-muted-foreground/60">
                          {new Date(tx.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 sm:py-2.5">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", getTypeBadgeClass(tx.type))}>
                        {tx.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 sm:py-2.5 text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none hidden sm:table-cell">
                      {tx.main_category || tx.category}
                    </td>
                    <td className="px-3 py-2 sm:py-2.5 text-xs sm:text-sm truncate max-w-[100px] sm:max-w-none hidden md:table-cell">
                      {tx.category}
                    </td>
                    <td className="px-3 py-2 sm:py-2.5 text-xs sm:text-sm text-muted-foreground hidden sm:table-cell">
                      {tx.description || "-"}
                    </td>
                    <td className={cn(
                      "px-3 py-2 sm:py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap",
                      isTransfer ? "text-muted-foreground" : isIncome ? "text-accent" : "text-destructive"
                    )}>
                      {isTransfer ? "" : isIncome ? "+" : "-"}{formatCurrency(tx.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Main Page =====
export default function OverviewPage() {
  const { userId } = useAuth();
  const { includeCarryOver } = useSettings();
  const { data: months, isLoading: monthsLoading } = useAvailableMonths();

  // Get last 6 periods
  const periods = useMemo(() => {
    if (!months || months.length === 0) return [];
    return months.slice(0, 6).reverse(); // oldest first for chart
  }, [months]);

  // Load budget data for each period
  const [monthlyData, setMonthlyData] = useState<MonthSummary[]>([]);
  const [recentTx, setRecentTx] = useState<RecentTx[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [prevMonthRaw, setPrevMonthRaw] = useState<{ income: number; expense: number; carryOver: number } | null>(null);

  // Accounts, Goals, trueNetWorth
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [trueNetWorth, setTrueNetWorth] = useState(0);
  const [assetsLoading, setAssetsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    Promise.all([getAccounts(userId), getGoals(userId)])
      .then(([a, g]) => { setAccounts(a); setGoals(g); })
      .finally(() => setAssetsLoading(false));

    // Compute trueNetWorth from all transactions (same logic as AccountsPage)
    import("firebase/firestore").then(({ collection, getDocs }) => {
      import("@/lib/firebase").then(({ firestore }) => {
        getDocs(collection(firestore, "users", userId, "transactions")).then((snap) => {
          let income = 0;
          let expense = 0;
          snap.forEach((d) => {
            const t = d.data();
            if (!t.is_deleted) {
              if (t.type === "income") income += Number(t.amount) || 0;
              if (t.type === "expense") expense += Number(t.amount) || 0;
            }
          });
          setTrueNetWorth(income - expense);
        });
      });
    });
  }, [userId]);

  // Load last 6 months budget data
  const p0 = periods[0]?.period;
  const p5 = periods[periods.length - 1]?.period;

  // We use individual useBudgetData for the latest month (for recent transactions)
  const latestPeriod = months?.[0]?.period;
  const { data: latestData, isLoading: latestLoading } = useBudgetData(latestPeriod);

  const latestCarryOver = latestData?.carryOver ?? 0;
  const latestYear = latestPeriod?.slice(0, 4);
  const { data: walletHistory } = useWalletHistory(latestYear);
  const latestWalletRow = useMemo(
    () => walletHistory?.find((r) => r.period === latestPeriod),
    [walletHistory, latestPeriod]
  );

  const comparisonData = useMemo(() => {
    if (!prevMonthRaw || !latestData || !accounts.length) return null;
    const delta = new Map<string, number>();
    for (const t of latestData.transactions) {
      const isTransfer = t.type === "โอน" || t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี";
      if (t.type === "รายรับ") {
        if (t.to_account_id) delta.set(t.to_account_id, (delta.get(t.to_account_id) ?? 0) + t.amount);
      } else if (isTransfer) {
        if (t.from_account_id) delta.set(t.from_account_id, (delta.get(t.from_account_id) ?? 0) - t.amount);
        if (t.to_account_id) delta.set(t.to_account_id, (delta.get(t.to_account_id) ?? 0) + t.amount);
      } else {
        if (t.from_account_id) delta.set(t.from_account_id, (delta.get(t.from_account_id) ?? 0) - t.amount);
      }
    }
    const main = accounts.find((a) => a.name === "กระเป๋าเงินสดหลัก" && !a.is_deleted)
      ?? accounts.find((a) => a.type === "cash" && !a.is_deleted);
    let curOther = 0, curLiab = 0, prevOther = 0, prevLiab = 0;
    for (const a of accounts.filter((a) => !a.is_deleted)) {
      if (main && a.id === main.id) continue;
      const curBal = Number(a.balance) || 0;
      const prevBal = curBal - (delta.get(a.id) ?? 0);
      if (LIABILITY_TYPES_OVW.has(a.type)) {
        curLiab += Math.abs(curBal);
        prevLiab += Math.abs(prevBal);
      } else {
        curOther += curBal;
        prevOther += prevBal;
      }
    }
    const currentIncome = latestData.transactions.filter((t) => t.type === "รายรับ").reduce((s, t) => s + t.amount, 0);
    const currentExpense = latestData.transactions
      .filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
      .reduce((s, t) => s + t.amount, 0);
    return {
      curOther, prevOther, curLiab, prevLiab,
      currentNetWorth: latestCarryOver + currentIncome - currentExpense,
      prevNetWorth: prevMonthRaw.carryOver + prevMonthRaw.income - prevMonthRaw.expense,
    };
  }, [prevMonthRaw, latestData, accounts, latestCarryOver]);

  // For the 6-month summaries, we query each period individually via Firestore
  useEffect(() => {
    if (!userId || periods.length === 0) return;
    setDataLoading(true);

    import("firebase/firestore").then(({ collection, getDocs, query, where }) => {
      import("@/lib/firebase").then(({ firestore }) => {
        const budgetsCol = collection(firestore, "users", userId, "budgets");
        const txCol = collection(firestore, "users", userId, "transactions");
        const periodStrs = periods.map((p) => p.period);

        Promise.all([
          getDocs(query(budgetsCol, where("period", "in", periodStrs))),
          getDocs(query(txCol, where("month_year", "in", periodStrs))),
        ]).then(([budgetSnap, txSnap]) => {
          // Group transactions by period
          const txByPeriod: Record<string, { amount: number; type: string }[]> = {};
          txSnap.docs.forEach((d) => {
            const data = d.data();
            if (data.is_deleted) return;
            const period = data.month_year as string;
            if (!txByPeriod[period]) txByPeriod[period] = [];
            txByPeriod[period].push({
              amount: (data.amount as number) ?? 0,
              type: (data.type as string) ?? "",
            });
          });

          // Build budgets carry-over map
          const carryOverByPeriod: Record<string, number> = {};
          budgetSnap.docs.forEach((d) => {
            const data = d.data();
            carryOverByPeriod[data.period as string] = (data.carry_over as number) ?? 0;
          });

          const summaries: MonthSummary[] = periods
            .map((p) => {
              const txs = txByPeriod[p.period] ?? [];
              const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0) + (includeCarryOver ? (carryOverByPeriod[p.period] ?? 0) : 0);
              const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
              const savings = income - expense;
              const savingsRate = income > 0 ? (savings / income) * 100 : 0;
              const [, m] = p.period.split("-");
              const label = THAI_MONTHS_SHORT[parseInt(m, 10) - 1];
              const hasTx = txs.length > 0;
              return { period: p.period, label, income, expense, savings, savingsRate, hasTx };
            })
            .filter((s) => s.hasTx); // exclude months with no transactions

          setMonthlyData(summaries);

          // Previous period raw data for comparison (second-to-last sorted period)
          const sortedPeriods = [...periodStrs].sort();
          if (sortedPeriods.length >= 2) {
            const prevPeriod = sortedPeriods[sortedPeriods.length - 2];
            const prevTxs = txByPeriod[prevPeriod] ?? [];
            setPrevMonthRaw({
              income: prevTxs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0),
              expense: prevTxs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0),
              carryOver: carryOverByPeriod[prevPeriod] ?? 0,
            });
          }
        }).finally(() => setDataLoading(false));
      });
    });
  }, [userId, p0, p5, includeCarryOver]);

  // Recent transactions from latest month
  useEffect(() => {
    if (!latestData) return;
    const sorted = [...latestData.transactions].sort((a, b) => {
      // Sort by created_at (newest first), fallback to date string
      if (a.created_at && b.created_at) return b.created_at - a.created_at;
      return b.date.localeCompare(a.date);
    });
    setRecentTx(sorted.slice(0, 10).map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      category: t.category,
      main_category: t.main_category,
      created_at: t.created_at,
    })));
  }, [latestData]);

  const isLoading = monthsLoading || dataLoading;

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger className="hidden md:flex" />
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">ภาพรวม</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <GlobalInsights />
            <ThemeToggle />
            <span className="hidden md:contents">
              <NotificationBell />
              <UserProfilePopover />
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div className="space-y-5">
            {/* Row 1: Cash Flow + Net Worth + Upcoming Bills */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <MonthCashFlowCard data={latestData} carryOver={latestCarryOver} loading={latestLoading} cashInHand={latestWalletRow?.mainWalletBalance} comparisonData={comparisonData} />
              <NetWorthCard accounts={accounts} trueNetWorth={trueNetWorth} loading={assetsLoading} />
              {latestData && <UpcomingBills data={latestData} />}
            </div>

            {/* Row 2: Top 5 Spending + Avg Expense + Accounts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TopSpendingDonut data={latestData} loading={latestLoading} />
              <SixMonthStatsCard data={monthlyData} loading={isLoading} />
              <AccountsSummary accounts={accounts} trueNetWorth={trueNetWorth} loading={assetsLoading} />
            </div>

            {/* Row 3: Trend + Savings Rate */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrendChart data={monthlyData} loading={isLoading} />
              <SavingsRateChart data={monthlyData} loading={isLoading} />
            </div>

            {/* Row 4: Financial Health + Goals */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {latestData && <FinancialHealthCard data={latestData} carryOver={latestCarryOver} />}
              <GoalsMini goals={goals} accounts={accounts} data={latestData} loading={assetsLoading} />
            </div>

            {/* Row 5: Recent Transactions */}
            <RecentTransactionsTable transactions={recentTx} loading={latestLoading} />
          </div>
        </main>

        <AppFooter />
      </div>
    </>
  );
}
