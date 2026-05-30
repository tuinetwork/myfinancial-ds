import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { LIABILITY_TYPES, CASH_EXCLUDED_LIAB_TYPES, getMainAccount } from "@/lib/wallet-balance";
import { getCurrentPeriod } from "@/lib/period";
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
  const todayPeriod = getCurrentPeriod();

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
  otherAssets: number;
  liabilities: number;          // รวม chit (ใช้ใน Net Worth / Dashboard liability display)
  cashExcludedLiab: number;     // ส่วนของ chit (ค่าแชร์) — ตัดออกจากสูตรเงินสดในมือ
  mainWalletBalance: number;    // คำนวณโดยตัด cashExcludedLiab ออกแล้ว
}

/**
 * คำนวณ mainWalletBalance ย้อนหลังทุกเดือน
 * ใช้ backward reconstruction: balance(M) = currentBalance − sum(effects ของ tx หลังจาก M)
 *
 * Effects ของ tx บน account:
 *   income   → to_account_id   += amount
 *   expense  → from_account_id -= amount
 *   transfer → from_account_id -= amount, to_account_id += amount
 */
export async function computeWalletHistory(
  userId: string
): Promise<WalletHistoryRow[]> {

  // 1) accounts — เก็บทั้งหมด (รวม inactive) เพราะอาจมี tx ผ่านบัญชีนั้น
  const accountsSnap = await getDocs(collection(firestore, "users", userId, "accounts"));
  const accounts: Account[] = accountsSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Account))
    .filter((a) => !a.is_deleted);

  const main = getMainAccount(accounts);

  const currentBalance = new Map(accounts.map((a) => [a.id, Number(a.balance) || 0]));

  // 2) budgets → carry_over ต่อเดือน
  const budgetsSnap = await getDocs(collection(firestore, "users", userId, "budgets"));
  const carryMap = new Map<string, number>();
  budgetsSnap.docs.forEach((d) => {
    carryMap.set(d.id, (d.data().carry_over as number) ?? 0);
  });

  // 3) transactions — group ตาม period
  const txSnap = await getDocs(collection(firestore, "users", userId, "transactions"));
  const txByPeriod = new Map<string, ReturnType<typeof txSnap.docs[0]["data"]>[]>();
  txSnap.docs.forEach((d) => {
    const t = d.data();
    if (t.is_deleted) return;
    const period = (t.month_year as string) ?? "";
    if (!period) return;
    if (!txByPeriod.has(period)) txByPeriod.set(period, []);
    txByPeriod.get(period)!.push(t);
  });

  // 4) รวม periods แล้ว sort
  const allPeriods = new Set<string>();
  carryMap.forEach((_, k) => allPeriods.add(k));
  txByPeriod.forEach((_, k) => allPeriods.add(k));
  const sortedPeriods = Array.from(allPeriods).sort();

  if (sortedPeriods.length === 0) return [];

  // 5) backward reconstruction
  // ไล่จากเดือนล่าสุดถอยหลัง
  // afterDelta[accountId] = ผลรวมของ effects ของ tx ใน periods หลังจาก period ปัจจุบัน
  const afterDelta = new Map<string, number>();

  const applyPeriodToAfterDelta = (period: string) => {
    for (const t of txByPeriod.get(period) ?? []) {
      const amt = Number(t.amount) || 0;
      if (t.type === "income") {
        if (t.to_account_id)
          afterDelta.set(t.to_account_id, (afterDelta.get(t.to_account_id) ?? 0) + amt);
      } else if (t.type === "expense") {
        if (t.from_account_id)
          afterDelta.set(t.from_account_id, (afterDelta.get(t.from_account_id) ?? 0) - amt);
      } else {
        // transfer
        if (t.from_account_id)
          afterDelta.set(t.from_account_id, (afterDelta.get(t.from_account_id) ?? 0) - amt);
        if (t.to_account_id)
          afterDelta.set(t.to_account_id, (afterDelta.get(t.to_account_id) ?? 0) + amt);
      }
    }
  };

  // คำนวณ account state ต่อ period (จากหลังไปหน้า)
  type AccountState = { otherAssets: number; liabilities: number; cashExcludedLiab: number; mainHistBal: number | null };
  const periodAccountState = new Map<string, AccountState>();

  for (let i = sortedPeriods.length - 1; i >= 0; i--) {
    const period = sortedPeriods[i];

    let otherAssets = 0;
    let liabilities = 0;
    let cashExcludedLiab = 0;
    let mainHistBal: number | null = null;
    for (const a of accounts) {
      if (main && a.id === main.id) {
        // อ่าน main wallet balance ย้อนหลังตรง ๆ (back-reconstruction จาก tx effects)
        mainHistBal = (currentBalance.get(a.id) ?? 0) - (afterDelta.get(a.id) ?? 0);
        continue;
      }
      const cur = currentBalance.get(a.id) ?? 0;
      const after = afterDelta.get(a.id) ?? 0;
      const hist = cur - after;
      if (LIABILITY_TYPES.has(a.type)) {
        const absHist = Math.abs(hist);
        liabilities += absHist;
        if (CASH_EXCLUDED_LIAB_TYPES.has(a.type)) cashExcludedLiab += absHist;
      } else {
        otherAssets += hist;
      }
    }

    periodAccountState.set(period, { otherAssets, liabilities, cashExcludedLiab, mainHistBal });

    // เพิ่ม effects ของ period นี้เข้า afterDelta (เตรียมสำหรับ period ก่อนหน้า)
    applyPeriodToAfterDelta(period);
  }

  // 6) Build rows
  return sortedPeriods.map((period) => {
    const carryOver = carryMap.get(period) ?? 0;
    let income = 0, expenses = 0;
    for (const t of txByPeriod.get(period) ?? []) {
      const amt = Number(t.amount) || 0;
      if (t.type === "income") income += amt;
      else if (t.type === "expense") expenses += amt;
    }
    const trueNetWorth = carryOver + income - expenses;
    const state = periodAccountState.get(period) ?? { otherAssets: 0, liabilities: 0, cashExcludedLiab: 0, mainHistBal: null };
    const { otherAssets, liabilities, cashExcludedLiab, mainHistBal } = state;
    // mainWalletBalance: อ่านจาก main account.balance ย้อนหลังตรง ๆ ถ้ามี
    // ไม่งั้น fall back สูตร trueNetWorth − otherAssets + (liabilities − cashExcludedLiab)
    const mainWalletBalance = mainHistBal !== null
      ? mainHistBal
      : trueNetWorth - otherAssets + (liabilities - cashExcludedLiab);
    return { period, carryOver, income, expenses, trueNetWorth, otherAssets, liabilities, cashExcludedLiab, mainWalletBalance };
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
