// Shared types and helpers for budget settings
// Extracted from Settings.tsx to reduce file size and enable reuse

export type SettingsTab = "budget" | "categories" | "savings" | "user" | "recurring";

// Budget value can be a number (general) or {amount, due_date} (bills, debts, savings, subscriptions)
export type BudgetValue = number | {
  amount: number;
  due_date: string | null;
  recurrence?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  paid_dates?: string[];
};

export interface BudgetTreeData {
  income_estimates: Record<string, Record<string, number>>;
  expense_budgets: Record<string, Record<string, BudgetValue>>;
  carry_over: number;
  period: string;
}

export const MAP_CATEGORIES = [
  "บิลและสาธารณูปโภค",
  "หนี้สิน",
  "เงินออมและการลงทุน",
  "ค่าสมาชิกรายเดือน",
];

export function getAmount(val: BudgetValue): number {
  return typeof val === "number" ? val : val?.amount ?? 0;
}

export function getDueDate(val: BudgetValue): string | null {
  return typeof val === "object" && val !== null ? val?.due_date ?? null : null;
}

export function getRecurrence(val: BudgetValue): string | null {
  return typeof val === "object" && val !== null ? (val as any)?.recurrence ?? null : null;
}

export function getStartDate(val: BudgetValue): string | null {
  return typeof val === "object" && val !== null ? (val as any)?.start_date ?? null : null;
}

export function getEndDate(val: BudgetValue): string | null {
  return typeof val === "object" && val !== null ? (val as any)?.end_date ?? null : null;
}

export function getPaidDates(val: BudgetValue): string[] {
  return typeof val === "object" && val !== null ? (val as any)?.paid_dates ?? [] : [];
}
