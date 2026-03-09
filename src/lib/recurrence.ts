/**
 * RRULE utilities for recurring payments.
 * Supports a subset: FREQ=DAILY, FREQ=WEEKLY;BYDAY=XX, FREQ=MONTHLY
 */

const DAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

const DAY_REVERSE: Record<number, string> = {
  0: "SU", 1: "MO", 2: "TU", 3: "WE", 4: "TH", 5: "FR", 6: "SA",
};

const THAI_DAY_NAMES: Record<string, string> = {
  SU: "อาทิตย์", MO: "จันทร์", TU: "อังคาร", WE: "พุธ",
  TH: "พฤหัสบดี", FR: "ศุกร์", SA: "เสาร์",
};

export interface ParsedRRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY";
  byDay?: string; // e.g. "SA"
}

/** Parse an RRULE string into structured data */
export function parseRRule(rrule: string | null | undefined): ParsedRRule | null {
  if (!rrule) return null;
  const parts = rrule.split(";");
  let freq: ParsedRRule["freq"] | null = null;
  let byDay: string | undefined;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "FREQ") {
      if (value === "DAILY" || value === "WEEKLY" || value === "MONTHLY") {
        freq = value;
      }
    } else if (key === "BYDAY") {
      byDay = value;
    }
  }

  if (!freq) return null;
  return { freq, byDay };
}

/**
 * Expand a recurrence rule into all dates within a given year/month.
 * @param startDate - The original due_date (YYYY-MM-DD)
 * @param rrule - RRULE string
 * @param year - Target year
 * @param month - Target month (1-12)
 * @returns Array of date strings (YYYY-MM-DD) within the month
 */
export function expandRecurrence(
  startDate: string | null | undefined,
  rrule: string | null | undefined,
  year: number,
  month: number,
  rangeStart?: string | null,
  rangeEnd?: string | null
): string[] {
  const parsed = parseRRule(rrule);
  if (!parsed || !startDate) return [];

  const results: string[] = [];
  const pad = (n: number) => String(n).padStart(2, "0");

  if (parsed.freq === "DAILY") {
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      results.push(`${year}-${pad(month)}-${pad(d)}`);
    }
  } else if (parsed.freq === "WEEKLY" && parsed.byDay) {
    const targetDay = DAY_MAP[parsed.byDay];
    if (targetDay === undefined) return [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month - 1, d);
      if (date.getDay() === targetDay) {
        results.push(`${year}-${pad(month)}-${pad(d)}`);
      }
    }
  } else if (parsed.freq === "MONTHLY") {
    const startDay = parseInt(startDate.split("-")[2], 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const day = Math.min(startDay, daysInMonth);
    results.push(`${year}-${pad(month)}-${pad(day)}`);
  }

  // Filter by date range (start_date / end_date)
  return results.filter((dateStr) => {
    if (rangeStart && dateStr < rangeStart) return false;
    if (rangeEnd && dateStr > rangeEnd) return false;
    return true;
  });
}

/**
 * Format RRULE to Thai display string.
 */
export function formatFrequencyThai(rrule: string | null | undefined): string {
  const parsed = parseRRule(rrule);
  if (!parsed) return "จ่ายครั้งเดียว";

  if (parsed.freq === "DAILY") return "ทุกวัน";
  if (parsed.freq === "WEEKLY" && parsed.byDay) {
    const thaiDay = THAI_DAY_NAMES[parsed.byDay] ?? parsed.byDay;
    return `ทุกวัน${thaiDay}`;
  }
  if (parsed.freq === "MONTHLY") return "รายเดือน";
  return "จ่ายครั้งเดียว";
}

/**
 * Build an RRULE string from frequency type and optional date.
 * @param freq - "once" | "daily" | "weekly" | "monthly"
 * @param date - Date string to extract day-of-week for weekly
 */
export function buildRRule(freq: string, date?: string | null): string | null {
  if (!freq || freq === "once") return null;
  if (freq === "daily") return "FREQ=DAILY";
  if (freq === "monthly") return "FREQ=MONTHLY";
  if (freq === "weekly") {
    if (date) {
      const d = new Date(date);
      const dayCode = DAY_REVERSE[d.getDay()] ?? "MO";
      return `FREQ=WEEKLY;BYDAY=${dayCode}`;
    }
    return "FREQ=WEEKLY;BYDAY=MO";
  }
  return null;
}

/**
 * Get frequency type from RRULE string (for dropdown value).
 */
export function getFrequencyType(rrule: string | null | undefined): string {
  const parsed = parseRRule(rrule);
  if (!parsed) return "once";
  if (parsed.freq === "DAILY") return "daily";
  if (parsed.freq === "WEEKLY") return "weekly";
  if (parsed.freq === "MONTHLY") return "monthly";
  return "once";
}

export interface TxEntry {
  date: string;
  amount: number;
}

/**
 * Match transactions to occurrence dates with ±3 day tolerance.
 * Returns a Map of occurrence date → isPaid.
 * Transactions are consumed (not reused across occurrences).
 */
export function matchTxToOccurrences(
  txList: TxEntry[],
  occurrenceDates: string[],
  perOccurrence: number
): Map<string, boolean> {
  const result = new Map<string, boolean>();
  if (perOccurrence <= 0) {
    for (const d of occurrenceDates) result.set(d, false);
    return result;
  }

  // Clone so we can mark as used
  const pool = txList.map((tx, i) => ({ ...tx, used: false, idx: i }));

  // Sort occurrences chronologically
  const sorted = [...occurrenceDates].sort();

  for (const occDate of sorted) {
    const occTime = new Date(occDate).getTime();
    // Find matching transactions within ±3 days
    let matched = 0;
    for (const tx of pool) {
      if (tx.used) continue;
      const txTime = new Date(tx.date).getTime();
      const daysDiff = Math.abs(txTime - occTime) / (1000 * 60 * 60 * 24);
      if (daysDiff <= 3) {
        matched += tx.amount;
        tx.used = true;
        if (matched >= perOccurrence) break;
      }
    }
    result.set(occDate, matched >= perOccurrence);
  }

  return result;
}
