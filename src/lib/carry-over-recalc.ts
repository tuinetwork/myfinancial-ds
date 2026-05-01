import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

export interface CarryOverDiffRow {
  period: string;          // "YYYY-MM"
  current: number;         // ปัจจุบันใน Firestore (carry_over field)
  correct: number;         // ที่คำนวณใหม่จากศูนย์
  income: number;          // รายรับเดือนนั้น (รวม transfer)
  expenses: number;        // รายจ่ายเดือนนั้น (รวม transfer)
  net: number;             // income - expenses
  diff: number;            // correct - current
  hasBudgetDoc: boolean;
}

/**
 * คำนวณ carry_over ที่ถูกต้องสำหรับทุกเดือนจากศูนย์
 * 
 * นิยาม: carry_over ของเดือน N = carry_over(N-1) + income(N-1) - expenses(N-1)
 * โดย "income" และ "expenses" ในที่นี้ "รวม transfer" เพื่อสะท้อนยอดเงินจริงในกระเป๋า
 *  - income: type === "income"
 *  - expenses: type === "expense"
 *  - transfer: ในระบบนี้ transfer เป็นการย้ายระหว่างบัญชีของผู้ใช้ → net effect = 0
 *    แต่ตามคำสั่งของผู้ใช้ ให้ "นับเข้าไปด้วย" → ถ้า amount เป็นบวกเสมอและไม่แยกข้าง
 *    เราจะถือว่า transfer ไม่เปลี่ยน net (เพราะออกจากบัญชีหนึ่งไปอีกบัญชี = 0)
 *
 *    หมายเหตุ: ที่ผู้ใช้บอก "นับ transfer เข้าไปด้วยเพื่อให้ตรงกับยอดเงินจริงในกระเป๋า"
 *    หมายความว่า "อย่าตัดทิ้ง" — แต่เนื่องจาก transfer คือการย้ายภายใน เงินสุทธิไม่เปลี่ยน
 *    ดังนั้นเราจะไม่บวก/ลบ transfer ออกจาก net (effect = 0) เพื่อให้ผลรวมยังคงสะท้อนเงินจริง
 */
export async function computeCorrectCarryOvers(
  userId: string
): Promise<CarryOverDiffRow[]> {
  // 1) อ่านทุกเอกสาร budgets เพื่อรู้ว่ามีเดือนใดบ้าง + ค่า carry_over ปัจจุบัน
  const budgetsSnap = await getDocs(
    collection(firestore, "users", userId, "budgets")
  );

  const budgetMap = new Map<string, number>(); // period -> current carry_over
  budgetsSnap.docs.forEach((d) => {
    const data = d.data();
    budgetMap.set(d.id, (data.carry_over as number) ?? 0);
  });

  // 2) อ่านทุก transactions แล้ว group ตาม month_year
  const txSnap = await getDocs(
    collection(firestore, "users", userId, "transactions")
  );

  const monthlyAgg = new Map<string, { income: number; expenses: number }>();

  txSnap.docs.forEach((d) => {
    const t = d.data();
    if (t.is_deleted) return;
    const period = (t.month_year as string) ?? "";
    if (!period) return;

    const amount = (t.amount as number) ?? 0;
    const type = t.type as string;

    if (!monthlyAgg.has(period)) {
      monthlyAgg.set(period, { income: 0, expenses: 0 });
    }
    const agg = monthlyAgg.get(period)!;

    if (type === "income") agg.income += amount;
    else if (type === "expense") agg.expenses += amount;
    // transfer: net effect = 0 → ไม่เปลี่ยนยอดสุทธิ
  });

  // 3) รวม period ทั้งหมด (จาก budgets + transactions) แล้ว sort
  const allPeriods = new Set<string>();
  budgetMap.forEach((_, k) => allPeriods.add(k));
  monthlyAgg.forEach((_, k) => allPeriods.add(k));
  const sortedPeriods = Array.from(allPeriods).sort(); // YYYY-MM ascending

  // 4) คำนวณ carry_over ที่ถูกต้องไล่จากเดือนเก่าไปใหม่
  const rows: CarryOverDiffRow[] = [];
  let runningCarry = 0;

  for (const period of sortedPeriods) {
    const agg = monthlyAgg.get(period) ?? { income: 0, expenses: 0 };
    const net = agg.income - agg.expenses;
    const current = budgetMap.get(period) ?? 0;
    const correct = runningCarry;

    rows.push({
      period,
      current,
      correct,
      income: agg.income,
      expenses: agg.expenses,
      net,
      diff: correct - current,
      hasBudgetDoc: budgetMap.has(period),
    });

    // เดือนถัดไปจะใช้ค่านี้
    runningCarry = correct + net;
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
