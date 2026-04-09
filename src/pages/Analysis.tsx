import { useState, useMemo } from "react";
import { expandRecurrence } from "@/lib/recurrence";
import { useSearchParams } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { ThemeToggle } from "@/components/ThemeToggle";
import { GlobalInsights } from "@/components/GlobalInsights";
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
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, PieChart as PieIcon } from "lucide-react";
import { useEffect } from "react";

const COLORS = [
  "hsl(199 89% 48%)", "hsl(166 72% 56%)", "hsl(280 65% 60%)",
  "hsl(30 90% 55%)", "hsl(340 75% 55%)", "hsl(50 90% 50%)",
  "hsl(120 50% 50%)", "hsl(220 70% 60%)", "hsl(0 72% 51%)",
  "hsl(180 60% 45%)", "hsl(260 50% 55%)", "hsl(90 60% 45%)",
];

const EXPENSE_TYPE_MAP: Record<string, string> = {
  "ค่าใช้จ่าย": "general",
  "บิล/สาธารณูปโภค": "bills",
  "หนี้สิน": "debts",
  "ค่าสมาชิกรายเดือน": "subscriptions",
  "เงินออม/การลงทุน": "savings",
};

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
  const { data: yearlyData, isLoading: yearlyLoading } = useYearlyData(selectedYear);

  const isPageLoading = isLoading || monthsLoading || !selectedPeriod;

  // Monthly comparison data
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
        
        // 1. กรองรายการโอนออกก่อนนำไปคำนวณเปรียบเทียบรายเดือน
        const validTransactions = mData.transactions.filter(
          (t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี"
        );

        const income = validTransactions.filter((t) => t.type === "รายรับ").reduce((s, t) => s + t.amount, 0);
        const expense = validTransactions.filter((t) => t.type !== "รายรับ").reduce((s, t) => s + t.amount, 0);
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

    // 2. กรองรายการโอนออกก่อนนำไปวิเคราะห์ในหน้า Analysis ของเดือนที่เลือก
    const validTransactions = data.transactions.filter(
      (t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี"
    );

    const incomeTransactions = validTransactions.filter((t) => t.type === "รายรับ");
    const expenseTransactions = validTransactions.filter((t) => t.type !== "รายรับ");

    const totalIncome = incomeTransactions.reduce((s, t) => s + t.amount, 0);
    const totalExpense = expenseTransactions.reduce((s, t) => s + t.amount, 0);

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
        let totalBudgetForItem = b.budget;
        if (b.recurrence && b.budget > 0) {
          // Always calculate occurrences within the selected month only
          const selYear = parseInt(selectedYear || "2024", 10);
          const selMonth = parseInt(selectedMonthKey || "01", 10);
          const dates = expandRecurrence(b.dueDate || b.startDate, b.recurrence, selYear, selMonth, b.startDate, b.endDate);
          totalBudgetForItem = b.budget * Math.max(dates.length, 1);
        }
        const actual = categorySpend[b.label] || 0;
        const pct = totalBudgetForItem > 0 ? (actual / totalBudgetForItem) * 100 : actual > 0 ? 999 : 0;
        return {
          label: b.label,
          group: b.group,
          budget: totalBudgetForItem,
          actual,
          diff: totalBudgetForItem - actual,
          pct,
          status: pct > 100 ? "over" : pct === 100 ? "full" : pct > 80 ? "warning" : "ok",
        };
      })
      .sort((a, b) => b.pct - a.pct);

    // Daily spending trend
    const dailySpend: Record<string, number> = {};
    const dailyIncome: Record<string, number> = {};
    
    // 3. ใช้ validTransactions ที่กรองโอนออกแล้ว สำหรับสร้างกราฟรายวัน
    validTransactions.forEach((t) => {
      if (t.type === "รายรับ") {
        dailyIncome[t.date] = (dailyIncome[t.date] || 0) + t.amount;
      } else {
        dailySpend[t.date] = (dailySpend[t.date] || 0) + t.amount;
      }
    });

    const allDates = Array.from(new Set([...Object.keys(dailySpend), ...Object.keys(dailyIncome)])).sort();
    const dailyTrend = allDates.map((date) => {
      const parts = date.split("-");
      const day = parseInt(parts[parts.length - 1] || "0", 10);
      return {
        date: `${day}`,
        รายจ่าย: dailySpend[date] || 0,
        รายรับ: dailyIncome[date] || 0,
      };
    });

    // Top spending categories
    const topCategories = pieData.slice(0, 5);

    // Expense type breakdown
    const typeBreakdown: Record<string, number> = {};
    expenseTransactions.forEach((t) => {
      typeBreakdown[t.type] = (typeBreakdown[t.type] || 0) + t.amount;
    });
    const typeData = Object.entries(typeBreakdown)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    // Budget totals
    const totalBudget = budgetPerformance.reduce((s, b) => s + b.budget, 0);
    const overBudgetCount = budgetPerformance.filter((b) => b.status === "over").length;
    const warningCount = budgetPerformance.filter((b) => b.status === "warning" || b.status === "full").length;
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;

    return {
      totalIncome,
      totalExpense,
      totalBudget,
      pieData,
      budgetPerformance,
      dailyTrend,
      topCategories,
      typeData,
      overBudgetCount,
      warningCount,
      savingsRate,
      transactionCount: validTransactions.length, // จำนวนรายการจะนับเฉพาะที่ถูกนำมาวิเคราะห์ (ไม่นับโอน)
    };
  }, [data, selectedYear, selectedMonthKey]);

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <PieIcon className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">วิเคราะห์</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <GlobalInsights />
            <ThemeToggle />
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="flex items-center gap-1">
                      <PieIcon className="h-4 w-4" />
                      <span className="hidden sm:inline">วิเคราะห์</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              <div className="flex items-center gap-2">
                {years.length > 0 && (
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-28 bg-card border-border shadow-sm text-xs">
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
                    <SelectTrigger className="w-32 bg-card border-border shadow-sm text-xs">
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
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-lg" />
                  ))}
                </div>
                <Skeleton className="h-80 rounded-lg" />
              </div>
            ) : !data || !analytics ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-destructive">ไม่สามารถโหลดข้อมูลได้</p>
              </div>
            ) : (
              <>
                {/* Summary Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="border-none shadow-sm animate-fade-in">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">จำนวนรายการ</p>
                      <p className="text-2xl font-bold font-display">{analytics.transactionCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">รายการทั้งหมด (ไม่รวมโอน)</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "80ms" }}>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">อัตราการออม</p>
                      <p className={`text-2xl font-bold font-display ${analytics.savingsRate >= 0 ? "text-income" : "text-expense"}`}>
                        {analytics.savingsRate.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">ของรายรับ</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "160ms" }}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1 mb-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        <p className="text-xs text-muted-foreground">เกินงบประมาณ</p>
                      </div>
                      <p className="text-2xl font-bold font-display text-expense">{analytics.overBudgetCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">หมวดหมู่</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "240ms" }}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-1 mb-1">
                        <CheckCircle className="h-3 w-3 text-income" />
                        <p className="text-xs text-muted-foreground">ใกล้เต็มงบ</p>
                      </div>
                      <p className="text-2xl font-bold font-display text-amber-500">{analytics.warningCount}</p>
                      <p className="text-xs text-muted-foreground mt-1">หมวดหมู่ (&gt;80%)</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Daily Trend + Pie */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <Card className="xl:col-span-2 border-none shadow-sm animate-fade-in" style={{ animationDelay: "300ms" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">แนวโน้มรายวัน</CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 sm:px-6">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={analytics.dailyTrend} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 90%)" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                            <Tooltip
                              formatter={(value: number) => new Intl.NumberFormat("th-TH").format(value) + " ฿"}
                              contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "12px" }}
                            />
                            <Area type="monotone" dataKey="รายรับ" stroke="hsl(199 89% 48%)" fill="hsl(199 89% 48%)" fillOpacity={0.15} strokeWidth={2} />
                            <Area type="monotone" dataKey="รายจ่าย" stroke="hsl(0 72% 51%)" fill="hsl(0 72% 51%)" fillOpacity={0.15} strokeWidth={2} />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "380ms" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">สัดส่วนรายจ่าย</CardTitle>
                    </CardHeader>
                    <CardContent>
                      {analytics.pieData.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">ยังไม่มีข้อมูล</p>
                      ) : (
                        <>
                          <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={analytics.pieData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={45}
                                  outerRadius={75}
                                  paddingAngle={2}
                                  dataKey="value"
                                >
                                  {analytics.pieData.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(value: number) => formatCurrency(value) + " ฿"}
                                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "12px" }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="space-y-1.5 mt-2">
                            {analytics.pieData.slice(0, 5).map((item, i) => (
                              <div key={item.name} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                                  <span className="truncate max-w-[120px]">{item.name}</span>
                                </div>
                                <span className="font-medium tabular-nums">{formatCurrency(item.value)}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Expense Type Breakdown */}
                {analytics.typeData.length > 0 && (
                  <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "440ms" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">สัดส่วนตามประเภทรายจ่าย</CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 sm:px-6">
                      <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.typeData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 90%)" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                            <Tooltip
                              formatter={(value: number) => formatCurrency(value) + " ฿"}
                              contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "12px" }}
                            />
                            <Bar dataKey="value" name="ยอดรวม" radius={[6, 6, 0, 0]} barSize={40}>
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

                {/* Monthly Comparison Chart */}
                {monthlyComparison.length > 1 && (
                  <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "560ms" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">เปรียบเทียบรายเดือน (ปี {selectedYear ? String(Number(selectedYear) + 543) : ""})</CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 sm:px-6">
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthlyComparison} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 90%)" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                            <Tooltip
                              formatter={(value: number) => formatCurrency(value) + " ฿"}
                              contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "12px" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "11px" }} />
                            <Bar dataKey="รายรับ" fill="hsl(199 89% 48%)" radius={[4, 4, 0, 0]} barSize={20} />
                            <Bar dataKey="รายจ่าย" fill="hsl(0 72% 51%)" radius={[4, 4, 0, 0]} barSize={20} />
                            <Bar dataKey="คงเหลือ" fill="hsl(166 72% 56%)" radius={[4, 4, 0, 0]} barSize={20} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Monthly Comparison Summary Table */}
                      <div className="overflow-x-auto mt-4">
                        <Table>
                          <TableHeader>
                            <TableRow className="border-border/50">
                              <TableHead className="text-xs">เดือน</TableHead>
                              <TableHead className="text-xs text-right">รายรับ</TableHead>
                              <TableHead className="text-xs text-right">รายจ่าย</TableHead>
                              <TableHead className="text-xs text-right">คงเหลือ</TableHead>
                              <TableHead className="text-xs text-right">อัตราออม</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {monthlyComparison.map((m) => (
                              <TableRow key={m.name} className="border-border/30">
                                <TableCell className="text-xs font-medium py-2">{m.name}</TableCell>
                                <TableCell className="text-xs text-right py-2 text-income">{formatCurrency(m.รายรับ)}</TableCell>
                                <TableCell className="text-xs text-right py-2 text-expense">{formatCurrency(m.รายจ่าย)}</TableCell>
                                <TableCell className={`text-xs text-right py-2 font-semibold ${m.คงเหลือ >= 0 ? "text-income" : "text-expense"}`}>
                                  {formatCurrency(m.คงเหลือ)}
                                </TableCell>
                                <TableCell className={`text-xs text-right py-2 ${m.อัตราการออม >= 0 ? "text-income" : "text-expense"}`}>
                                  {m.อัตราการออม.toFixed(1)}%
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* Total row */}
                            <TableRow className="border-t-2 border-border bg-muted/30 font-semibold">
                              <TableCell className="text-xs py-2">รวมทั้งปี</TableCell>
                              <TableCell className="text-xs text-right py-2 text-income">
                                {formatCurrency(monthlyComparison.reduce((s, m) => s + m.รายรับ, 0))}
                              </TableCell>
                              <TableCell className="text-xs text-right py-2 text-expense">
                                {formatCurrency(monthlyComparison.reduce((s, m) => s + m.รายจ่าย, 0))}
                              </TableCell>
                              <TableCell className={`text-xs text-right py-2 font-bold ${monthlyComparison.reduce((s, m) => s + m.คงเหลือ, 0) >= 0 ? "text-income" : "text-expense"}`}>
                                {formatCurrency(monthlyComparison.reduce((s, m) => s + m.คงเหลือ, 0))}
                              </TableCell>
                              <TableCell className="text-xs text-right py-2">
                                {(() => {
                                  const totalIncome = monthlyComparison.reduce((s, m) => s + m.รายรับ, 0);
                                  const totalExpense = monthlyComparison.reduce((s, m) => s + m.รายจ่าย, 0);
                                  const rate = totalIncome > 0 ? ((totalIncome - totalExpense) / totalIncome) * 100 : 0;
                                  return <span className={rate >= 0 ? "text-income" : "text-expense"}>{rate.toFixed(1)}%</span>;
                                })()}
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Savings Rate Trend */}
                {monthlyComparison.length > 1 && (
                  <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "620ms" }}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-semibold">แนวโน้มอัตราการออมรายเดือน (%)</CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 sm:px-6">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={monthlyComparison} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 16% 90%)" />
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                            <Tooltip
                              formatter={(value: number) => `${value.toFixed(1)}%`}
                              contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "12px" }}
                            />
                            <ReferenceLine y={0} stroke="hsl(0 72% 51%)" strokeDasharray="4 4" strokeOpacity={0.6} />
                            <Line
                              type="monotone"
                              dataKey="อัตราการออม"
                              stroke="hsl(166 72% 56%)"
                              strokeWidth={2.5}
                              dot={{ r: 5, fill: "hsl(166 72% 56%)", stroke: "white", strokeWidth: 2 }}
                              activeDot={{ r: 7 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Budget Performance Table */}
                <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "500ms" }}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base font-semibold">ประสิทธิภาพงบประมาณ</CardTitle>
                  </CardHeader>
                  <CardContent className="px-0 sm:px-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-border/50">
                            <TableHead className="text-xs">หมวดหมู่</TableHead>
                            <TableHead className="text-xs">กลุ่ม</TableHead>
                            <TableHead className="text-xs text-right">งบประมาณ</TableHead>
                            <TableHead className="text-xs text-right">ใช้จริง</TableHead>
                            <TableHead className="text-xs text-right">ส่วนต่าง</TableHead>
                            <TableHead className="text-xs text-right">%</TableHead>
                            <TableHead className="text-xs text-center">สถานะ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {analytics.budgetPerformance.map((item) => (
                            <TableRow key={item.label} className="border-border/50 hover:bg-muted/30">
                              <TableCell className="text-sm font-medium">{item.label}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{item.group}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">{formatCurrency(item.budget)}</TableCell>
                              <TableCell className="text-sm text-right tabular-nums">{formatCurrency(item.actual)}</TableCell>
                              <TableCell className={`text-sm text-right tabular-nums font-medium ${item.diff >= 0 ? "text-income" : "text-expense"}`}>
                                {item.diff >= 0 ? "+" : ""}{formatCurrency(item.diff)}
                              </TableCell>
                              <TableCell className={`text-sm text-right tabular-nums font-semibold ${
                                item.status === "over" ? "text-expense" : item.status === "warning" ? "text-amber-500" : "text-income"
                              }`}>
                                {item.pct > 999 ? ">999" : item.pct.toFixed(0)}%
                              </TableCell>
                              <TableCell className="text-center">
                                {item.status === "over" ? (
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">เกินงบ</Badge>
                                ) : item.status === "full" ? (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/30">เต็มแล้ว</Badge>
                                ) : item.status === "warning" ? (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-600 border-amber-500/30">ใกล้เต็ม</Badge>
                                ) : (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-income/10 text-income border-income/30">ปกติ</Badge>
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
          </div>
        </main>
        <AppFooter />
      </div>
    </>
  );
};

export default Analysis;
