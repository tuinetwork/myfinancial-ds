import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { getAccounts } from "@/lib/firestore-services";
import type { Account } from "@/types/finance";

export interface BudgetItem {
  label: string;
  budget: number;
  dueDate?: string | null;
  recurrence?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  paidDates?: string[];
  /** Original main category name from Firestore (e.g. "ค่าใช้จ่ายทั่วไป", "ค่าดูแลเด็ก ๆ") */
  mainCategory?: string;
}

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
  tags?: string[];
  is_deleted?: boolean;
  created_at?: number;
}

export interface BudgetData {
  status: string;
  month: string;
  period: string; // "YYYY-MM" format
  timestamp: string;
  income: BudgetItem[];
  expenses: {
    general: BudgetItem[];
    bills: BudgetItem[];
    debts: BudgetItem[];
    subscriptions: BudgetItem[];
    savings: BudgetItem[];
  };
  transactions: Transaction[];
  carryOver?: number;
}

export interface MonthOption {
  year: string;
  month: string;
  monthName: string;
  period: string;
  label: string;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function periodToMonthName(period: string): string {
  const [, monthStr] = period.split("-");
  const idx = parseInt(monthStr, 10) - 1;
  return THAI_MONTHS[idx] ?? period;
}

const EXPENSE_CATEGORY_MAP: Record<string, keyof BudgetData["expenses"]> = {
  "ค่าใช้จ่ายทั่วไป": "general",
  "บิลและสาธารณูปโภค": "bills",
  "หนี้สิน": "debts",
  "ค่าสมาชิกรายเดือน": "subscriptions",
  "เงินออมและการลงทุน": "savings",
};

const MAIN_CATEGORY_TYPE_MAP: Record<string, string> = {
  "ค่าใช้จ่ายทั่วไป": "ค่าใช้จ่าย",
  "บิลและสาธารณูปโภค": "บิล/สาธารณูปโภค",
  "หนี้สิน": "หนี้สิน",
  "ค่าสมาชิกรายเดือน": "ค่าสมาชิกรายเดือน",
  "เงินออมและการลงทุน": "เงินออม/การลงทุน",
};

function budgetsCollection(userId: string) {
  return collection(firestore, "users", userId, "budgets");
}

function transactionsCollection(userId: string) {
  return collection(firestore, "users", userId, "transactions");
}

function parseBudgetDoc(
  docData: Record<string, unknown>,
  transactions: Transaction[]
): BudgetData {
  const period = (docData.period as string) ?? "";
  const monthName = periodToMonthName(period);
  const carryOver = (docData.carry_over as number) ?? 0;

  // income_estimates → BudgetItem[] (nested: { group: { label: amount } })
  const incomeEstimates = (docData.income_estimates ?? {}) as Record<string, Record<string, number> | number>;
  const income: BudgetItem[] = [];
  for (const [key, val] of Object.entries(incomeEstimates)) {
    if (typeof val === "number") {
      income.push({ label: key, budget: val });
    } else if (typeof val === "object") {
      for (const [subLabel, subVal] of Object.entries(val)) {
        income.push({ label: subLabel, budget: subVal });
      }
    }
  }

  // expense_budgets → expenses groups (supports both number and {amount, due_date} formats)
  const expenseBudgets = (docData.expense_budgets ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const expenses: BudgetData["expenses"] = {
    general: [],
    bills: [],
    debts: [],
    subscriptions: [],
    savings: [],
  };
  for (const [mainCat, subs] of Object.entries(expenseBudgets)) {
    // Map known main categories to their group; unknown/custom main categories
    // (e.g. "ค่าดูแลเด็ก ๆ") fall back to "general" so they appear under "ค่าใช้จ่าย".
    const key = EXPENSE_CATEGORY_MAP[mainCat] ?? "general";
    if (subs && typeof subs === "object") {
      const mapped = Object.entries(subs).map(([label, val]) => {
        const budget = typeof val === "number" ? val : (val as any)?.amount ?? 0;
        const dueDate = typeof val === "object" && val !== null ? (val as any)?.due_date ?? null : null;
        const recurrence = typeof val === "object" && val !== null ? (val as any)?.recurrence ?? null : null;
        const startDate = typeof val === "object" && val !== null ? (val as any)?.start_date ?? null : null;
        const endDate = typeof val === "object" && val !== null ? (val as any)?.end_date ?? null : null;
        const paidDates = typeof val === "object" && val !== null ? (val as any)?.paid_dates ?? [] : [];
        return { label, budget, dueDate, recurrence, startDate, endDate, paidDates, mainCategory: mainCat };
      });
      expenses[key] = [...expenses[key], ...mapped];
    }
  }

  return {
    status: "ok",
    month: monthName,
    period,
    timestamp: new Date().toISOString(),
    income,
    expenses,
    transactions,
    carryOver,
  };
}

function mapTransaction(docId: string, docData: Record<string, unknown>): Transaction {
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
    tags: (docData.tags as string[]) || undefined,
    created_at: (docData.created_at as number) || undefined,
  };
}

function enrichTransferCategories(
  transactions: Transaction[],
  accounts: Account[]
): Transaction[] {
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  return transactions.map(t => {
    if (t.type === "โอน" && t.category === "โอนระหว่างบัญชี" && t.to_account_id) {
      const dest = accountMap.get(t.to_account_id);
      if (dest && (dest.type === "investment" || dest.type === "savings")) {
        return { ...t, category: dest.name };
      }
    }
    return t;
  });
}

export function getPreviousPeriod(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10) - 1; // go back one month
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Incremental carry_over: use previous month's carry_over + previous month's net income
 *  Falls back to full scan only when previous month has no carry_over data */
async function syncCarryOver(userId: string, currentPeriod: string): Promise<void> {
  const prevPeriod = getPreviousPeriod(currentPeriod);
  const prevDocRef = doc(firestore, "users", userId, "budgets", prevPeriod);
  const prevSnap = await getDoc(prevDocRef);

  let carryOver: number;

  if (prevSnap.exists()) {
    const prevData = prevSnap.data();
    const prevCarry = (prevData.carry_over as number) ?? 0;

    // Get only previous month's transactions (not all history)
    const prevTxQuery = query(
      transactionsCollection(userId),
      where("month_year", "==", prevPeriod)
    );
    const prevTxSnap = await getDocs(prevTxQuery);

    let prevIncome = 0;
    let prevExpenses = 0;
    prevTxSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.type === "transfer") return;
      if (data.type === "income") {
        prevIncome += (data.amount as number) ?? 0;
      } else {
        prevExpenses += (data.amount as number) ?? 0;
      }
    });

    carryOver = prevCarry + prevIncome - prevExpenses;
  } else {
    // Fallback: full scan for first month or missing data
    const txQuery = query(
      transactionsCollection(userId),
      where("month_year", "<", currentPeriod)
    );
    const txSnap = await getDocs(txQuery);

    let income = 0;
    let expenses = 0;
    txSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.type === "transfer") return;
      if (data.type === "income") {
        income += (data.amount as number) ?? 0;
      } else {
        expenses += (data.amount as number) ?? 0;
      }
    });
    carryOver = income - expenses;
  }

  const currentDocRef = doc(firestore, "users", userId, "budgets", currentPeriod);
  const currentSnap = await getDoc(currentDocRef);
  if (!currentSnap.exists()) return;

  const existingCarryOver = (currentSnap.data().carry_over as number) ?? 0;

  if (Math.abs(existingCarryOver - carryOver) > 0.01) {
    await setDoc(currentDocRef, { carry_over: carryOver }, { merge: true });
  }
}

