import {
  collection, doc, getDoc, setDoc, deleteDoc, serverTimestamp,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { BudgetData } from "@/hooks/useBudgetData";

export interface SharedReportSnapshot {
  period: string;
  monthName: string;
  totalIncome: number;
  totalExpense: number;
  carryOver: number;
  balance: number;
  budgetedIncome: number;
  budgetedExpense: number;
  incomeItems: { label: string; budget: number; actual: number }[];
  expenseCategories: { label: string; budget: number; actual: number }[];
  topTransactions: {
    date: string;
    description: string;
    amount: number;
    type: string;
    category: string;
  }[];
}

export interface SharedReport {
  userId: string;
  period: string;
  sharedBy: string;
  createdAt: number;
  expiresAt: number;
  snapshot: SharedReportSnapshot;
}

import { THAI_MONTHS } from "@/lib/constants";

function buildSnapshot(data: BudgetData, carryOver: number): SharedReportSnapshot {
  const [yearStr, monthStr] = data.period.split("-");
  const monthName = `${THAI_MONTHS[parseInt(monthStr, 10) - 1]} ${yearStr}`;

  const activeTransactions = data.transactions.filter(
    (t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี"
  );

  const totalIncome = activeTransactions
    .filter((t) => t.type === "รายรับ")
    .reduce((s, t) => s + t.amount, 0) + carryOver;

  const totalExpense = activeTransactions
    .filter((t) => t.type !== "รายรับ")
    .reduce((s, t) => s + t.amount, 0);

  const balance = totalIncome - totalExpense;

  const budgetedIncome = data.income.reduce((s, i) => s + i.budget, 0) + carryOver;

  const allExpenses = [
    ...data.expenses.general,
    ...data.expenses.bills,
    ...data.expenses.debts,
    ...data.expenses.subscriptions,
    ...data.expenses.savings,
  ];
  const budgetedExpense = allExpenses.reduce((s, e) => s + e.budget, 0);

  // Income items: actual spending per label
  const incomeTxByLabel: Record<string, number> = {};
  activeTransactions
    .filter((t) => t.type === "รายรับ")
    .forEach((t) => {
      incomeTxByLabel[t.category] = (incomeTxByLabel[t.category] ?? 0) + t.amount;
    });
  const incomeItems = data.income.map((i) => ({
    label: i.label,
    budget: i.budget,
    actual: incomeTxByLabel[i.label] ?? 0,
  }));

  // Expense categories: actual spending per label
  const expenseTxByLabel: Record<string, number> = {};
  activeTransactions
    .filter((t) => t.type !== "รายรับ")
    .forEach((t) => {
      const key = t.category;
      expenseTxByLabel[key] = (expenseTxByLabel[key] ?? 0) + t.amount;
    });
  const expenseCategories = allExpenses
    .map((e) => ({
      label: e.label,
      budget: e.budget,
      actual: expenseTxByLabel[e.label] ?? 0,
    }))
    .filter((e) => e.budget > 0 || e.actual > 0);

  // Top 15 transactions by amount (non-transfer)
  const topTransactions = [...activeTransactions]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15)
    .map((t) => ({
      date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      category: t.category,
    }));

  return {
    period: data.period,
    monthName,
    totalIncome,
    totalExpense,
    carryOver,
    balance,
    budgetedIncome,
    budgetedExpense,
    incomeItems,
    expenseCategories,
    topTransactions,
  };
}

function generateToken(): string {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createSharedReport(
  userId: string,
  displayName: string,
  data: BudgetData,
  carryOver: number,
  expiryDays = 3
): Promise<string> {
  const token = generateToken();
  const now = Date.now();
  const report: SharedReport = {
    userId,
    period: data.period,
    sharedBy: displayName,
    createdAt: now,
    expiresAt: now + expiryDays * 24 * 60 * 60 * 1000,
    snapshot: buildSnapshot(data, carryOver),
  };
  await setDoc(doc(collection(firestore, "shared_reports"), token), report);
  return token;
}

export async function getSharedReport(token: string): Promise<SharedReport | null> {
  const snap = await getDoc(doc(collection(firestore, "shared_reports"), token));
  if (!snap.exists()) return null;
  return snap.data() as SharedReport;
}

export async function deleteSharedReport(token: string): Promise<void> {
  await deleteDoc(doc(collection(firestore, "shared_reports"), token));
}
