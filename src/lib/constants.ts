import type { BudgetData } from "@/hooks/useBudgetData";

// ===== Thai Month Names =====
export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ===== Category Mappings =====
export const EXPENSE_CATEGORY_MAP: Record<string, keyof BudgetData["expenses"]> = {
  "ค่าใช้จ่ายทั่วไป": "general",
  "บิลและสาธารณูปโภค": "bills",
  "หนี้สิน": "debts",
  "ค่าสมาชิกรายเดือน": "subscriptions",
  "เงินออมและการลงทุน": "savings",
};

export const MAIN_CATEGORY_TYPE_MAP: Record<string, string> = {
  "ค่าใช้จ่ายทั่วไป": "ค่าใช้จ่าย",
  "บิลและสาธารณูปโภค": "บิล/สาธารณูปโภค",
  "หนี้สิน": "หนี้สิน",
  "ค่าสมาชิกรายเดือน": "ค่าสมาชิกรายเดือน",
  "เงินออมและการลงทุน": "เงินออม/การลงทุน",
};

// ===== Date Formatters =====

/** "2026-04-09" → "9 เม.ย. 2569" */
export function formatThaiDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    const day = d.getDate();
    const month = THAI_MONTHS_SHORT[d.getMonth()];
    const buddhistYear = d.getFullYear() + 543;
    return `${day} ${month} ${buddhistYear}`;
  } catch {
    return "-";
  }
}

/** "2026-04-09" → "9 เม.ย. 69" (short year) */
export function formatThaiDateShort(dateStr: string): string {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  const buddhistYear = (y + 543) % 100;
  return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${buddhistYear}`;
}

/** "YYYY-MM" → "เมษายน" */
export function periodToMonthName(period: string): string {
  const [, monthStr] = period.split("-");
  const idx = parseInt(monthStr, 10) - 1;
  return THAI_MONTHS[idx] ?? period;
}
