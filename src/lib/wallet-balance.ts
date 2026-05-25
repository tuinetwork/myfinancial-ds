import type { Account } from "@/types/finance";

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

const isMainAccount = (a: Account) => a.name === "กระเป๋าเงินสดหลัก";

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
