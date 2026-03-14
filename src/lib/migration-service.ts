import {
  collection, getDocs, doc, setDoc, updateDoc, writeBatch, getDoc, runTransaction,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Account } from "@/types/finance";

// ===== Log Types =====
export type LogLevel = "info" | "success" | "error" | "warn";
export interface OperationLog {
  timestamp: number;
  level: LogLevel;
  message: string;
}

// ===== Migration Progress =====
export interface MigrationProgress {
  totalUsers: number;
  processedUsers: number;
  totalBudgets: number;
  migratedBudgets: number;
  skippedBudgets: number;
}

export interface AccountMigrationProgress {
  totalUsers: number;
  processedUsers: number;
  totalTransactions: number;
  migratedTransactions: number;
  accountsCreated: number;
  errors: string[];
}

// ===== Budget Migration =====
const MAP_CATEGORIES = [
  "บิลและสาธารณูปโภค",
  "หนี้สิน",
  "เงินออมและการลงทุน",
  "ค่าสมาชิกรายเดือน",
];

export async function runBudgetMigration(
  onProgress?: (p: MigrationProgress) => void,
  onLog?: (log: OperationLog) => void
): Promise<MigrationProgress> {
  const usersSnap = await getDocs(collection(firestore, "users"));
  const progress: MigrationProgress = {
    totalUsers: usersSnap.size, processedUsers: 0,
    totalBudgets: 0, migratedBudgets: 0, skippedBudgets: 0,
  };
  onLog?.({ timestamp: Date.now(), level: "info", message: `เริ่ม Budget Migration สำหรับ ${usersSnap.size} ผู้ใช้` });

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
            subs[subKey] = { amount: val, due_date: null, recurrence: null, start_date: null, end_date: null, paid_dates: [] };
            changed = true;
          } else if (typeof val === "object" && val !== null) {
            const obj = val as any;
            if (!("recurrence" in obj) || !("start_date" in obj) || !("end_date" in obj) || !("paid_dates" in obj)) {
              subs[subKey] = {
                amount: obj.amount ?? 0, due_date: obj.due_date ?? null,
                recurrence: obj.recurrence ?? null, start_date: obj.start_date ?? null,
                end_date: obj.end_date ?? null, paid_dates: obj.paid_dates ?? [],
              };
              changed = true;
            }
          }
        }
        updated[mainCat] = subs;
      }

      if (changed) {
        await updateDoc(doc(firestore, "users", userId, "budgets", budgetDoc.id), { expense_budgets: updated });
        progress.migratedBudgets++;
      } else {
        progress.skippedBudgets++;
      }
    }

    progress.processedUsers++;
    onProgress?.({ ...progress });
  }

  onLog?.({ timestamp: Date.now(), level: "success", message: `Budget Migration สำเร็จ: อัปเดต ${progress.migratedBudgets}, ข้าม ${progress.skippedBudgets}` });
  return progress;
}

// ===== Account Migration =====
export async function runAccountMigration(
  onProgress?: (p: AccountMigrationProgress) => void,
  onLog?: (log: OperationLog) => void
): Promise<AccountMigrationProgress> {
  const usersSnap = await getDocs(collection(firestore, "users"));
  const progress: AccountMigrationProgress = {
    totalUsers: usersSnap.size, processedUsers: 0,
    totalTransactions: 0, migratedTransactions: 0,
    accountsCreated: 0, errors: [],
  };
  onLog?.({ timestamp: Date.now(), level: "info", message: `เริ่ม Account Migration สำหรับ ${usersSnap.size} ผู้ใช้` });

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    try {
      const accountsSnap = await getDocs(collection(firestore, "users", userId, "accounts"));
      const existingAccounts = accountsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const hasDefault = existingAccounts.some((a: any) => a.name === "กระเป๋าเงินสดหลัก" && !a.is_deleted);

      const txSnap = await getDocs(collection(firestore, "users", userId, "transactions"));
      progress.totalTransactions += txSnap.size;

      let netBalance = 0;
      txSnap.docs.forEach((d) => {
        const data = d.data();
        const amount = (data.amount as number) ?? 0;
        if (data.type === "income") netBalance += amount;
        else if (data.type === "expense") netBalance -= amount;
      });

      let defaultAccountId: string;
      if (!hasDefault) {
        const accountRef = doc(collection(firestore, "users", userId, "accounts"));
        defaultAccountId = accountRef.id;
        await setDoc(accountRef, {
          name: "กระเป๋าเงินสดหลัก", type: "cash",
          balance: Math.round(netBalance * 100) / 100, currency: "THB",
          is_active: true, is_deleted: false,
          created_at: Date.now(), updated_at: Date.now(),
        });
        progress.accountsCreated++;
      } else {
        defaultAccountId = existingAccounts.find((a: any) => a.name === "กระเป๋าเงินสดหลัก" && !a.is_deleted)!.id;
      }

      const docsToUpdate = txSnap.docs.filter((d) => {
        const data = d.data();
        if (data.type === "expense" && !data.from_account_id) return true;
        if (data.type === "income" && !data.to_account_id) return true;
        return false;
      });

      const BATCH_SIZE = 499;
      for (let i = 0; i < docsToUpdate.length; i += BATCH_SIZE) {
        const batch = writeBatch(firestore);
        const chunk = docsToUpdate.slice(i, i + BATCH_SIZE);
        for (const txDoc of chunk) {
          const data = txDoc.data();
          const update: Record<string, any> = {};
          if (data.type === "expense" && !data.from_account_id) update.from_account_id = defaultAccountId;
          if (data.type === "income" && !data.to_account_id) update.to_account_id = defaultAccountId;
          if (Object.keys(update).length > 0) {
            batch.update(txDoc.ref, update);
            progress.migratedTransactions++;
          }
        }
        await batch.commit();
      }

      onLog?.({ timestamp: Date.now(), level: "info", message: `ผู้ใช้ ${userId.slice(0, 8)}... เสร็จสิ้น` });
    } catch (err: any) {
      progress.errors.push(`User ${userId}: ${err.message}`);
      onLog?.({ timestamp: Date.now(), level: "error", message: `ผู้ใช้ ${userId.slice(0, 8)}...: ${err.message}` });
    }

    progress.processedUsers++;
    onProgress?.({ ...progress });
  }

  onLog?.({ timestamp: Date.now(), level: "success", message: `Account Migration สำเร็จ: สร้างบัญชี ${progress.accountsCreated}, อัปเดต ${progress.migratedTransactions} ธุรกรรม` });
  return progress;
}

