/**
 * Helpers ที่ใช้ตอน "อ่าน" transaction object ใน UI
 * (transaction object มี type ถูก map เป็นไทยแล้ว — ดู mapTransaction ใน useBudgetData.ts)
 */

export interface TransferLike {
  type?: string;
  category?: string;
}

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
