import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { AppFooter } from "@/components/AppFooter";
import { useBudgetData, useAvailableMonths, formatCurrency } from "@/hooks/useBudgetData";
import { useYearlyData } from "@/hooks/useYearlyData";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, PieChart as PieIcon, ArrowUpRight, ArrowDownRight, PiggyBank, Wallet } from "lucide-react";

const COLORS = [
  "hsl(199 89% 48%)", "hsl(166 72% 56%)", "hsl(280 65% 60%)",
  "hsl(30 90% 55%)", "hsl(340 75% 55%)", "hsl(50 90% 50%)",
  "hsl(120 50% 50%)", "hsl(220 70% 60%)", "hsl(0 72% 51%)",
  "hsl(180 60% 45%)", "hsl(260 50% 55%)", "hsl(90 60% 45%)",
];

const Analysis = () => {
  const { data: months, isLoading: monthsLoading } = useAvailableMonths();
  const [selectedYear, setSelectedYear] = useState<string | undefined>();
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | undefined>();

  const years = useMemo(() => {
    if (!months) return [];
    return Array.from(new Set(months.map((m) => m.year))).sort().reverse();
  }, [months]);

  const monthsForYear = useMemo(() => {
    if (!months || !selectedYear) return [];
    return months.filter((m) => m.year === selectedYear);
  }, [months, selectedYear]);

  useEffect(() => {
    if (years.length > 0 && !selectedYear) setSelectedYear(years[0]);
  }, [years, selectedYear]);

  useEffect(() => {
    if (monthsForYear.length > 0) setSelectedMonthKey(monthsForYear[0].month);
  }, [monthsForYear]);

  const selectedPeriod = useMemo(() => {
    if (!selectedYear || !selectedMonthKey) return undefined;
    return `${selectedYear}-${selectedMonthKey}`;
  }, [selectedYear, selectedMonthKey]);

  const { data, isLoading } = useBudgetData(selectedPeriod);
  const { data: yearlyData } = useYearlyData(selectedYear);

  const isPageLoading = isLoading || monthsLoading || !selectedPeriod;

  // Monthly comparison data for the Hero Chart
  const monthlyComparison = useMemo(() => {
    if (!yearlyData) return [];
    const THAI_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return yearlyData.months
      .filter(({ month }) => month <= currentPeriod)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(({ month, data: mData }) => {
        const [, mm] = month.split("-");
        const idx = parseInt(mm, 10) - 1;
        const income = mData.transactions.filter((t) => t.type === "รายรับ").reduce((s, t) => s + t.amount, 0);
        const expense = mData.transactions.filter((t) => t.type !== "รายรับ").reduce((s, t) => s + t.amount, 0);
        const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
        return {
          name: THAI_SHORT[idx] || month,
          รายรับ: income,
          รายจ่าย: expense,
          คงเหลือ: income - expense,
          อัตราการออม: Math.round(savingsRate * 10) / 10,
        };
      });
  }, [yearlyData]);

  // === Computed analytics ===
  const analytics = useMemo(() => {
    if (!data) return null;

    const incomeTransactions = data.transactions.filter((t) => t.type === "รายรับ");
    const expenseTransactions = data.transactions.filter((t) => t.type !== "รายรับ");

    const totalIncome = incomeTransactions.reduce((s, t) => s + t.amount, 0);
    const totalExpense = expenseTransactions.reduce((s, t) => s + t.amount, 0);
    const netBalance = totalIncome - totalExpense;

    // Category breakdown for expenses
    const categorySpend: Record<string, number> = {};
    expenseTransactions.forEach((t) => {
      categorySpend[t.category] = (categorySpend[t.category] || 0) + t.amount;
    });

    const pieData = Object.entries(categorySpend)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    // Budget performance
    const allBudgetItems = [
      ...data.expenses.general.map((b) => ({ ...b, group: "ค่าใช้จ่าย" })),
      ...data.expenses.bills.map((b) => ({ ...b, group: "บิล/สาธารณูปโภค" })),
      ...data.expenses.debts.map((b) => ({ ...b, group: "หนี้สิน" })),
      ...data.expenses.subscriptions.map((b) => ({ ...b, group: "ค่าสมาชิกรายเดือน" })),
      ...data.expenses.savings.map((b) => ({ ...b, group: "เงินออม/การลงทุน" })),
    ];

    const budgetPerformance = allBudgetItems
      .filter((b) => b.budget > 0 || (categorySpend[b.label] || 0) > 0)
      .map((b) => {
        const actual = categorySpend[b.label] || 0;
        const pct = b.budget > 0 ? (actual / b.budget) * 100 : actual > 0 ? 999 : 0;
        return {
          label: b.label,
          group: b.group,
          budget: b.budget,
          actual,
          diff: b.budget - actual,
          pct,
          status: pct > 100 ? "over" : pct === 100 ? "full" : pct > 80 ? "warning" : "ok",
        };
      })
      .sort((a, b) => b.pct - a.pct);

    // Expense type breakdown
    const typeBreakdown: Record<string, number> = {};
    expenseTransactions.forEach((t) => {
      typeBreakdown[t.type] = (typeBreakdown[t.type] || 0) + t.amount;
    });
    const typeData = Object.entries(typeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    return {
      totalIncome,
      totalExpense,
      netBalance,
      pieData,
      budgetPerformance,
      typeData,
      transactionCount: data.transactions.length,
    };
  }, [data]);

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen bg-muted/10">
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <PieIcon className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">ภาพรวมการวิเคราะห์</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden space-y-6 max-w-7xl mx-auto w-full">
          
          {/* Top Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage className="flex items-center gap-1">
                    <PieIcon className="h-4 w-4" />
                    <span className="hidden sm:inline">วิเคราะห์ทางการเงิน</span>
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-2">
              {years.length > 0 && (
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-28 bg-card border-border shadow-sm text-xs h-9">
                    <SelectValue placeholder="ปี" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border shadow-lg z-50">
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>{String(Number(y) + 543)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {monthsForYear.length > 0 && (
                <Select value={selectedMonthKey} onValueChange={setSelectedMonthKey}>
                  <SelectTrigger className="w-32 bg-card border-border shadow-sm text-xs h-9">
                    <SelectValue placeholder="เดือน" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border shadow-lg z-50">
                    {monthsForYear.map((m) => (
                      <SelectItem key={m.month} value={m.month}>{m.monthName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {isPageLoading ? (
            <div className="space-y-6">
              <Skeleton className="h-[400px] w-full rounded-2xl" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Skeleton className="h-80 rounded-2xl" />
                <Skeleton className="h-80 rounded-2xl" />
              </div>
            </div>
          ) : !data || !analytics ? (
            <div className="flex items-center justify-center h-64 border border-dashed rounded-2xl">
              <p className="text-muted-foreground">ไม่พบข้อมูลในเดือนที่เลือก</p>
            </div>
          ) : (
            <>
              {/* ===== HERO CHART SECTION (ตามรูปภาพอ้างอิง) ===== */}
              <Card className="border-border/50 shadow-sm overflow-hidden bg-card/40 backdrop-blur-md">
                <CardHeader className="pb-0 pt-6 px-6 sm:px-8">
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-muted-foreground">ยอดคงเหลือสุทธิ (Net Balance)</p>
                    <div className="flex items-baseline gap-3">
                      <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground font-display">
                        ฿ {formatCurrency(analytics.netBalance)}
                      </h2>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="p-0">
                  {/* Area Chart - Monthly Net Balance */}
                  <div className="h-[220px] w-full mt-6 px-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlyComparison} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <RechartsTooltip
                          formatter={(value: number) => ["฿ " + formatCurrency(value), "คงเหลือ"]}
                          contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "13px", fontWeight: 500 }}
                          itemStyle={{ color: "#10b981" }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="คงเหลือ" 
                          stroke="#10b981" 
                          strokeWidth={3}
                          fillOpacity={1} 
                          fill="url(#colorNet)" 
                          activeDot={{ r: 6, fill: "#10b981", stroke: "hsl(var(--background))", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 3 Summary Cards Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border border-t border-border bg-muted/20">
                    
                    {/* Income */}
                    <div className="p-6 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                      <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                        <ArrowDownRight className="h-6 w-6 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">รายรับรวม</p>
                        <p className="text-xl font-semibold text-foreground mt-0.5">฿ {formatCurrency(analytics.totalIncome)}</p>
                      </div>
                    </div>

                    {/* Expenses */}
                    <div className="p-6 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                      <div className="h-12 w-12 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
                        <ArrowUpRight className="h-6 w-6 text-rose-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">รายจ่ายรวม</p>
                        <p className="text-xl font-semibold text-foreground mt-0.5">฿ {formatCurrency(analytics.totalExpense)}</p>
                      </div>
                    </div>

                    {/* Savings / Investments */}
                    <div className="p-6 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                      <div className="h-12 w-12 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <PiggyBank className="h-6 w-6 text-indigo-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">เงินออม / คงเหลือ</p>
                        <p className="text-xl font-semibold text-foreground mt-0.5">฿ {formatCurrency(analytics.netBalance)}</p>
                      </div>
                    </div>

                  </div>
                </CardContent>
              </Card>

              {/* ===== DETAILED ANALYTICS (รักษาฟีเจอร์เดิมไว้แต่ปรับ UI) ===== */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
                
                {/* Pie Chart: Expense Breakdown */}
                <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold">สัดส่วนรายจ่ายตามหมวดหมู่</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {analytics.pieData.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-12">ยังไม่มีการบันทึกรายจ่าย</p>
                    ) : (
                      <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
                        <div className="h-[200px] w-full sm:w-[200px] shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={analytics.pieData}
                                cx="50%" cy="50%"
                                innerRadius={60} outerRadius={85}
                                paddingAngle={3}
                                dataKey="value"
                                stroke="none"
                              >
                                {analytics.pieData.map((_, i) => (
                                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                              </Pie>
                              <RechartsTooltip
                                formatter={(value: number) => formatCurrency(value) + " ฿"}
                                contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))", fontSize: "12px" }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex-1 w-full space-y-2.5">
                          {analytics.pieData.slice(0, 5).map((item, i) => (
                            <div key={item.name} className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2.5">
                                <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                                <span className="truncate max-w-[140px] text-muted-foreground">{item.name}</span>
                              </div>
                              <span className="font-medium tabular-nums text-foreground">฿ {formatCurrency(item.value)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Bar Chart: Expense Type */}
                {analytics.typeData.length > 0 && (
                  <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">สรุปตามประเภทรายจ่าย</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[230px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.typeData} margin={{ top: 5, right: 0, left: -20, bottom: 0 }} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} axisLine={false} tickLine={false} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} axisLine={false} tickLine={false} />
                            <RechartsTooltip
                              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                              formatter={(value: number) => formatCurrency(value) + " ฿"}
                              contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))", fontSize: "12px" }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                              {analytics.typeData.map((_, i) => (
                                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Budget Performance Table */}
              <Card className="border-border/50 shadow-sm bg-card/40 backdrop-blur-md mt-6">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-semibold">ประสิทธิภาพงบประมาณรายหมวดหมู่</CardTitle>
                </CardHeader>
                <CardContent className="px-0 sm:px-6">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-border/50">
                          <TableHead className="text-xs">หมวดหมู่</TableHead>
                          <TableHead className="text-xs text-right">งบประมาณตั้งไว้</TableHead>
                          <TableHead className="text-xs text-right">ใช้จริง</TableHead>
                          <TableHead className="text-xs text-right">ส่วนต่าง</TableHead>
                          <TableHead className="text-xs text-center">สถานะ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.budgetPerformance.map((item) => (
                          <TableRow key={item.label} className="border-border/30 hover:bg-muted/30">
                            <TableCell>
                              <p className="text-sm font-medium">{item.label}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{item.group}</p>
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums text-muted-foreground">{formatCurrency(item.budget)}</TableCell>
                            <TableCell className="text-sm text-right tabular-nums font-medium text-foreground">{formatCurrency(item.actual)}</TableCell>
                            <TableCell className={`text-sm text-right tabular-nums font-medium ${item.diff >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              {item.diff >= 0 ? "+" : ""}{formatCurrency(item.diff)}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.status === "over" ? (
                                <Badge variant="destructive" className="text-[10px] px-2 py-0.5 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 border-none">เกินงบ ({item.pct.toFixed(0)}%)</Badge>
                              ) : item.status === "full" ? (
                                <Badge className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-none">เต็มงบ</Badge>
                              ) : item.status === "warning" ? (
                                <Badge className="text-[10px] px-2 py-0.5 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-none">ใกล้เต็ม ({item.pct.toFixed(0)}%)</Badge>
                              ) : (
                                <Badge className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-none">ปกติ ({item.pct.toFixed(0)}%)</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </main>
        <AppFooter />
      </div>
    </>
  );
};

export default Analysis;
