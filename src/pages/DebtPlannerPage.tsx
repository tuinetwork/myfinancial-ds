import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import type { Account } from "@/types/finance";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calculator, Calendar, Eye, EyeOff } from "lucide-react";
import { AppFooter } from "@/components/AppFooter";

function formatBalance(v: number, privacyMode: boolean) {
  if (privacyMode) return "฿***";
  return `฿${v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const plan = useMemo(() => {
    const payment = parseFloat(monthlyPayment) || 0;
    if (payment <= 0 || liabilityAccounts.length === 0) return null;

    const debts = liabilityAccounts
      .map((a) => ({
        name: a.name,
        balance: Math.abs(Number(a.balance) || 0),
        type: a.type,
      }))
      .filter((d) => d.balance > 0);

    if (debts.length === 0) return null;

    const sorted = [...debts].sort((a, b) =>
      strategy === "snowball" ? a.balance - b.balance : b.balance - a.balance
    );

    const totalDebtCalc = sorted.reduce((s, d) => s + d.balance, 0);
    const remaining = sorted.map((d) => d.balance);
    let months = 0;
    const maxMonths = 360;
    const timeline: { month: number; totalRemaining: number }[] = [];

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
      if (months % 3 === 0 || totalRemaining <= 0) {
        timeline.push({ month: months, totalRemaining: Math.max(0, totalRemaining) });
      }
    }

    const debtFreeDate = new Date();
    debtFreeDate.setMonth(debtFreeDate.getMonth() + months);

    return {
      debts: sorted,
      totalDebt: totalDebtCalc,
      months,
      years: Math.floor(months / 12),
      remainingMonths: months % 12,
      totalPaid: payment * months,
      debtFreeDate,
      timeline,
    };
  }, [liabilityAccounts, monthlyPayment, strategy]);

  const fmt = (v: number) => formatBalance(v, privacyMode);

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
          <div className="max-w-4xl mx-auto space-y-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">กำลังโหลด...</p>
              </div>
            ) : totalDebt <= 0 ? (
              <Card className="border-none shadow-sm">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <Calculator className="h-12 w-12 text-muted-foreground/30 mb-4" />
                  <p className="text-lg font-semibold text-foreground">ไม่มีหนี้สิน</p>
                  <p className="text-sm text-muted-foreground mt-1">คุณไม่มีบัญชีหนี้สินที่ใช้งานอยู่</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Input controls */}
                <Card className="border-none shadow-sm">
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

                {/* Debt list */}
                <Card className="border-none shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold">หนี้สินทั้งหมด</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {liabilityAccounts
                      .filter((a) => Math.abs(Number(a.balance) || 0) > 0)
                      .map((acc) => {
                        const bal = Math.abs(Number(acc.balance) || 0);
                        return (
                          <div key={acc.id} className="flex items-center justify-between text-sm">
                            <span className="truncate text-muted-foreground">{acc.name}</span>
                            <span className="font-medium text-destructive">{fmt(bal)}</span>
                          </div>
                        );
                      })}
                    <div className="flex items-center justify-between text-sm font-semibold border-t pt-2">
                      <span>หนี้สินรวม</span>
                      <span className="text-destructive">{fmt(totalDebt)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Plan result */}
                {plan && (
                  <Card className="border-none shadow-sm border-l-4 border-l-destructive">
                    <CardContent className="p-6 space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center">
                          <p className="text-3xl font-bold font-display text-destructive">
                            {plan.years > 0 ? `${plan.years} ปี` : ""}
                            {plan.remainingMonths > 0 ? ` ${plan.remainingMonths} ด.` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">ระยะเวลาปลดหนี้</p>
                        </div>
                        <div className="text-center">
                          <p className="text-3xl font-bold font-display text-foreground">
                            {privacyMode
                              ? "***"
                              : `฿${plan.totalPaid.toLocaleString("th-TH", { maximumFractionDigits: 0 })}`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">จ่ายรวม</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          ปลดหนี้ได้ภายใน{" "}
                          {plan.debtFreeDate.toLocaleDateString("th-TH", { month: "long", year: "numeric" })}
                        </span>
                      </div>

                      {/* Timeline chart */}
                      {plan.timeline.length > 1 && (
                        <div className="h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={plan.timeline} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
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
                                tickFormatter={(val) =>
                                  privacyMode ? "***" : `${(val / 1000).toFixed(0)}k`
                                }
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
                              <Bar
                                dataKey="totalRemaining"
                                fill="hsl(var(--destructive))"
                                radius={[4, 4, 0, 0]}
                                opacity={0.7}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {/* Priority order */}
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">
                          ลำดับการชำระ ({strategy === "snowball" ? "Snowball" : "Avalanche"}):
                        </p>
                        {plan.debts.map((d, i) => (
                          <div key={d.name} className="flex items-center gap-3 text-sm">
                            <span className="w-6 h-6 rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-xs font-bold shrink-0">
                              {i + 1}
                            </span>
                            <span className="truncate text-muted-foreground">{d.name}</span>
                            <span className="ml-auto font-medium">{fmt(d.balance)}</span>
                          </div>
                        ))}
                      </div>
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