function getCurrentMonthOption(): MonthOption {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const period = `${year}-${month}`;
  const monthName = THAI_MONTHS[now.getMonth()];
  return { year, month, monthName, period, label: `${monthName} ${year}` };
}

function getNextMonthOption(): MonthOption {
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 2; // +2 because getMonth() is 0-based
  if (m > 12) { m = 1; y += 1; }
  const year = String(y);
  const month = String(m).padStart(2, "0");
  const period = `${year}-${month}`;
  const monthName = THAI_MONTHS[m - 1];
  return { year, month, monthName, period, label: `${monthName} ${year}` };
}

function ensureCurrentMonth(options: MonthOption[]): MonthOption[] {
  const current = getCurrentMonthOption();
  let result = options.slice();
  if (!result.some((o) => o.period === current.period)) {
    result = [current, ...result];
  }
  // Filter out future months
  return result.filter((o) => o.period <= current.period).sort((a, b) => b.period.localeCompare(a.period));
}

function ensureUpToNextMonth(options: MonthOption[]): MonthOption[] {
  const current = getCurrentMonthOption();
  const next = getNextMonthOption();
  let result = options.slice();
  if (!result.some((o) => o.period === current.period)) {
    result.push(current);
  }
  if (!result.some((o) => o.period === next.period)) {
    result.push(next);
  }
  return result.sort((a, b) => b.period.localeCompare(a.period));
}

