import { useMemo } from "react";
import { BudgetData } from "./useBudgetData";
import { expandRecurrence } from "@/lib/recurrence";

export interface BudgetAlert {
  label: string;
  actual: number;
  budget: number;
  pct: number;
  over: boolean;
}

function getMonthlyBudget(item: { budget: number; recurrence?: string; dueDate?: string; startDate?: string; endDate?: string }, period: string): number {
  if (!item.recurrence || !item.dueDate) return item.budget;
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return item.budget;
  const occurrences = expandRecurrence(item.dueDate, item.recurrence, y, m, item.startDate, item.endDate).length;
  return occurrences > 0 ? item.budget * occurrences : item.budget;
}

const THRESHOLD = 80;

export function useBudgetAlerts(data: BudgetData | undefined): { alerts: BudgetAlert[]; unreadCount: number; markRead: () => void } {
  const storageKey = data ? `budget-alerts-seen-${data.period}` : null;

  const alerts = useMemo<BudgetAlert[]>(() => {
    if (!data) return [];

    const actualByCategory: Record<string, number> = {};
    data.transactions
      .filter((t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
      .forEach((t) => { actualByCategory[t.category] = (actualByCategory[t.category] || 0) + t.amount; });

    const incomeLabels = new Set(data.income.map((i) => i.label));
    const allBudgets = [
      ...data.expenses.general,
      ...data.expenses.bills,
      ...data.expenses.debts,
      ...data.expenses.subscriptions,
      ...data.expenses.savings,
    ].filter((b) => !incomeLabels.has(b.label));

    return allBudgets
      .filter((b) => {
        const actual = actualByCategory[b.label] || 0;
        const monthly = getMonthlyBudget(b, data.period);
        return monthly > 0 && actual >= monthly * (THRESHOLD / 100);
      })
      .map((b) => {
        const actual = actualByCategory[b.label] || 0;
        const monthly = getMonthlyBudget(b, data.period);
        const pct = Math.round((actual / monthly) * 100);
        return { label: b.label, actual, budget: monthly, pct, over: actual > monthly };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [data]);

  const seenCount = useMemo(() => {
    if (!storageKey) return 0;
    try { return parseInt(localStorage.getItem(storageKey) || "0", 10); } catch { return 0; }
  }, [storageKey, alerts]);

  const unreadCount = Math.max(0, alerts.length - seenCount);

  const markRead = () => {
    if (!storageKey) return;
    try { localStorage.setItem(storageKey, String(alerts.length)); } catch { /* ignore */ }
  };

  return { alerts, unreadCount, markRead };
}
