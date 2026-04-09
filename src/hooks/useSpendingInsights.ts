import { useMemo } from "react";
import { Lightbulb, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, PiggyBank } from "lucide-react";
import type { BudgetData, BudgetItem } from "@/hooks/useBudgetData";
import { expandRecurrence } from "@/lib/recurrence";

export interface Insight {
  icon: typeof Lightbulb;
  color: string;
  title: string;
  description: string;
  priority: number;
}

function formatCurrency(n: number) {
  return `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function useSpendingInsights(data: BudgetData | undefined, carryOver: number): Insight[] {
  return useMemo(() => {
    if (!data) return [];
    const tips: Insight[] = [];

    const income = data.transactions.filter((t) => t.type === "รายรับ").reduce((s, t) => s + t.amount, 0);
    const expenses = data.transactions
      .filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
      .reduce((s, t) => s + t.amount, 0);
    const savingsRate = income > 0 ? ((income - expenses) / income) * 100 : 0;

    // 1. Savings rate insight
    if (income > 0) {
      if (savingsRate >= 20) {
        tips.push({
          icon: CheckCircle2,
          color: "text-accent",
          title: "อัตราการออมดี!",
          description: `ออมได้ ${savingsRate.toFixed(0)}% ของรายรับ สูงกว่าเกณฑ์แนะนำ 20%`,
          priority: 3,
        });
      } else if (savingsRate >= 0) {
        tips.push({
          icon: PiggyBank,
          color: "text-amber-500",
          title: "ลองเพิ่มการออม",
          description: `ออมได้ ${savingsRate.toFixed(0)}% ของรายรับ แนะนำให้ตั้งเป้า 20%+ (ต้องลดอีก ${formatCurrency(income * 0.2 - (income - expenses))})`,
          priority: 5,
        });
      } else {
        tips.push({
          icon: AlertTriangle,
          color: "text-destructive",
          title: "รายจ่ายเกินรายรับ!",
          description: `ขาดดุล ${formatCurrency(expenses - income)} ควรทบทวนรายจ่ายที่ไม่จำเป็น`,
          priority: 10,
        });
      }
    }

    // 2. Top spending category
    const byCategory: Record<string, number> = {};
    data.transactions
      .filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
      .forEach((t) => {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      });
    const sorted = Object.entries(byCategory).sort(([, a], [, b]) => b - a);
    if (sorted.length > 0) {
      const [topCat, topAmt] = sorted[0];
      const topPct = expenses > 0 ? Math.round((topAmt / expenses) * 100) : 0;
      if (topPct > 40) {
        tips.push({
          icon: TrendingUp,
          color: "text-amber-500",
          title: `"${topCat}" ใช้จ่ายเยอะ`,
          description: `คิดเป็น ${topPct}% ของรายจ่ายทั้งหมด (${formatCurrency(topAmt)}) ลองดูว่าลดได้ไหม`,
          priority: 7,
        });
      }
    }

    // 3. Budget overruns
    const getMonthly = (item: BudgetItem): number => {
      if (!item.recurrence || !item.dueDate) return item.budget;
      const [y, m] = data.period.split("-").map(Number);
      if (!y || !m) return item.budget;
      const occ = expandRecurrence(item.dueDate, item.recurrence, y, m, item.startDate, item.endDate).length;
      return occ > 0 ? item.budget * occ : item.budget;
    };
    const allBudgets = [
      ...data.expenses.general,
      ...data.expenses.bills,
      ...data.expenses.debts,
      ...data.expenses.subscriptions,
      ...data.expenses.savings,
    ];
    const overBudgetCount = allBudgets.filter((b) => {
      const actual = byCategory[b.label] || 0;
      const monthly = getMonthly(b);
      return monthly > 0 && actual > monthly;
    }).length;

    if (overBudgetCount > 0) {
      tips.push({
        icon: AlertTriangle,
        color: "text-destructive",
        title: `${overBudgetCount} หมวดเกินงบ`,
        description: "ตรวจสอบรายการที่ติดตามงบประมาณเพื่อดูรายละเอียด",
        priority: 8,
      });
    } else if (allBudgets.length > 0) {
      tips.push({
        icon: CheckCircle2,
        color: "text-accent",
        title: "ทุกหมวดอยู่ในงบ!",
        description: "ยอดเยี่ยม! ยังไม่มีหมวดไหนเกินงบเดือนนี้",
        priority: 1,
      });
    }

    // 4. Transaction frequency insight (exclude transfers)
    const nonTransferTx = data.transactions.filter(
      (t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี"
    );
    const txDays = new Set(nonTransferTx.map((t) => t.date));
    const avgTxPerDay = txDays.size > 0 ? (nonTransferTx.length / txDays.size).toFixed(1) : "0";
    if (nonTransferTx.length > 30) {
      tips.push({
        icon: Lightbulb,
        color: "text-primary",
        title: "ธุรกรรมถี่",
        description: `เฉลี่ย ${avgTxPerDay} รายการ/วัน (${nonTransferTx.length} รายการเดือนนี้) ลองรวมรายจ่ายเล็ก ๆ`,
        priority: 2,
      });
    }

    // 5. Carry over insight
    if (carryOver > 0) {
      tips.push({
        icon: TrendingDown,
        color: "text-primary",
        title: "ยอดยกมาจากเดือนก่อน",
        description: `มีเงินยกมา ${formatCurrency(carryOver)} ถือเป็นจุดเริ่มต้นที่ดี`,
        priority: 1,
      });
    }

    return tips.sort((a, b) => b.priority - a.priority).slice(0, 5);
  }, [data, carryOver]);
}