/** Auto-create a new budget document by copying the latest budget (including amounts) */
export async function createBudgetFromLatest(userId: string, period: string): Promise<boolean> {
  const budgetsCol = budgetsCollection(userId);
  
  // Get the latest existing budget (sorted by period descending)
  const allSnap = await getDocs(budgetsCol);
  if (allSnap.empty) return false;

  // Find the latest period
  let latestDoc: Record<string, unknown> | null = null;
  let latestPeriod = "";
  allSnap.forEach((d) => {
    const data = d.data();
    const p = (data.period as string) ?? d.id;
    if (p > latestPeriod && p !== period) {
      latestPeriod = p;
      latestDoc = data as Record<string, unknown>;
    }
  });

  if (!latestDoc) return false;

  const incomeEstimates = (latestDoc.income_estimates ?? {}) as Record<string, Record<string, number>>;
  const expenseBudgets = (latestDoc.expense_budgets ?? {}) as Record<string, Record<string, number>>;

  // Write new budget document copying amounts from latest
  const docRef = doc(firestore, "users", userId, "budgets", period);
  await setDoc(docRef, {
    period,
    carry_over: 0,
    income_estimates: incomeEstimates,
    expense_budgets: expenseBudgets,
  });

  return true;
}

/** Parse budgets snapshot into MonthOption[] */
function parseBudgetSnapshotToOptions(snapshot: any): MonthOption[] {
  const options: MonthOption[] = [];
  snapshot.forEach((d: any) => {
    const data = d.data();
    const period = (data.period as string) ?? d.id;
    const [year, monthNum] = period.split("-");
    const monthName = periodToMonthName(period);
    options.push({ year, month: monthNum, monthName, period, label: `${monthName} ${year}` });
  });
  options.sort((a, b) => b.period.localeCompare(a.period));
  return options;
}

/** Fetch available year/month options from budgets collection (single shared listener) */
export function useAvailableMonths() {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = onSnapshot(budgetsCollection(userId), (snapshot) => {
      const options = parseBudgetSnapshotToOptions(snapshot);
      queryClient.setQueryData(["available-months", userId], ensureCurrentMonth(options));
      queryClient.setQueryData(["available-months-next", userId], ensureUpToNextMonth(options));
    });
    return () => unsubscribe();
  }, [queryClient, userId]);

  return useQuery<MonthOption[]>({
    queryKey: ["available-months", userId],
    queryFn: async () => {
      if (!userId) return [];
      const snapshot = await getDocs(budgetsCollection(userId));
      return ensureCurrentMonth(parseBudgetSnapshotToOptions(snapshot));
    },
    enabled: !!userId,
    staleTime: Infinity,
  });
}

/** Like useAvailableMonths but includes next month for budget planning — shares listener with useAvailableMonths */
export function useAvailableMonthsWithNextMonth() {
  const { userId } = useAuth();

  return useQuery<MonthOption[]>({
    queryKey: ["available-months-next", userId],
    queryFn: async () => {
      if (!userId) return [];
      const snapshot = await getDocs(budgetsCollection(userId));
      return ensureUpToNextMonth(parseBudgetSnapshotToOptions(snapshot));
    },
    enabled: !!userId,
    staleTime: Infinity,
  });
}