// ===== Atomic Balance Update (runTransaction) =====
export async function atomicBalanceUpdate(
  userId: string,
  accountId: string,
  delta: number
): Promise<void> {
  const accountRef = doc(firestore, "users", userId, "accounts", accountId);
  await runTransaction(firestore, async (transaction) => {
    const accountDoc = await transaction.get(accountRef);
    if (!accountDoc.exists()) throw new Error("Account not found");
    const currentBalance = accountDoc.data().balance ?? 0;
    transaction.update(accountRef, {
      balance: Math.round((currentBalance + delta) * 100) / 100,
      updated_at: Date.now(),
    });
  });
}

export async function atomicTransferBalance(
  userId: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number
): Promise<void> {
  const fromRef = doc(firestore, "users", userId, "accounts", fromAccountId);
  const toRef = doc(firestore, "users", userId, "accounts", toAccountId);
  await runTransaction(firestore, async (transaction) => {
    const fromDoc = await transaction.get(fromRef);
    const toDoc = await transaction.get(toRef);
    if (!fromDoc.exists() || !toDoc.exists()) throw new Error("Account not found");
    const fromBalance = fromDoc.data().balance ?? 0;
    const toBalance = toDoc.data().balance ?? 0;
    transaction.update(fromRef, { balance: Math.round((fromBalance - amount) * 100) / 100, updated_at: Date.now() });
    transaction.update(toRef, { balance: Math.round((toBalance + amount) * 100) / 100, updated_at: Date.now() });
  });
}

// ===== Orphaned Data Detector =====
export interface OrphanedRecord {
  type: "transaction";
  id: string;
  userId: string;
  issue: string;
}

export async function detectOrphanedData(
  onLog?: (log: OperationLog) => void
): Promise<OrphanedRecord[]> {
  const orphans: OrphanedRecord[] = [];
  const usersSnap = await getDocs(collection(firestore, "users"));
  onLog?.({ timestamp: Date.now(), level: "info", message: `เริ่มตรวจสอบข้อมูลกำพร้าสำหรับ ${usersSnap.size} ผู้ใช้` });

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const accountsSnap = await getDocs(collection(firestore, "users", userId, "accounts"));
    const accountIds = new Set(accountsSnap.docs.map((d) => d.id));

    const txSnap = await getDocs(collection(firestore, "users", userId, "transactions"));
    for (const txDoc of txSnap.docs) {
      const data = txDoc.data();
      if (data.from_account_id && !accountIds.has(data.from_account_id)) {
        orphans.push({ type: "transaction", id: txDoc.id, userId, issue: `from_account_id "${data.from_account_id}" ไม่พบในระบบ` });
      }
      if (data.to_account_id && !accountIds.has(data.to_account_id)) {
        orphans.push({ type: "transaction", id: txDoc.id, userId, issue: `to_account_id "${data.to_account_id}" ไม่พบในระบบ` });
      }
    }
  }

  onLog?.({ timestamp: Date.now(), level: orphans.length > 0 ? "warn" : "success", message: `ตรวจสอบเสร็จสิ้น: พบ ${orphans.length} ข้อมูลกำพร้า` });
  return orphans;
}

// ===== Backup: Export All Data =====
export async function exportAllData(
  onLog?: (log: OperationLog) => void
): Promise<Record<string, any>> {
  onLog?.({ timestamp: Date.now(), level: "info", message: "เริ่มสำรองข้อมูลทั้งหมด..." });
  const backup: Record<string, any> = { exported_at: new Date().toISOString(), users: {} };
  const usersSnap = await getDocs(collection(firestore, "users"));

  for (const userDoc of usersSnap.docs) {
    const userId = userDoc.id;
    const userData: Record<string, any> = { ...userDoc.data(), subcollections: {} };
    const subcols = ["transactions", "budgets", "categories", "accounts", "investments", "goals"];

    for (const sub of subcols) {
      const subSnap = await getDocs(collection(firestore, "users", userId, sub));
      userData.subcollections[sub] = {};
      subSnap.docs.forEach((d) => {
        userData.subcollections[sub][d.id] = d.data();
      });
    }

    backup.users[userId] = userData;
  }

  // Also backup requester collection
  const reqSnap = await getDocs(collection(firestore, "requester"));
  backup.requesters = {};
  reqSnap.docs.forEach((d) => { backup.requesters[d.id] = d.data(); });

  // Also backup system_config
  try {
    const configDoc = await getDoc(doc(firestore, "system_config", "global"));
    if (configDoc.exists()) backup.system_config = configDoc.data();
  } catch {}

  onLog?.({ timestamp: Date.now(), level: "success", message: `สำรองข้อมูลสำเร็จ: ${Object.keys(backup.users).length} ผู้ใช้` });
  return backup;
}
