export interface ParsedRow {
  date: string;       // YYYY-MM-DD
  amount: number;
  type: "income" | "expense";
  description: string;
  raw: string[];
}

export interface BankFormat {
  name: string;
  dateCol: number;
  amountCol: number;
  descCol: number;
  typeDetect: "split" | "signed"; // split=separate debit/credit cols, signed=one col with sign
  debitCol?: number;              // for split type: column with expense amounts
  creditCol?: number;             // for split type: column with income amounts
  dateFormat: "dmy_slash" | "ymd_dash" | "dmy_dash" | "auto";
}

export const BANK_FORMATS: BankFormat[] = [
  {
    name: "ธนาคารกรุงไทย (KTB)",
    dateCol: 0, amountCol: -1, descCol: 2,
    typeDetect: "split", debitCol: 3, creditCol: 4,
    dateFormat: "dmy_slash",
  },
  {
    name: "ธนาคารไทยพาณิชย์ (SCB)",
    dateCol: 0, amountCol: -1, descCol: 3,
    typeDetect: "split", debitCol: 1, creditCol: 2,
    dateFormat: "dmy_slash",
  },
  {
    name: "ธนาคารกสิกรไทย (KBANK)",
    dateCol: 0, amountCol: -1, descCol: 2,
    typeDetect: "split", debitCol: 3, creditCol: 4,
    dateFormat: "dmy_slash",
  },
  {
    name: "ธนาคารกรุงเทพ (BBL)",
    dateCol: 0, amountCol: -1, descCol: 2,
    typeDetect: "split", debitCol: 3, creditCol: 4,
    dateFormat: "dmy_slash",
  },
];

export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  // Normalize line endings
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQuote = false;
    let current = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
        else inQuote = !inQuote;
      } else if (ch === "," && !inQuote) {
        cols.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());
    rows.push(cols);
  }
  return rows;
}

function parseThaiDate(raw: string, fmt: BankFormat["dateFormat"]): string | null {
  // Remove commas (thousands separator in some formats)
  const s = raw.trim().replace(/,/g, "");
  if (!s) return null;

  try {
    if (fmt === "ymd_dash") {
      // YYYY-MM-DD
      const parts = s.split("-");
      if (parts.length === 3) return s;
    }

    if (fmt === "dmy_slash" || fmt === "auto") {
      // DD/MM/YYYY or DD/MM/YY (Thai year possible)
      const parts = s.split("/");
      if (parts.length === 3) {
        let [d, m, y] = parts.map((p) => parseInt(p, 10));
        // Thai Buddhist year (> 2500) → convert to CE
        if (y > 2500) y -= 543;
        if (y < 100) y += 2000;
        return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function parseAmount(raw: string): number {
  const cleaned = raw.replace(/,/g, "").replace(/\s/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : Math.abs(n);
}

export function detectBankFormat(headers: string[]): BankFormat | null {
  const h = headers.map((s) => s.toLowerCase().trim());
  const joined = h.join(",");

  if (joined.includes("ถอน") || joined.includes("debit")) {
    for (const fmt of BANK_FORMATS) {
      if (fmt.name.includes("KTB") && (joined.includes("วันที่") || joined.includes("date"))) return fmt;
      if (fmt.name.includes("SCB") && joined.includes("withdrawal")) return fmt;
      if (fmt.name.includes("KBANK")) return fmt;
    }
    return BANK_FORMATS[0]; // fallback to KTB format
  }
  return null;
}

export function mapRowToTransaction(row: string[], format: BankFormat): ParsedRow | null {
  const dateRaw = row[format.dateCol] || "";
  const date = parseThaiDate(dateRaw, format.dateFormat);
  if (!date) return null;

  let amount = 0;
  let type: "income" | "expense" = "expense";

  if (format.typeDetect === "split" && format.debitCol !== undefined && format.creditCol !== undefined) {
    const debit = parseAmount(row[format.debitCol] || "");
    const credit = parseAmount(row[format.creditCol] || "");
    if (debit > 0) { amount = debit; type = "expense"; }
    else if (credit > 0) { amount = credit; type = "income"; }
    else return null;
  } else {
    const raw = row[format.amountCol] || "";
    const signed = parseFloat(raw.replace(/,/g, ""));
    if (isNaN(signed) || signed === 0) return null;
    amount = Math.abs(signed);
    type = signed < 0 ? "expense" : "income";
  }

  const description = row[format.descCol] || "";
  return { date, amount, type, description, raw: row };
}
