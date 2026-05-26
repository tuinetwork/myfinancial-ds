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
