import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, addDoc, deleteDoc, query, where,
  runTransaction, writeBatch,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Account, Investment, Goal } from "@/types/finance";

// ===== Helper: subcollection references =====
const accountsCol = (userId: string) => collection(firestore, "users", userId, "accounts");
const investmentsCol = (userId: string) => collection(firestore, "users", userId, "investments");
const goalsCol = (userId: string) => collection(firestore, "users", userId, "goals");

// =============================================
// ACCOUNTS
// =============================================
export async function getAccounts(userId: string): Promise<Account[]> {
  const snap = await getDocs(accountsCol(userId));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Account))
    .filter((a) => !a.is_deleted);
}

export async function getDefaultAccount(userId: string): Promise<Account | null> {
  const accounts = await getAccounts(userId);
  // Prefer the main wallet, otherwise first active cash account
  return (
    accounts.find((a) => a.name === "กระเป๋าเงินสดหลัก" && a.is_active) ||
    accounts.find((a) => a.type === "cash" && a.is_active) ||
    accounts[0] ||
    null
  );
}

export async function createAccount(
  userId: string,
  data: Omit<Account, "id">
): Promise<string> {
  const ref = await addDoc(accountsCol(userId), data);
  return ref.id;
}

export async function updateAccount(
  userId: string,
  accountId: string,
  data: Partial<Account>
): Promise<void> {
  await updateDoc(doc(firestore, "users", userId, "accounts", accountId), {
    ...data,
    updated_at: Date.now(),
  });
}

export async function softDeleteAccount(userId: string, accountId: string): Promise<void> {
  await updateAccount(userId, accountId, { is_deleted: true, is_active: false });
}

/**
 * Hard-delete an account and all its associated transactions.
 * Transactions linked via from_account_id or to_account_id will be removed.
 */
export async function deleteAccountWithTransactions(
  userId: string,
  accountId: string
): Promise<number> {
  const txCol = collection(firestore, "users", userId, "transactions");

  // Find all transactions linked to this account
  const [fromSnap, toSnap] = await Promise.all([
    getDocs(query(txCol, where("from_account_id", "==", accountId))),
    getDocs(query(txCol, where("to_account_id", "==", accountId))),
  ]);

  // Collect unique transaction doc refs
  const txRefs = new Map<string, any>();
  fromSnap.docs.forEach((d) => txRefs.set(d.id, d.ref));
  toSnap.docs.forEach((d) => txRefs.set(d.id, d.ref));

  const totalDeleted = txRefs.size;

  // Batch delete (Firestore batch limit = 500, chunk if needed)
  const refs = Array.from(txRefs.values());
  const accountRef = doc(firestore, "users", userId, "accounts", accountId);

  for (let i = 0; i < refs.length; i += 499) {
    const batch = writeBatch(firestore);
    const chunk = refs.slice(i, i + 499);
    chunk.forEach((ref) => batch.delete(ref));
    if (i === 0) batch.delete(accountRef); // delete account in first batch
    await batch.commit();
  }

  // If no transactions, still delete the account
  if (refs.length === 0) {
    await deleteDoc(accountRef);
  }

  return totalDeleted;
}

// =============================================
// INVESTMENTS
// =============================================
export async function getInvestments(userId: string): Promise<Investment[]> {
  const snap = await getDocs(investmentsCol(userId));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Investment))
    .filter((i) => !i.is_deleted);
}

export async function createInvestment(
  userId: string,
  data: Omit<Investment, "id">
): Promise<string> {
  const ref = await addDoc(investmentsCol(userId), data);
  return ref.id;
}

export async function updateInvestment(
  userId: string,
  investmentId: string,
  data: Partial<Investment>
): Promise<void> {
  await updateDoc(doc(firestore, "users", userId, "investments", investmentId), {
    ...data,
    last_updated: Date.now(),
  });
}

export async function softDeleteInvestment(userId: string, investmentId: string): Promise<void> {
  await updateInvestment(userId, investmentId, { is_deleted: true });
}

// =============================================
// GOALS
// =============================================
export async function getGoals(userId: string): Promise<Goal[]> {
  const snap = await getDocs(goalsCol(userId));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Goal))
    .filter((g) => !g.is_deleted);
}

export async function createGoal(
  userId: string,
  data: Omit<Goal, "id">
): Promise<string> {
  const ref = await addDoc(goalsCol(userId), data);
  return ref.id;
}

export async function updateGoal(
  userId: string,
  goalId: string,
  data: Partial<Goal>
): Promise<void> {
  await updateDoc(doc(firestore, "users", userId, "goals", goalId), data);
}

export async function softDeleteGoal(userId: string, goalId: string): Promise<void> {
  await updateGoal(userId, goalId, { is_deleted: true });
}

// =============================================
// ATOMIC TRANSACTION OPERATIONS (runTransaction)
// =============================================

/**
 * Create a transaction AND update account balance atomically.
 * Prevents race conditions where balance and transaction get out of sync.
 */
