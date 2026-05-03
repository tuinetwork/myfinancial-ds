import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Account } from "@/types/finance";

export interface CarryOverDiffRow {
  period: string;
  current: number;
  correct: number;
  income: number;
  expenses: number;
  net: number;
  diff: number;
  hasBudgetDoc: boolean;
}

/**
 * คำนวณ carry_over ที่ถูกต้องสำหรับทุกเดือนจากศูนย์
 * net = income − expense (ไม่นับ transfer ทุกประเภท)
 * Guard: เดือนปัจจุบันยังไม่จบ → ไม่ rollover net เข้า running carry
 */
export async function computeCorrectCarryOvers(
  userId: string
): Promise<CarryOverDiffRow[]> {
  // 1) budgets
  const budgetsSnap = await getDocs(collection(firestore, "users", userId, "budgets"));
  const budgetMap = new Map<string, number>();
  budgetsSnap.docs.forEach((d) => {
    budgetMap.set(d.id, (d.data().carry_over as number) ?? 0);
  });

  // 2) transactions — group ตาม month_year (income/expense เท่านั้น)
  const txSnap = await getDocs(collection(firestore, "users", userId, "transactions"));
  const monthlyAgg = new Map<string, { income: number; expenses: number }>();

  txSnap.docs.forEach((d) => {
    const t = d.data();
    if (t.is_deleted) return;
    const period = (t.month_year as string) ?? "";
    if (!period) return;

    if (!monthlyAgg.has(period)) monthlyAgg.set(period, { income: 0, expenses: 0 });
    const agg = monthlyAgg.get(period)!;
    const amount = (t.amount as number) ?? 0;

    if (t.type === "income") agg.income += amount;
    else if (t.type === "expense") agg.expenses += amount;
    // transfer: ไม่นับทุกประเภท
  });

  // 4) sort periods แล้วคำนวณ carry ไล่จากเก่าไปใหม่
  const now = new Date();
  const todayPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const allPeriods = new Set<string>();
  budgetMap.forEach((_, k) => allPeriods.add(k));
  monthlyAgg.forEach((_, k) => allPeriods.add(k));
  const sortedPeriods = Array.from(allPeriods).sort();

  const rows: CarryOverDiffRow[] = [];
  let runningCarry = 0;

  for (const period of sortedPeriods) {
    const agg = monthlyAgg.get(period) ?? { income: 0, expenses: 0 };
    const net = agg.income - agg.expenses;
    const current = budgetMap.get(period) ?? 0;
    const correct = runningCarry;

    rows.push({
      period, current, correct,
      income: agg.income, expenses: agg.expenses, net,
      diff: correct - current,
      hasBudgetDoc: budgetMap.has(period),
    });

    // guard: เดือนปัจจุบันยังไม่จบ → ไม่ rollover net
    runningCarry = period === todayPeriod ? correct : correct + net;
  }

  return rows;
}

export interface WalletHistoryRow {
  period: string;
  carryOver: number;
  income: number;
  expenses: number;
  trueNetWorth: number;
  mainWalletBalance: number;
}

/**
 * คำนวณ mainWalletBalance ย้อนหลังทุกเดือน
 * trueNetWorth(M) = carry(M) + income(M) − expense(M)
 * mainWallet(M)  = trueNetWorth(M) − currentOtherAssets + currentLiabilities
 * หมายเหตุ: otherAssets/liabilities ใช้ยอด ณ ปัจจุบัน (snapshot)
 */
export async function computeWalletHistory(
  userId: string
): Promise<WalletHistoryRow[]> {
  const LIABILITY_TYPES = new Set(["credit_card", "loan", "payable"]);

  // 1) accounts (snapshot ปัจจุบัน)
  const accountsSnap = await getDocs(collection(firestore, "users", userId, "accounts"));
  const accounts: Account[] = accountsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Account))
    .filter((a) => !a.is_deleted && a.is_active !== false);

  const main = accounts.find((a) => a.name === "กระเป๋าเงินสดหลัก")
    ?? accounts.find((a) => a.type === "cash");

  let otherAssets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    if (main && a.id === main.id) continue;
    const bal = Number(a.balance) || 0;
    if (LIABILITY_TYPES.has(a.type)) {
      liabilities += Math.abs(bal);
    } else {
      otherAssets += bal;
    }
  }
  const correction = -otherAssets + liabilities;

  // 2) budgets → carry_over ต่อเดือน
  const budgetsSnap = await getDocs(collection(firestore, "users", userId, "budgets"));
  const carryMap = new Map<string, number>();
  budgetsSnap.docs.forEach((d) => {
    carryMap.set(d.id, (d.data().carry_over as number) ?? 0);
  });

  // 3) transactions → income/expense ต่อเดือน
  const txSnap = await getDocs(collection(firestore, "users", userId, "transactions"));
  const monthlyAgg = new Map<string, { income: number; expenses: number }>();
  txSnap.docs.forEach((d) => {
    const t = d.data();
    if (t.is_deleted) return;
    const period = (t.month_year as string) ?? "";
    if (!period) return;
    if (!monthlyAgg.has(period)) monthlyAgg.set(period, { income: 0, expenses: 0 });
    const agg = monthlyAgg.get(period)!;
    const amount = (t.amount as number) ?? 0;
    if (t.type === "income") agg.income += amount;
    else if (t.type === "expense") agg.expenses += amount;
  });

  // 4) รวม periods แล้ว sort
  const allPeriods = new Set<string>();
  carryMap.forEach((_, k) => allPeriods.add(k));
  monthlyAgg.forEach((_, k) => allPeriods.add(k));
  const sortedPeriods = Array.from(allPeriods).sort();

  return sortedPeriods.map((period) => {
    const carryOver = carryMap.get(period) ?? 0;
    const agg = monthlyAgg.get(period) ?? { income: 0, expenses: 0 };
    const trueNetWorth = carryOver + agg.income - agg.expenses;
    const mainWalletBalance = trueNetWorth + correction;
    return {
      period,
      carryOver,
      income: agg.income,
      expenses: agg.expenses,
      trueNetWorth,
      mainWalletBalance,
    };
  });
}

/**
 * เขียนทับ carry_over ใน Firestore สำหรับแถวที่มีผลต่าง > 0.01
 * เฉพาะเดือนที่มี budget doc อยู่จริงเท่านั้น
 */
export async function applyCarryOverFix(
  userId: string,
  rows: CarryOverDiffRow[]
): Promise<{ updated: number; skipped: number }> {
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.hasBudgetDoc) {
      skipped++;
      continue;
    }
    if (Math.abs(row.diff) <= 0.01) {
      skipped++;
      continue;
    }
    const ref = doc(firestore, "users", userId, "budgets", row.period);
    // double-check ว่าเอกสารยังอยู่
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      skipped++;
      continue;
    }
    await setDoc(ref, { carry_over: row.correct }, { merge: true });
    updated++;
  }

  return { updated, skipped };
}