/** Fetch budget data + transactions for a period */
export function useBudgetData(period?: string) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();

  // Auto-sync carry_over when period changes
  useEffect(() => {
    if (!period || !userId) return;
    syncCarryOver(userId, period).catch((err) =>
      console.warn("syncCarryOver failed:", err)
    );
  }, [period, userId]);

  useEffect(() => {
    if (!period || !userId) return;

    let latestBudgetData: Record<string, unknown> | null = null;
    let latestTxDocs: any[] = [];
    let accountsCache: Account[] | null = null;
    let accountsFetchPromise: Promise<Account[]> | null = null;

    const getCachedAccounts = async (): Promise<Account[]> => {
      if (accountsCache) return accountsCache;
      if (!accountsFetchPromise) {
        accountsFetchPromise = getAccounts(userId).then((accs) => {
          accountsCache = accs;
          // Invalidate cache after 60s to stay fresh
          setTimeout(() => { accountsCache = null; accountsFetchPromise = null; }, 60000);
          return accs;
        });
      }
      return accountsFetchPromise;
    };

    const rebuild = async () => {
      if (!latestBudgetData) return;
      const accs = await getCachedAccounts();
      const transactions = enrichTransferCategories(
        latestTxDocs.map((d: any) => mapTransaction(d.id, d.data() as Record<string, unknown>)),
        accs
      );
      queryClient.setQueryData(
        ["budget-data", period],
        parseBudgetDoc(latestBudgetData, transactions)
      );
    };

    const budgetDocRef = doc(firestore, "users", userId, "budgets", period);
    const unsubBudget = onSnapshot(budgetDocRef, async (budgetSnap) => {
      if (!budgetSnap.exists()) {
        const created = await createBudgetFromLatest(userId, period);
        if (!created) return;
        return;
      }
      latestBudgetData = budgetSnap.data() as Record<string, unknown>;
      rebuild();
    });

    const txQuery = query(
      transactionsCollection(userId),
      where("month_year", "==", period)
    );
    const unsubTx = onSnapshot(txQuery, (txSnap) => {
      latestTxDocs = txSnap.docs;
      accountsCache = null; // refresh accounts on tx change (may have new transfers)
      accountsFetchPromise = null;
      rebuild();
    });

    return () => {
      unsubBudget();
      unsubTx();
    };
  }, [period, queryClient, userId]);

  return useQuery<BudgetData>({
    queryKey: ["budget-data", period],
    queryFn: async () => {
      if (!userId) throw new Error("Not authenticated");
      const accs = await getAccounts(userId);
      const budgetSnap = await getDoc(
        doc(firestore, "users", userId, "budgets", period!)
      );
      if (!budgetSnap.exists()) {
        // Auto-create budget from latest
        const created = await createBudgetFromLatest(userId, period!);
        if (!created) throw new Error("No data found");
        // Re-fetch after creation
        const newSnap = await getDoc(doc(firestore, "users", userId, "budgets", period!));
        if (!newSnap.exists()) throw new Error("No data found");
        const txQuery2 = query(
          transactionsCollection(userId),
          where("month_year", "==", period!)
        );
        const txSnap2 = await getDocs(txQuery2);
        const transactions2 = enrichTransferCategories(
          txSnap2.docs.map((d) => mapTransaction(d.id, d.data() as Record<string, unknown>)),
          accs
        );
        return parseBudgetDoc(newSnap.data() as Record<string, unknown>, transactions2);
      }
      const txQuery = query(
        transactionsCollection(userId),
        where("month_year", "==", period!)
      );
      const txSnap = await getDocs(txQuery);
      const transactions = enrichTransferCategories(
        txSnap.docs.map((d) => mapTransaction(d.id, d.data() as Record<string, unknown>)),
        accs
      );
      return parseBudgetDoc(
        budgetSnap.data() as Record<string, unknown>,
        transactions
      );
    },
    enabled: !!period && !!userId,
    staleTime: Infinity,
  });
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
