/**
 * Period (YYYY-MM) และ Date (YYYY-MM-DD) helpers
 * — รูปแบบเดียวกับที่ใช้ใน Firestore (`month_year`, `date`, `budgets/{period}`)
 */

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM" จาก Date ที่ระบุ (default = วันนี้) */
export function formatPeriod(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

/** "YYYY-MM" ของวันนี้ — ใช้สำหรับ guard logic ของ "เดือนปัจจุบัน" */
export function getCurrentPeriod(): string {
  return formatPeriod();
}

/** "YYYY-MM-DD" จาก Date ที่ระบุ (default = วันนี้) */
export function formatDateYMD(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// ===== Period arithmetic =====

/** "YYYY-MM" ก่อนหน้า — ถ้าเป็น "2026-01" → "2025-12" */
export function getPreviousPeriod(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${pad2(month)}`;
}

/** "YYYY-MM" ถัดไป — ถ้าเป็น "2025-12" → "2026-01" */
export function getNextPeriod(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) + 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${pad2(month)}`;
}

// ===== Thai month names =====

/** ชื่อเดือนไทยแบบเต็ม (index 0 = มกราคม) */
export const THAI_MONTHS_FULL: readonly string[] = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** ชื่อเดือนไทยแบบย่อ (index 0 = ม.ค.) */
export const THAI_MONTHS_SHORT: readonly string[] = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * ชื่อเดือนไทย จากเลข 1-12
 * @param month เลขเดือน 1..12
 * @param short true = แบบย่อ (default false = เต็ม)
 */
export function getThaiMonthName(month: number, short = false): string {
  const idx = month - 1;
  const arr = short ? THAI_MONTHS_SHORT : THAI_MONTHS_FULL;
  return arr[idx] ?? "";
}
