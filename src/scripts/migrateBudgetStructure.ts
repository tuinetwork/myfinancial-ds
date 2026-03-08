import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

// Categories that should use {amount, due_date} format
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
      const expenseBudgets = (data.expense_budgets ?? {}) as Record<string, Record<string, unknown>>;
      let changed = false;
      const updated = { ...expenseBudgets };

      for (const mainCat of MAP_CATEGORIES) {
        if (!updated[mainCat]) continue;
        const subs = { ...updated[mainCat] };
        for (const [subKey, val] of Object.entries(subs)) {
          if (typeof val === "number") {
            // Convert number → {amount, due_date: null}
            subs[subKey] = { amount: val, due_date: null };
            changed = true;
          }
          // Already object → skip (idempotent)
        }
        updated[mainCat] = subs;
      }

      if (changed) {
        await updateDoc(doc(firestore, "users", userId, "budgets", budgetDoc.id), {
          expense_budgets: updated,
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
