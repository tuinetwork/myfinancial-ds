import { collection, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Account } from "@/types/finance";

// ===== Constants =====

/** ชื่อบัญชีกระเป๋าหลัก (Main Wallet) */
export const MAIN_WALLET_NAME = "กระเป๋าเงินสดหลัก";

/** ประเภทบัญชีที่เป็นหนี้สิน (นับใน Net Worth, Dashboard, DebtPlanner ฯลฯ) */
export const LIABILITY_TYPES: ReadonlySet<string> = new Set([
  "credit_card",
  "loan",
  "payable",
  "chit",
]);

/**
 * ประเภทหนี้สินที่ "ตัดออก" จากสูตรเงินสดในมือ
 * (นับเป็นหนี้สินใน Net Worth ตามปกติ แต่ไม่ใช่เงินสดจริงในกระเป๋า)
 */
export const CASH_EXCLUDED_LIAB_TYPES: ReadonlySet<string> = new Set(["chit"]);

/** ประเภทบัญชี "ออม + ลงทุน" — ใช้แยก asset transfer จากกระเป๋าหลัก */
export const SAVINGS_INVESTMENT_TYPES: ReadonlySet<string> = new Set([
  "savings",
  "investment",
]);

/**
 * ประเภทหนี้สินแบบ "ก่อหนี้ใหม่ได้" (รับเงินจากแหล่งหนี้เข้ากระเป๋า)
 * — subset ของ LIABILITY_TYPES ที่ไม่นับ credit_card (ใช้แทน swipe ตรง ไม่ใช่ยืมเงินสด)
 */
export const BORROWING_DEBT_TYPES: ReadonlySet<string> = new Set([
  "loan",
  "payable",
  "chit",
]);

// ===== Account helpers =====

export const isMainAccount = (a: Account) => a.name === MAIN_WALLET_NAME;

export interface GetMainAccountOptions {
  /** ถ้า true จะกรองเฉพาะบัญชีที่ is_active (default: false) */
  requireActive?: boolean;
}

/**
 * หา "กระเป๋าหลัก" จาก list บัญชี — ลำดับความสำคัญ:
 *   1) ชื่อ MAIN_WALLET_NAME และไม่ถูกลบ
 *   2) Fallback: บัญชี cash ใดๆ ที่ไม่ถูกลบ
 */
export function getMainAccount(
  accounts: Account[],
  options: GetMainAccountOptions = {}
): Account | undefined {
  const pred = (a: Account) =>
    !a.is_deleted && (options.requireActive ? a.is_active : true);
  return (
    accounts.find((a) => a.name === MAIN_WALLET_NAME && pred(a)) ??
    accounts.find((a) => a.type === "cash" && pred(a))
  );
}

// ===== Main wallet reconstruction =====

export interface MainWalletBreakdown {
  /** ยอด "กระเป๋าเงินสดหลัก" = trueNetWorth − otherAssets + (liabilities − cashExcludedLiab) */
  mainBalance: number;
  /** ผลรวมยอดบัญชี non-liability ที่ไม่ใช่กระเป๋าหลัก (savings, investment, bank, ...) */
  otherAssets: number;
  /** ผลรวม |balance| ของบัญชีหนี้สินทุกประเภท (รวม chit) */
  liabilities: number;
  /** ส่วนของ liabilities ที่ตัดออกจากสูตรเงินสดในมือ (chit) */
  cashExcludedLiab: number;
}

/**
 * คำนวณยอด "กระเป๋าเงินสดหลัก" จาก trueNetWorth + balance ของบัญชีอื่น
 * (snapshot ณ ปัจจุบัน — สำหรับ historical per-period ใช้ computeWalletHistory)
 */
export function reconstructMainWallet(
  accounts: Account[],
  trueNetWorth: number
): MainWalletBreakdown {
  let otherAssets = 0;
  let liabilities = 0;
  let cashExcludedLiab = 0;

  for (const a of accounts) {
    if (isMainAccount(a)) continue;
    const bal = Number(a.balance) || 0;
    if (LIABILITY_TYPES.has(a.type)) {
      const absBal = Math.abs(bal);
      liabilities += absBal;
      if (CASH_EXCLUDED_LIAB_TYPES.has(a.type)) cashExcludedLiab += absBal;
    } else {
      otherAssets += bal;
    }
  }

  const mainBalance = trueNetWorth - otherAssets + (liabilities - cashExcludedLiab);
  return { mainBalance, otherAssets, liabilities, cashExcludedLiab };
}

// ===== trueNetWorth (cumulative income − expense from all transactions) =====

/**
 * ดึง trueNetWorth = sum(income) − sum(expense) จาก transactions ของผู้ใช้
 * (ไม่นับ transfer และไม่นับ tx ที่ is_deleted)
 */
export async function fetchTrueNetWorth(userId: string): Promise<number> {
  const snap = await getDocs(collection(firestore, "users", userId, "transactions"));
  let income = 0;
  let expense = 0;
  snap.forEach((d) => {
    const t = d.data();
    if (t.is_deleted) return;
    const amt = Number(t.amount) || 0;
    if (t.type === "income") income += amt;
    else if (t.type === "expense") expense += amt;
  });
  return income - expense;
}
