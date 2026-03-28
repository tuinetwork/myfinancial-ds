import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import type { Account } from "@/types/finance";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calculator, Calendar, Eye, EyeOff, TrendingDown, ArrowRight, CheckCircle2 } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";
import { cn } from "@/lib/utils";

function formatBaht(v: number, privacy: boolean) {
  if (privacy) return "฿***";
  return `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

interface DebtEntry {
  name: string;
  balance: number;
  type: string;
}

interface PlanResult {
  debts: DebtEntry[];
  totalDebt: number;
  months: number;
  years: number;
  remainingMonths: number;
  totalPaid: number;
  debtFreeDate: Date;
  timeline: { month: number; totalRemaining: number }[];
}

function simulatePlan(
  liabilities: Account[],
  payment: number,
  strategy: "snowball" | "avalanche"
): PlanResult | null {
  if (payment <= 0 || liabilities.length === 0) return null;

  const debts = liabilities
    .map((a) => ({ name: a.name, balance: Math.abs(Number(a.balance) || 0), type: a.type }))
    .filter((d) => d.balance > 0);

  if (debts.length === 0) return null;

  const sorted = [...debts].sort((a, b) =>
    strategy === "snowball" ? a.balance - b.balance : b.balance - a.balance
  );

  const totalDebt = sorted.reduce((s, d) => s + d.balance, 0);
  const remaining = sorted.map((d) => d.balance);
  let months = 0;
  const maxMonths = 360;
  const timeline: { month: number; totalRemaining: number }[] = [{ month: 0, totalRemaining: totalDebt }];

  while (remaining.some((r) => r > 0) && months < maxMonths) {
    months++;
    let leftover = payment;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] <= 0) continue;
      const pay = Math.min(remaining[i], leftover);
      remaining[i] -= pay;
      leftover -= pay;
      if (leftover <= 0) break;
    }
    const totalRemaining = remaining.reduce((s, r) => s + r, 0);
    timeline.push({ month: months, totalRemaining: Math.max(0, totalRemaining) });
  }

  const debtFreeDate = new Date();
  debtFreeDate.setMonth(debtFreeDate.getMonth() + months);

  return {
    debts: sorted,
    totalDebt,
    months,
    years: Math.floor(months / 12),
    remainingMonths: months % 12,
    totalPaid: payment * months,
    debtFreeDate,
    timeline,
  };
}

export default function DebtPlannerPage() {
  const { userId } = useAuth();
  const { privacyMode, togglePrivacy } = usePrivacy();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyPayment, setMonthlyPayment] = useState<string>("5000");
  const [strategy, setStrategy] = useState<"avalanche" | "snowball">("snowball");

  useEffect(() => {
    if (!userId) return;
    const col = collection(firestore, "users", userId, "accounts");
    return onSnapshot(col, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
      setAccounts(list);
      setLoading(false);
    });
  }, [userId]);

  const liabilityAccounts = useMemo(
    () => accounts.filter((a) => a.is_active && ["credit_card", "loan", "payable"].includes(a.type)),
    [accounts]
  );

  const totalDebt = liabilityAccounts.reduce((s, a) => s + Math.abs(Number(a.balance) || 0), 0);
  const payment = parseFloat(monthlyPayment) || 0;

  const snowballPlan = useMemo(
    () => simulatePlan(liabilityAccounts, payment, "snowball"),
    [liabilityAccounts, payment]
  );
  const avalanchePlan = useMemo(
    () => simulatePlan(liabilityAccounts, payment, "avalanche"),
    [liabilityAccounts, payment]
  );

  const activePlan = strategy === "snowball" ? snowballPlan : avalanchePlan;

  // Progress: total paid so far this month toward debts (estimated from budget)
  // Since we don't have initial_balance, show proportion of each debt
  const paidSoFar = totalDebt > 0 && activePlan ? Math.max(0, activePlan.totalDebt - totalDebt) : 0;
  const progressPct = activePlan && activePlan.totalDebt > 0
    ? Math.round((paidSoFar / activePlan.totalDebt) * 100)
    : 0;

  // Combined timeline for comparison chart
  const comparisonData = useMemo(() => {
    if (!snowballPlan || !avalanchePlan) return [];
    const maxLen = Math.max(snowballPlan.timeline.length, avalanchePlan.timeline.length);
    const data: { month: number; snowball: number; avalanche: number }[] = [];
    for (let i = 0; i < maxLen; i++) {
      data.push({
        month: snowballPlan.timeline[i]?.month ?? avalanchePlan.timeline[i]?.month ?? i,
        snowball: snowballPlan.timeline[i]?.totalRemaining ?? 0,
        avalanche: avalanchePlan.timeline[i]?.totalRemaining ?? 0,
      });
    }
    return data;
  }, [snowballPlan, avalanchePlan]);

  const fmt = (v: number) => formatBaht(v, privacyMode);

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-destructive" />
              <h1 className="text-lg font-semibold">แผนปลดหนี้</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={togglePrivacy} className="h-9 w-9">
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">กำลังโหลด...</p>
              </div>
            ) : totalDebt <= 0 ? (
              <Card className="border-none shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <CheckCircle2 className="h-12 w-12 text-accent mb-4" />
                  <p className="text-lg font-semibold text-foreground">ไม่มีหนี้สิน</p>
                  <p className="text-sm text-muted-foreground mt-1">คุณไม่มีบัญชีหนี้สินที่ใช้งานอยู่</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Row 1: Settings + Progress */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <Card className="border-none shadow-sm xl:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">ตั้งค่าแผน</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-xs">จ่ายต่อเดือน (฿)</Label>
                          <Input
                            type="number"
                            value={monthlyPayment}
                            onChange={(e) => setMonthlyPayment(e.target.value)}
                            className="mt-1"
                            placeholder="5,000"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">กลยุทธ์</Label>
                          <Select value={strategy} onValueChange={(v) => setStrategy(v as "avalanche" | "snowball")}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="snowball">Snowball (หนี้น้อยก่อน)</SelectItem>
                              <SelectItem value="avalanche">Avalanche (หนี้มากก่อน)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Progress card */}
                  <Card className="border-none shadow-sm bg-gradient-to-br from-card to-destructive/5">
                    <CardContent className="p-5 flex flex-col justify-center h-full">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingDown className="h-4 w-4 text-destructive" />
                        <p className="text-sm font-semibold">ความคืบหน้า</p>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>จ่ายแล้ว {fmt(paidSoFar)}</span>
                          <span>คงเหลือ {fmt(totalDebt)}</span>
                        </div>
                        <Progress
                          value={progressPct}
                          className="h-3 [&>div]:bg-destructive"
                        />
                        <p className="text-center text-xs text-muted-foreground">
                          {progressPct}% ของหนี้ทั้งหมด
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Row 2: Debt list + Plan summary */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  {/* Debt list */}
                  <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">หนี้สินทั้งหมด</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {liabilityAccounts
                        .filter((a) => Math.abs(Number(a.balance) || 0) > 0)
                        .sort((a, b) =>
                          strategy === "snowball"
                            ? Math.abs(Number(a.balance)) - Math.abs(Number(b.balance))
                            : Math.abs(Number(b.balance)) - Math.abs(Number(a.balance))
                        )
                        .map((acc, i) => {
                          const bal = Math.abs(Number(acc.balance) || 0);
                          const pct = totalDebt > 0 ? (bal / totalDebt) * 100 : 0;
                          return (
                            <div key={acc.id} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className="flex items-center gap-2">
                                  <span className="w-5 h-5 rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-[10px] font-bold shrink-0">
                                    {i + 1}
                                  </span>
                                  <span className="truncate text-muted-foreground">{acc.name}</span>
                                </span>
                                <span className="font-medium text-destructive">{fmt(bal)}</span>
                              </div>
                              <Progress value={pct} className="h-1.5 [&>div]:bg-destructive/60" />
                            </div>
                          );
                        })}
                      <div className="flex items-center justify-between text-sm font-semibold border-t pt-3 mt-3">
                        <span>หนี้สินรวม</span>
                        <span className="text-destructive">{fmt(totalDebt)}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Plan result */}
                  {activePlan && (
                    <Card className="border-none shadow-sm xl:col-span-2 border-l-4 border-l-destructive">
                      <CardContent className="p-6 space-y-5">
                        {/* Summary stats */}
                        <div className="grid grid-cols-3 gap-4">
                          <div className="text-center">
                            <p className="text-3xl font-bold font-display text-destructive">
                              {activePlan.years > 0 ? `${activePlan.years} ปี` : ""}
                              {activePlan.remainingMonths > 0 ? ` ${activePlan.remainingMonths} ด.` : ""}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">ระยะเวลาปลดหนี้</p>
                          </div>
                          <div className="text-center">
                            <p className="text-3xl font-bold font-display text-foreground">
                              {privacyMode ? "***" : fmt(activePlan.totalPaid)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">จ่ายรวม</p>
                          </div>
                          <div className="text-center">
                            <p className="text-3xl font-bold font-display text-foreground">
                              {privacyMode ? "***" : fmt(payment)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">จ่าย/เดือน</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          <span>
                            ปลดหนี้ได้ภายใน{" "}
                            {activePlan.debtFreeDate.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}
                          </span>
                        </div>

                        {/* Timeline chart */}
                        {activePlan.timeline.length > 1 && (
                          <div className="h-52">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={activePlan.timeline} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                                <XAxis
                                  dataKey="month"
                                  axisLine={false}
                                  tickLine={false}
                                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                  tickFormatter={(v) => `${v}ด.`}
                                />
                                <YAxis
                                  axisLine={false}
                                  tickLine={false}
                                  tickFormatter={(val) => privacyMode ? "***" : `${(val / 1000).toFixed(0)}k`}
                                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                  width={45}
                                />
                                <Tooltip
                                  formatter={(value: number) => [fmt(value), "หนี้คงเหลือ"]}
                                  labelFormatter={(v) => `เดือนที่ ${v}`}
                                  contentStyle={{
                                    borderRadius: "8px",
                                    border: "1px solid hsl(var(--border))",
                                    backgroundColor: "hsl(var(--card))",
                                    fontSize: "12px",
                                  }}
                                />
                                <Bar dataKey="totalRemaining" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} opacity={0.7} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}

                        {/* Priority order */}
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-muted-foreground">
                            ลำดับการชำระ ({strategy === "snowball" ? "Snowball" : "Avalanche"}):
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            {activePlan.debts.map((d, i) => (
                              <div key={d.name} className="flex items-center gap-1.5">
                                {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive">
                                  <span className="font-bold">{i + 1}</span>
                                  {d.name}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Row 3: Strategy comparison */}
                {snowballPlan && avalanchePlan && (
                  <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">เปรียบเทียบกลยุทธ์</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Comparison cards */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div
                          className={cn(
                            "rounded-lg p-4 cursor-pointer transition-all",
                            strategy === "snowball"
                              ? "bg-primary/10 border-2 border-primary ring-1 ring-primary/20"
                              : "bg-muted/50 border border-border hover:bg-muted"
                          )}
                          onClick={() => setStrategy("snowball")}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-semibold text-sm">Snowball</p>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-medium">
                              หนี้น้อยก่อน
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-center">
                            <div>
                              <p className="text-xl font-bold font-display">
                                {snowballPlan.years > 0 ? `${snowballPlan.years}ปี ` : ""}
                                {snowballPlan.remainingMonths}ด.
                              </p>
                              <p className="text-[11px] text-muted-foreground">ระยะเวลา</p>
                            </div>
                            <div>
                              <p className="text-xl font-bold font-display">
                                {privacyMode ? "***" : fmt(snowballPlan.totalPaid)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">จ่ายรวม</p>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            ✓ เห็นผลเร็ว สร้างกำลังใจ — จ่ายหนี้ก้อนเล็กหมดก่อน
                          </p>
                        </div>

                        <div
                          className={cn(
                            "rounded-lg p-4 cursor-pointer transition-all",
                            strategy === "avalanche"
                              ? "bg-primary/10 border-2 border-primary ring-1 ring-primary/20"
                              : "bg-muted/50 border border-border hover:bg-muted"
                          )}
                          onClick={() => setStrategy("avalanche")}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <p className="font-semibold text-sm">Avalanche</p>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 font-medium">
                              หนี้มากก่อน
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-center">
                            <div>
                              <p className="text-xl font-bold font-display">
                                {avalanchePlan.years > 0 ? `${avalanchePlan.years}ปี ` : ""}
                                {avalanchePlan.remainingMonths}ด.
                              </p>
                              <p className="text-[11px] text-muted-foreground">ระยะเวลา</p>
                            </div>
                            <div>
                              <p className="text-xl font-bold font-display">
                                {privacyMode ? "***" : fmt(avalanchePlan.totalPaid)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">จ่ายรวม</p>
                            </div>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            ✓ ประหยัดกว่า — จ่ายหนี้ก้อนใหญ่ที่กินเงินมากก่อน
                          </p>
                        </div>
                      </div>

                      {/* Difference highlight */}
                      {snowballPlan.months !== avalanchePlan.months && (
                        <div className="text-center text-xs text-muted-foreground bg-muted/30 rounded-lg py-2">
                          {snowballPlan.months < avalanchePlan.months
                            ? `Snowball เร็วกว่า ${avalanchePlan.months - snowballPlan.months} เดือน (ประหยัด ${fmt(avalanchePlan.totalPaid - snowballPlan.totalPaid)})`
                            : `Avalanche เร็วกว่า ${snowballPlan.months - avalanchePlan.months} เดือน (ประหยัด ${fmt(snowballPlan.totalPaid - avalanchePlan.totalPaid)})`}
                        </div>
                      )}

                      {/* Comparison line chart */}
                      {comparisonData.length > 2 && (
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={comparisonData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis
                                dataKey="month"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                tickFormatter={(v) => `${v}ด.`}
                              />
                              <YAxis
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(val) => privacyMode ? "***" : `${(val / 1000).toFixed(0)}k`}
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                width={45}
                              />
                              <Tooltip
                                formatter={(value: number, name: string) => [
                                  fmt(value),
                                  name === "snowball" ? "Snowball" : "Avalanche",
                                ]}
                                labelFormatter={(v) => `เดือนที่ ${v}`}
                                contentStyle={{
                                  borderRadius: "8px",
                                  border: "1px solid hsl(var(--border))",
                                  backgroundColor: "hsl(var(--card))",
                                  fontSize: "12px",
                                }}
                              />
                              <Legend
                                formatter={(value) => (value === "snowball" ? "Snowball" : "Avalanche")}
                                wrapperStyle={{ fontSize: "12px" }}
                              />
                              <Line
                                type="monotone"
                                dataKey="snowball"
                                stroke="hsl(210 80% 55%)"
                                strokeWidth={2}
                                dot={false}
                              />
                              <Line
                                type="monotone"
                                dataKey="avalanche"
                                stroke="hsl(25 90% 55%)"
                                strokeWidth={2}
                                dot={false}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </main>
        <AppFooter />
      </div>
    </>
  );
}
