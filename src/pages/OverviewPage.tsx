import { useState, useEffect, useMemo } from "react";
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
import { UpcomingBills } from "@/components/UpcomingBills";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, CartesianGrid, LineChart, Line,
  PieChart, Pie, Cell,
} from "recharts";

// ===== Helpers =====
const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

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
  if (loading) return <Skeleton className="h-36 rounded-xl" />;

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
function AvgExpenseCard({ data, loading }: { data: MonthSummary[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-40 rounded-xl" />;
  if (data.length < 2) return null;

  const avg = data.reduce((s, d) => s + d.expense, 0) / data.length;
  const current = data[data.length - 1];
  const diff = current.expense - avg;
  const diffPct = avg > 0 ? ((diff / avg) * 100) : 0;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">ค่าใช้จ่ายเฉลี่ย/เดือน</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-2xl font-bold font-display tabular-nums">{formatCurrency(avg)}</p>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">{current.label}:</span>
          <span className="font-semibold tabular-nums">{formatCurrency(current.expense)}</span>
          {diff !== 0 && (
            <span className={cn("flex items-center gap-0.5 ml-1", diff > 0 ? "text-destructive" : "text-accent")}>
              {diff > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(diffPct).toFixed(0)}%
            </span>
          )}
          {diff === 0 && <Minus className="h-3 w-3 text-muted-foreground ml-1" />}
        </div>
      </CardContent>
    </Card>
  );
}

// ===== Month Cash Flow Summary =====
function MonthCashFlowCard({ data, carryOver, loading }: { data: BudgetData | undefined; carryOver: number; loading: boolean }) {
  if (loading || !data) return <Skeleton className="h-40 rounded-xl" />;

  const forecast = useEndOfMonthForecast(data, carryOver);

  const { actualIncome, actualExpense, balance } = useMemo(() => {
    const inc = data.transactions.filter((t) => t.type === "รายรับ").reduce((s, t) => s + t.amount, 0);
    const exp = data.transactions.filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.category !== "โอนระหว่างบัญชี").reduce((s, t) => s + t.amount, 0);
    return { actualIncome: inc + carryOver, actualExpense: exp, balance: inc + carryOver - exp };
  }, [data, carryOver]);

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
              <span className="tabular-nums">{formatCurrency(forecast.dailyBurnRate)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">เหลืออีก</span>
              <span className="tabular-nums">{forecast.remainingDays} วัน</span>
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
  if (loading || !data) return <Skeleton className="h-52 rounded-xl" />;

  const top5 = useMemo(() => {
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

          const summaries: MonthSummary[] = periods.map((p) => {
            const txs = txByPeriod[p.period] ?? [];
            const income = txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0) + (carryOverByPeriod[p.period] ?? 0);
            const expense = txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
            const savings = income - expense;
            const savingsRate = income > 0 ? (savings / income) * 100 : 0;
            const [, m] = p.period.split("-");
            const label = THAI_MONTHS_SHORT[parseInt(m, 10) - 1];
            return { period: p.period, label, income, expense, savings, savingsRate };
          });

          setMonthlyData(summaries);
        }).finally(() => setDataLoading(false));
      });
    });
  }, [userId, p0, p5]);

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

  const latestCarryOver = latestData?.carryOver ?? 0;
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
              <MonthCashFlowCard data={latestData} carryOver={latestCarryOver} loading={latestLoading} />
              <NetWorthCard accounts={accounts} trueNetWorth={trueNetWorth} loading={assetsLoading} />
              {latestData && <UpcomingBills data={latestData} />}
            </div>

            {/* Row 2: Top 5 Spending + Avg Expense + Accounts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <TopSpendingDonut data={latestData} loading={latestLoading} />
              <AvgExpenseCard data={monthlyData} loading={isLoading} />
              <AccountsSummary accounts={accounts} trueNetWorth={trueNetWorth} loading={assetsLoading} />
            </div>

            {/* Row 3: Trend + Savings Rate */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrendChart data={monthlyData} loading={isLoading} />
              <SavingsRateChart data={monthlyData} loading={isLoading} />
            </div>

            {/* Row 4: Goals */}
            <GoalsMini goals={goals} accounts={accounts} data={latestData} loading={assetsLoading} />

            {/* Row 5: Recent Transactions */}
            <RecentTransactionsTable transactions={recentTx} loading={latestLoading} />
          </div>
        </main>

        <AppFooter />
      </div>
    </>
  );
}
