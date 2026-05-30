/**
 * Helpers ที่ใช้ตอน "อ่าน" transaction object ใน UI
 * (transaction object มี type ถูก map เป็นไทยแล้ว — ดู mapTransaction ด้านล่าง)
 */

// ===== Types =====

/** กลุ่ม expense ใน budget — ตรงกับ key ใน BudgetData.expenses */
export type BudgetGroupKey = "general" | "bills" | "debts" | "subscriptions" | "savings";

/** Transaction object รูปแบบที่ใช้ใน UI (type/category map เป็นไทยแล้ว) */
export interface Transaction {
  id: string;
  date: string;
  amount: number;
  type: string;
  category: string;
  main_category?: string;
  description: string;
  // Extended fields (backward compatible)
  from_account_id?: string;
  to_account_id?: string;
  /** สำหรับ expense ที่ชำระหนี้: id ของบัญชีหนี้ที่ลดยอด */
  liability_account_id?: string;
  tags?: string[];
  is_deleted?: boolean;
  created_at?: number;
}

export interface TransferLike {
  type?: string;
  category?: string;
}

// ===== Category mapping =====

/** ชื่อหมวดหลักไทย → key ของ BudgetData.expenses */
export const EXPENSE_CATEGORY_MAP: Record<string, BudgetGroupKey> = {
  "ค่าใช้จ่ายทั่วไป": "general",
  "บิลและสาธารณูปโภค": "bills",
  "หนี้สิน": "debts",
  "ค่าสมาชิกรายเดือน": "subscriptions",
  "เงินออมและการลงทุน": "savings",
};

/** ชื่อหมวดหลักไทย → display type สำหรับ Transaction.type */
export const MAIN_CATEGORY_TYPE_MAP: Record<string, string> = {
  "ค่าใช้จ่ายทั่วไป": "ค่าใช้จ่าย",
  "บิลและสาธารณูปโภค": "บิล/สาธารณูปโภค",
  "หนี้สิน": "หนี้สิน",
  "ค่าสมาชิกรายเดือน": "ค่าสมาชิกรายเดือน",
  "เงินออมและการลงทุน": "เงินออม/การลงทุน",
};

// ===== Transfer detection =====

/**
 * true ถ้า transaction เป็น "โอน" — รวมทั้ง type "โอน" / "โอนระหว่างบัญชี"
 * และ tx ที่ category เป็น "โอนระหว่างบัญชี"
 */
export function isTransferTx(t: TransferLike): boolean {
  return (
    t.type === "โอน" ||
    t.type === "โอนระหว่างบัญชี" ||
    t.category === "โอนระหว่างบัญชี"
  );
}

// ===== Firestore doc → Transaction =====

/**
 * แปลง Firestore transaction doc → Transaction (display) object
 * — map type ภาษาอังกฤษ (income/expense/transfer) → ไทย
 * — map main_category → display type ตาม MAIN_CATEGORY_TYPE_MAP
 */
export function mapTransaction(
  docId: string,
  docData: Record<string, unknown>
): Transaction {
  const type = docData.type as string;
  const mainCategory = (docData.main_category as string) ?? "";

  let mappedType: string;
  if (type === "income") {
    mappedType = "รายรับ";
  } else if (type === "transfer") {
    mappedType = "โอน";
  } else {
    mappedType = MAIN_CATEGORY_TYPE_MAP[mainCategory] ?? "ค่าใช้จ่าย";
  }

  return {
    id: docId,
    date: (docData.date as string) ?? "",
    amount: (docData.amount as number) ?? 0,
    type: mappedType,
    main_category: mainCategory || undefined,
    category: (docData.sub_category as string) ?? "",
    description: (docData.note as string) ?? "",
    from_account_id: (docData.from_account_id as string) || undefined,
    to_account_id: (docData.to_account_id as string) || undefined,
    liability_account_id: (docData.liability_account_id as string) || undefined,
    tags: (docData.tags as string[]) || undefined,
    created_at: (docData.created_at as number) || undefined,
  };
}
