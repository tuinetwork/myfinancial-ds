import {
  collection, doc, getDocs, getDoc, setDoc, updateDoc, addDoc, query, where,
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
