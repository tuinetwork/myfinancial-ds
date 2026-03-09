import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

// Categories that should use {amount, due_date} format with is_due_date_enabled toggle
const MAP_CATEGORIES = [
  "บิลและสาธารณูปโภค",
  "หนี้สิน",
  "เงินออมและการลงทุน",
  "ค่าสมาชิกรายเดือน",
];

export interface MigrationProgress {
  totalUsers: number;
  processedUsers: number;
  totalBudgets: number;
  migratedBudgets: number;
  skippedBudgets: number;
}

// New schema types
export interface BudgetSubCategory {
  amount: number;
  due_date: string | null;
}

export interface BudgetCategoryGroup {
  is_due_date_enabled: boolean;
  sub_categories: Record<string, BudgetSubCategory>;
}

// Helper to check if a group is already in new format
function isNewFormat(group: unknown): group is BudgetCategoryGroup {
  if (!group || typeof group !== 'object') return false;
  return 'sub_categories' in group && 'is_due_date_enabled' in group;
}

// Helper to get sub_categories from either format
export function getSubCategories(group: unknown): Record<string, BudgetSubCategory> {
  if (!group || typeof group !== 'object') return {};
  
  // New format: { is_due_date_enabled, sub_categories: {...} }
  if (isNewFormat(group)) {
    return group.sub_categories ?? {};
  }
  
  // Old format: { subcategory: value } where value is number or {amount, due_date}
  const result: Record<string, BudgetSubCategory> = {};
  for (const [key, val] of Object.entries(group as Record<string, unknown>)) {
    if (key === 'is_due_date_enabled' || key === 'sub_categories') continue;
    if (typeof val === 'number') {
      result[key] = { amount: val, due_date: null };
    } else if (typeof val === 'object' && val !== null) {
      result[key] = {
        amount: (val as any).amount ?? 0,
        due_date: (val as any).due_date ?? null,
      };
    }
  }
  return result;
}

// Helper to check if due_date is enabled for a group
export function isDueDateEnabled(group: unknown): boolean {
  if (!group || typeof group !== 'object') return false;
  if (isNewFormat(group)) {
    return group.is_due_date_enabled;
  }
  return false;
}

// Helper to get amount from either format
export function getAmount(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && val !== null) {
    return (val as any).amount ?? 0;
  }
  return 0;
}

// Helper to get due_date from either format
export function getDueDate(val: unknown): string | null {
  if (typeof val === 'object' && val !== null) {
    return (val as any).due_date ?? null;
  }
  return null;
}

/**
 * Migration: Convert old budget structure to new structure with is_due_date_enabled toggle
 * 
 * Old format:
 * expense_budgets: {
 *   "บิลและสาธารณูปโภค": { "ค่าไฟ": 1500, "ค่าน้ำ": { amount: 300, due_date: "2026-03-10" } },
 *   "ค่าใช้จ่ายทั่วไป": { "อาหาร": 8000 }
 * }
 * 
 * New format:
 * expense_budgets: {
 *   "บิลและสาธารณูปโภค": {
 *     is_due_date_enabled: false,
 *     sub_categories: { "ค่าไฟ": { amount: 1500, due_date: null }, "ค่าน้ำ": { amount: 300, due_date: "2026-03-10" } }
 *   },
 *   "ค่าใช้จ่ายทั่วไป": {
 *     is_due_date_enabled: false,
 *     sub_categories: { "อาหาร": { amount: 8000, due_date: null } }
 *   }
 * }
 */
export async function runBudgetMigration(
  onProgress?: (progress: MigrationProgress) => void
): Promise<MigrationProgress> {
  const usersSnap = await getDocs(collection(firestore, "users"));
  const progress: MigrationProgress = {
    totalUsers: usersSnap.size,
    processedUsers: 0,
    totalBudgets: 0,
    migratedBudgets: 0,
    skippedBudgets: 0,
  };

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const budgetsSnap = await getDocs(collection(firestore, "users", userId, "budgets"));
    progress.totalBudgets += budgetsSnap.size;

    for (const budgetDoc of budgetsSnap.docs) {
      const data = budgetDoc.data();
      const expenseBudgets = (data.expense_budgets ?? {}) as Record<string, unknown>;
      const incomeBudgets = (data.income_estimates ?? {}) as Record<string, unknown>;
      let changed = false;
      const updatedExpense: Record<string, BudgetCategoryGroup> = {};
      const updatedIncome: Record<string, BudgetCategoryGroup> = {};

      // Process expense_budgets
      for (const [mainCat, group] of Object.entries(expenseBudgets)) {
        if (isNewFormat(group)) {
          // Already in new format, keep as is
          updatedExpense[mainCat] = group;
        } else if (group && typeof group === 'object') {
          // Old format - convert to new format
          const subCategories: Record<string, BudgetSubCategory> = {};
          for (const [subKey, val] of Object.entries(group as Record<string, unknown>)) {
            if (typeof val === 'number') {
              subCategories[subKey] = { amount: val, due_date: null };
            } else if (typeof val === 'object' && val !== null) {
              subCategories[subKey] = {
                amount: (val as any).amount ?? 0,
                due_date: (val as any).due_date ?? null,
              };
            }
          }
          updatedExpense[mainCat] = {
            is_due_date_enabled: false, // Default to false for existing data
            sub_categories: subCategories,
          };
          changed = true;
        }
      }

      // Process income_estimates (same structure for consistency)
      for (const [mainCat, group] of Object.entries(incomeBudgets)) {
        if (isNewFormat(group)) {
          updatedIncome[mainCat] = group;
        } else if (group && typeof group === 'object') {
          const subCategories: Record<string, BudgetSubCategory> = {};
          for (const [subKey, val] of Object.entries(group as Record<string, unknown>)) {
            if (typeof val === 'number') {
              subCategories[subKey] = { amount: val, due_date: null };
            } else if (typeof val === 'object' && val !== null) {
              subCategories[subKey] = {
                amount: (val as any).amount ?? 0,
                due_date: (val as any).due_date ?? null,
              };
            }
          }
          updatedIncome[mainCat] = {
            is_due_date_enabled: false,
            sub_categories: subCategories,
          };
          changed = true;
        }
      }

      if (changed) {
        await updateDoc(doc(firestore, "users", userId, "budgets", budgetDoc.id), {
          expense_budgets: updatedExpense,
          income_estimates: updatedIncome,
        });
        progress.migratedBudgets++;
      } else {
        progress.skippedBudgets++;
      }
    }

    progress.processedUsers++;
    onProgress?.({ ...progress });
  }

  return progress;
}
