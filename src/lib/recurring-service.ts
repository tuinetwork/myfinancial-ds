import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, getDoc, query, where, onSnapshot, writeBatch,
} from "firebase/firestore";
import { firestore } from "./firebase";
import { createTransactionAtomic } from "./firestore-services";
import { format } from "date-fns";

export interface RecurringRule {
  id: string;
  label: string;
  amount: number;
  type: "expense" | "income";
  main_category: string;
  sub_category: string;
  day_of_month: number;
  from_account_id?: string;
  to_account_id?: string;
  note?: string;
  is_active: boolean;
  created_at: number;
  last_applied: string; // "YYYY-MM" of last applied period
}

export async function getRecurringRules(userId: string): Promise<RecurringRule[]> {
  const snap = await getDocs(collection(firestore, "users", userId, "recurring_rules"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecurringRule));
}

export function subscribeRecurringRules(userId: string, onChange: (rules: RecurringRule[]) => void): () => void {
  return onSnapshot(collection(firestore, "users", userId, "recurring_rules"), (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecurringRule)));
  });
}

export async function createRecurringRule(userId: string, data: Omit<RecurringRule, "id" | "created_at" | "last_applied">): Promise<string> {
  const ref = await addDoc(collection(firestore, "users", userId, "recurring_rules"), {
    ...data,
    created_at: Date.now(),
    last_applied: "",
  });
  return ref.id;
}

export async function updateRecurringRule(userId: string, ruleId: string, data: Partial<Omit<RecurringRule, "id" | "created_at">>): Promise<void> {
  await updateDoc(doc(firestore, "users", userId, "recurring_rules", ruleId), data);
}

export async function deleteRecurringRule(userId: string, ruleId: string): Promise<void> {
  // Read the rule first to get sub_category for cascade delete
  const ruleSnap = await getDoc(doc(firestore, "users", userId, "recurring_rules", ruleId));
  const rule = ruleSnap.exists() ? (ruleSnap.data() as RecurringRule) : null;

  // Delete rule
  await deleteDoc(doc(firestore, "users", userId, "recurring_rules", ruleId));

  // Cascade: delete auto-applied transactions ([จัดโนมัติ] prefix) that match this rule's sub_category
  if (rule?.sub_category) {
    const txCol = collection(firestore, "users", userId, "transactions");
    const q = query(txCol, where("sub_category", "==", rule.sub_category));
    const snap = await getDocs(q);
    const autoTxs = snap.docs.filter((d) => {
      const desc: string = d.data().description ?? "";
      return desc.startsWith("[จัดโนมัติ]");
    });
    if (autoTxs.length > 0) {
      const batch = writeBatch(firestore);
      autoTxs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
}

async function getNextTxId(userId: string, monthYear: string): Promise<string> {
  const txCol = collection(firestore, "users", userId, "transactions");
  const q = query(txCol, where("month_year", "==", monthYear));
  const snap = await getDocs(q);
  const prefix = `${monthYear}-tx-`;
  let maxNum = 0;
  snap.forEach((d) => {
    if (d.id.startsWith(prefix)) {
      const n = parseInt(d.id.slice(prefix.length), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

export async function applyRecurringRules(userId: string, period: string): Promise<number> {
  const rules = await getRecurringRules(userId);
  const active = rules.filter((r) => r.is_active && r.last_applied !== period);
  let applied = 0;

  for (const rule of active) {
    try {
      const [y, m] = period.split("-").map(Number);
      const daysInMonth = new Date(y, m, 0).getDate();
      const day = Math.min(rule.day_of_month, daysInMonth);
      const dateStr = `${period}-${String(day).padStart(2, "0")}`;
      const txId = await getNextTxId(userId, period);

      const txData: Record<string, any> = {
        type: rule.type,
        amount: rule.amount,
        date: dateStr,
        month_year: period,
        main_category: rule.main_category,
        sub_category: rule.sub_category,
        note: rule.note || `[อัตโนมัติ] ${rule.label}`,
        created_at: Date.now(),
        is_recurring: true,
      };

      const balanceUpdates: { accountId: string; delta: number }[] = [];
      if (rule.type === "expense" && rule.from_account_id) {
        txData.from_account_id = rule.from_account_id;
        balanceUpdates.push({ accountId: rule.from_account_id, delta: -rule.amount });
      } else if (rule.type === "income" && rule.to_account_id) {
        txData.to_account_id = rule.to_account_id;
        balanceUpdates.push({ accountId: rule.to_account_id, delta: rule.amount });
      }

      await createTransactionAtomic(userId, txId, txData, balanceUpdates);
      await updateDoc(doc(firestore, "users", userId, "recurring_rules", rule.id), { last_applied: period });
      applied++;
    } catch (err) {
      console.error(`Failed to apply recurring rule ${rule.id}:`, err);
    }
  }
  return applied;
}