export async function createTransactionAtomic(
  userId: string,
  transactionId: string,
  txData: Record<string, any>,
  balanceUpdates: { accountId: string; delta: number }[]
): Promise<void> {
  const txRef = doc(firestore, "users", userId, "transactions", transactionId);

  try {
    await runTransaction(firestore, async (transaction) => {
      // Read all affected accounts first (Firestore requires reads before writes)
      const accountRefs = balanceUpdates.map((u) =>
        doc(firestore, "users", userId, "accounts", u.accountId)
      );
      const accountSnaps = await Promise.all(
        accountRefs.map((ref) => transaction.get(ref))
      );

      // Validate all accounts exist
      accountSnaps.forEach((snap, i) => {
        if (!snap.exists()) {
          throw new Error(`Account ${balanceUpdates[i].accountId} not found`);
        }
      });

      // Write transaction document
      transaction.set(txRef, txData);

      // Update each account balance atomically
      accountSnaps.forEach((snap, i) => {
        const currentBalance = snap.data()!.balance ?? 0;
        const newBalance = Math.round((currentBalance + balanceUpdates[i].delta) * 100) / 100;
        transaction.update(accountRefs[i], {
          balance: newBalance,
          updated_at: Date.now(),
        });
      });
    });
  } catch (err: any) {
    // Offline fallback: runTransaction fails offline, use direct writes instead
    // Firestore persistent cache will queue these and sync when back online
    if (err?.code === "unavailable" || err?.message?.includes("offline")) {
      await setDoc(txRef, txData);
      for (const update of balanceUpdates) {
        const accRef = doc(firestore, "users", userId, "accounts", update.accountId);
        const accSnap = await getDoc(accRef);
        if (accSnap.exists()) {
          const currentBalance = accSnap.data().balance ?? 0;
          const newBalance = Math.round((currentBalance + update.delta) * 100) / 100;
          await updateDoc(accRef, { balance: newBalance, updated_at: Date.now() });
        }
      }
    } else {
      throw err;
    }
  }
}

/**
 * Delete a transaction AND reverse its balance effect atomically.
 */
export async function deleteTransactionAtomic(
  userId: string,
  transactionId: string,
  balanceReversals: { accountId: string; delta: number }[]
): Promise<void> {
  const txRef = doc(firestore, "users", userId, "transactions", transactionId);

  try {
    await runTransaction(firestore, async (transaction) => {
      const txSnap = await transaction.get(txRef);
      if (!txSnap.exists()) throw new Error("Transaction not found");

      const accountRefs = balanceReversals.map((u) =>
        doc(firestore, "users", userId, "accounts", u.accountId)
      );
      const accountSnaps = await Promise.all(
        accountRefs.map((ref) => transaction.get(ref))
      );

      // Delete transaction
      transaction.delete(txRef);

      // Reverse balance changes
      accountSnaps.forEach((snap, i) => {
        if (!snap.exists()) return;
        const currentBalance = snap.data()!.balance ?? 0;
        const newBalance = Math.round((currentBalance + balanceReversals[i].delta) * 100) / 100;
        transaction.update(accountRefs[i], {
          balance: newBalance,
          updated_at: Date.now(),
        });
      });
    });
  } catch (err: any) {
    if (err?.code === "unavailable" || err?.message?.includes("offline")) {
      await deleteDoc(txRef);
      for (const rev of balanceReversals) {
        const accRef = doc(firestore, "users", userId, "accounts", rev.accountId);
        const accSnap = await getDoc(accRef);
        if (accSnap.exists()) {
          const currentBalance = accSnap.data().balance ?? 0;
          const newBalance = Math.round((currentBalance + rev.delta) * 100) / 100;
          await updateDoc(accRef, { balance: newBalance, updated_at: Date.now() });
        }
      }
    } else {
      throw err;
    }
  }
}

/**
 * Update a transaction AND adjust account balances atomically.
 * oldBalanceReversals: undo the old transaction's effect
 * newBalanceUpdates: apply the new transaction's effect
 */
export async function updateTransactionAtomic(
  userId: string,
  transactionId: string,
  updatedFields: Record<string, any>,
  oldBalanceReversals: { accountId: string; delta: number }[],
  newBalanceUpdates: { accountId: string; delta: number }[]
): Promise<void> {
  const txRef = doc(firestore, "users", userId, "transactions", transactionId);

  // Combine all unique account IDs
  const allUpdates = new Map<string, number>();
  for (const r of oldBalanceReversals) {
    allUpdates.set(r.accountId, (allUpdates.get(r.accountId) ?? 0) + r.delta);
  }
  for (const u of newBalanceUpdates) {
    allUpdates.set(u.accountId, (allUpdates.get(u.accountId) ?? 0) + u.delta);
  }

  try {
    await runTransaction(firestore, async (transaction) => {
      const txSnap = await transaction.get(txRef);
      if (!txSnap.exists()) throw new Error("Transaction not found");

      const accountEntries = Array.from(allUpdates.entries());
      const accountRefs = accountEntries.map(([id]) =>
        doc(firestore, "users", userId, "accounts", id)
      );
      const accountSnaps = await Promise.all(
        accountRefs.map((ref) => transaction.get(ref))
      );

      // Update transaction
      transaction.update(txRef, { ...updatedFields, updated_at: Date.now() });

      // Apply net balance changes
      accountSnaps.forEach((snap, i) => {
        if (!snap.exists()) return;
        const currentBalance = snap.data()!.balance ?? 0;
        const netDelta = accountEntries[i][1];
        if (netDelta === 0) return;
        const newBalance = Math.round((currentBalance + netDelta) * 100) / 100;
        transaction.update(accountRefs[i], {
          balance: newBalance,
          updated_at: Date.now(),
        });
      });
    });
  } catch (err: any) {
    if (err?.code === "unavailable" || err?.message?.includes("offline")) {
      await updateDoc(txRef, { ...updatedFields, updated_at: Date.now() });
      for (const [accountId, netDelta] of allUpdates.entries()) {
        if (netDelta === 0) continue;
        const accRef = doc(firestore, "users", userId, "accounts", accountId);
        const accSnap = await getDoc(accRef);
        if (accSnap.exists()) {
          const currentBalance = accSnap.data().balance ?? 0;
          const newBalance = Math.round((currentBalance + netDelta) * 100) / 100;
          await updateDoc(accRef, { balance: newBalance, updated_at: Date.now() });
        }
      }
    } else {
      throw err;
    }
  }
}
