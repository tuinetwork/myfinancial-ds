import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

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

const DEBT_TYPES = new Set(["loan", "payable", "credit_card"]);

/**
 * คำนวณ carry_over ที่ถูกต้องสำหรับทุกเดือนจากศูนย์
 *
 * net[N] = income[N]
 *        + transfer เข้ากระเป๋าหลัก จาก savings/investment (ไม่รวม loan/payable/credit_card)
 *        − expense[N]
 *        − transfer ออกกระเป๋าหลัก ไป savings/investment (ไม่รวม loan/payable/credit_card)
 *
 * Guard: เดือนปัจจุบัน (ยังไม่จบ) → ไม่ rollover net เข้า running carry
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

  // 2) accounts — หา mainWalletId + typeById
  const accSnap = await getDocs(collection(firestore, "users", userId, "accounts"));
  const accs = accSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const main = accs.find((a) => a.name === "กระเป๋าเงินสดหลัก" && !a.is_deleted && a.is_active)
    ?? accs.find((a) => a.type === "cash" && !a.is_deleted && a.is_active);
  const mainWalletId: string | null = main?.id ?? null;
  const typeById = new Map(accs.map((a) => [a.id as string, a.type as string]));

  // 3) transactions — group ตาม month_year
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

    if (t.type === "income") {
      agg.income += amount;
    } else if (t.type === "expense") {
      agg.expenses += amount;
    } else if (t.type === "transfer" && mainWalletId) {
      if (t.to_account_id === mainWalletId) {
        const fromType = typeById.get(t.from_account_id ?? "") ?? "";
        if (!DEBT_TYPES.has(fromType)) agg.income += amount;
      } else if (t.from_account_id === mainWalletId) {
        const toType = typeById.get(t.to_account_id ?? "") ?? "";
        if (!DEBT_TYPES.has(toType)) agg.expenses += amount;
      }
    }
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
