import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppFooter } from "@/components/AppFooter";
import { useAuth } from "@/contexts/AuthContext";
import { useAvailableMonths, useBudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { getAccounts, getGoals, getInvestments } from "@/lib/firestore-services";
import type { Account, Goal, Investment } from "@/types/finance";
import { cn } from "@/lib/utils";
import {
  Eye, TrendingUp, TrendingDown, Wallet, Target, CreditCard, PiggyBank,
  ArrowUpRight, ArrowDownRight, Minus, Receipt,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as ReTooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend,
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
function GoalsMini({ goals, loading }: { goals: Goal[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-36 rounded-xl" />;
  const active = goals.filter((g) => g.status === "active" && !g.is_deleted);
  if (active.length === 0) return null;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">เป้าหมาย</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {active.map((g) => {
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
            {/* Row 1: Recent Transactions (top) */}
            <RecentTransactionsTable transactions={recentTx} loading={latestLoading} />

            {/* Row 2: Net Worth + Avg Expense + Accounts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <NetWorthCard accounts={accounts} trueNetWorth={trueNetWorth} loading={assetsLoading} />
              <AvgExpenseCard data={monthlyData} loading={isLoading} />
              <AccountsSummary accounts={accounts} trueNetWorth={trueNetWorth} loading={assetsLoading} />
            </div>

            {/* Row 3: Trend + Savings Rate side by side on desktop */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <TrendChart data={monthlyData} loading={isLoading} />
              <SavingsRateChart data={monthlyData} loading={isLoading} />
            </div>

            {/* Row 4: Goals */}
            <GoalsMini goals={goals} loading={assetsLoading} />
          </div>
        </main>

        <AppFooter />
      </div>
    </>
  );
}
