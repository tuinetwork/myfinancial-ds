import { useState, useEffect, useMemo } from "react";
import { doc, getDoc, updateDoc, onSnapshot, collection, query, where, getDocs, arrayUnion, arrayRemove } from "firebase/firestore";
import { expandRecurrence, formatFrequencyThai, matchTxToOccurrences, parseRRule, type TxEntry, type TxMatchResult } from "@/lib/recurrence";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  CalendarDays, ChevronLeft, ChevronRight, Home, GripVertical,
  Banknote, Clock, AlertTriangle, CircleDollarSign, Receipt, Landmark, X, Move, CheckCircle2, RefreshCw,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { formatCurrency } from "@/hooks/useBudgetData";

interface DueDateItem {
  mainCategory: string;
  subCategory: string;
  amount: number;
  dueDate: string;
  paidAmount: number;
  isPaid: boolean;
  isRecurring: boolean;
  recurrence?: string | null;
  paidDates?: string[];
  txDaysDiff?: number; // positive = late, negative = early, 0 = on time, undefined = not matched by tx
  txDate?: string; // actual transaction date that matched
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const THAI_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "บิลและสาธารณูปโภค": Receipt,
  "หนี้สิน": Landmark,
  "เงินออมและการลงทุน": CircleDollarSign,
  "ค่าสมาชิกรายเดือน": Banknote,
};

function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const thaiMonth = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][d.getMonth()];
  const buddhistYear = d.getFullYear() + 543;
  return `${day} ${thaiMonth} ${buddhistYear}`;
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function getStartPadding(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

type ExpenseBudgetValue =
  | number
  | { amount: number; due_date?: string | null; recurrence?: string | null; start_date?: string | null; end_date?: string | null; paid_dates?: string[] }
  | { is_due_date_enabled?: boolean; sub_categories: Record<string, { amount: number; due_date?: string | null; recurrence?: string | null; start_date?: string | null; end_date?: string | null; paid_dates?: string[] }> };

function isV2Format(val: unknown): val is { is_due_date_enabled?: boolean; sub_categories: Record<string, { amount: number; due_date?: string | null; paid_dates?: string[] }> } {
  return typeof val === "object" && val !== null && "sub_categories" in val;
}

function extractDueDateItems(
  expenseBudgets: Record<string, ExpenseBudgetValue>,
  txBySubDate: Record<string, TxEntry[]>,
  filterMonth?: string
): DueDateItem[] {
  const items: DueDateItem[] = [];
  const [filterYear, filterMonthNum] = filterMonth ? filterMonth.split("-").map(Number) : [0, 0];

  const addItem = (mainCat: string, subCat: string, amount: number, dueDate: string, recurrence?: string | null, startDate?: string | null, endDate?: string | null, paidDates?: string[]) => {
    const rrule = recurrence ?? null;
    const itemPaidDates = paidDates ?? [];
    const txList = txBySubDate[subCat] ?? [];

    if (rrule && filterYear && filterMonthNum) {
      const expandedDates = expandRecurrence(dueDate, rrule, filterYear, filterMonthNum, startDate, endDate);
      const perOccurrence = amount;
      const txMatchMap = matchTxToOccurrences(txList, expandedDates, perOccurrence);
      for (const expDate of expandedDates) {
        const isPaidByDate = itemPaidDates.includes(expDate);
        const matchResult = txMatchMap.get(expDate);
        const isPaidByTx = !isPaidByDate && (matchResult?.isPaid ?? false);
        const isPaid = isPaidByDate || isPaidByTx;
        items.push({
          mainCategory: mainCat,
          subCategory: subCat,
          amount: perOccurrence,
          dueDate: expDate,
          paidAmount: isPaid ? perOccurrence : 0,
          isPaid,
          isRecurring: true,
          recurrence: rrule,
          paidDates: itemPaidDates,
          txDaysDiff: isPaidByTx ? matchResult?.daysDiff : undefined,
          txDate: isPaidByTx ? matchResult?.txDate : undefined,
        });
      }
    } else {
      if (!filterMonth || dueDate.startsWith(filterMonth)) {
        const isPaidByDate = itemPaidDates.includes(dueDate);
        const txMatchMap = matchTxToOccurrences(txList, [dueDate], amount);
        const matchResult = txMatchMap.get(dueDate);
        const isPaidByTx = matchResult?.isPaid ?? false;
        const isPaid = isPaidByDate || isPaidByTx;
        const totalTx = txList.reduce((s, t) => s + t.amount, 0);
        items.push({
          mainCategory: mainCat,
          subCategory: subCat,
          amount,
          dueDate,
          paidAmount: isPaidByDate ? amount : (isPaidByTx ? amount : totalTx),
          isPaid,
          isRecurring: false,
          recurrence: null,
          paidDates: itemPaidDates,
          txDaysDiff: isPaidByTx ? matchResult?.daysDiff : undefined,
          txDate: isPaidByTx ? matchResult?.txDate : undefined,
        });
      }
    }
  };

  for (const [mainCat, val] of Object.entries(expenseBudgets)) {
    if (isV2Format(val)) {
      for (const [subCat, subVal] of Object.entries(val.sub_categories)) {
        if (subVal?.due_date) {
          addItem(mainCat, subCat, subVal.amount ?? 0, subVal.due_date, (subVal as any)?.recurrence, (subVal as any)?.start_date, (subVal as any)?.end_date, (subVal as any)?.paid_dates);
        }
      }
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      for (const [subCat, subVal] of Object.entries(val as Record<string, unknown>)) {
        if (typeof subVal === "object" && subVal !== null && "due_date" in subVal) {
          const v = subVal as { amount?: number; due_date?: string | null; recurrence?: string | null; start_date?: string | null; end_date?: string | null; paid_dates?: string[] };
          if (v.due_date) {
            addItem(mainCat, subCat, v.amount ?? 0, v.due_date, v.recurrence, v.start_date, v.end_date, v.paid_dates);
          }
        }
      }
    }
  }

  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

const CalendarPage = () => {
  const { userId } = useAuth();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [expenseBudgets, setExpenseBudgets] = useState<Record<string, ExpenseBudgetValue>>({});
  const [txBySubDate, setTxBySubDate] = useState<Record<string, TxEntry[]>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [crossMonthBudgets, setCrossMonthBudgets] = useState<Record<string, ExpenseBudgetValue>>({});
  // Store all paid_dates across all budget docs for installment tracking
  const [allPaidDatesMap, setAllPaidDatesMap] = useState<Record<string, string[]>>({});
  // Store all transactions across all months for installment tx matching
  const [allTxBySubDate, setAllTxBySubDate] = useState<Record<string, TxEntry[]>>({});

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const period = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Fetch budget data for current period
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const docRef = doc(firestore, "users", userId, "budgets", period);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setExpenseBudgets((snap.data().expense_budgets ?? {}) as Record<string, ExpenseBudgetValue>);
      } else {
        setExpenseBudgets({});
      }
      setLoading(false);
    });
    return () => unsub();
  }, [userId, period]);

  // Fetch ALL budget docs to find recurring items from other months that overlap current view
  useEffect(() => {
    if (!userId) return;
    const budgetsCol = collection(firestore, "users", userId, "budgets");
    getDocs(budgetsCol).then((snap) => {
      const viewStart = `${year}-${String(month + 1).padStart(2, "0")}-01`;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const viewEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
      const merged: Record<string, ExpenseBudgetValue> = {};
      // Collect paid_dates from ALL docs for installment tracking
      const paidMap: Record<string, string[]> = {};

      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const eb = (data.expense_budgets ?? {}) as Record<string, ExpenseBudgetValue>;
        const docPeriod = docSnap.id;

        const collectPaidDates = (mainCat: string, subCat: string, subVal: any) => {
          if (!subVal || typeof subVal !== "object") return;
          const pd = subVal.paid_dates as string[] | undefined;
          if (pd && pd.length > 0) {
            const key = `${mainCat}::${subCat}`;
            if (!paidMap[key]) paidMap[key] = [];
            for (const d of pd) {
              if (!paidMap[key].includes(d)) paidMap[key].push(d);
            }
          }
        };

        for (const [mainCat, val] of Object.entries(eb)) {
          if (isV2Format(val)) {
            for (const [subCat, subVal] of Object.entries(val.sub_categories)) {
              collectPaidDates(mainCat, subCat, subVal);
            }
          } else if (typeof val === "object" && val !== null && !Array.isArray(val) && !("amount" in val)) {
            for (const [subCat, subVal] of Object.entries(val as Record<string, unknown>)) {
              collectPaidDates(mainCat, subCat, subVal);
            }
          }
        }

        if (docPeriod === period) return; // skip current period for crossMonth merge

        for (const [mainCat, val] of Object.entries(eb)) {
          const processSubItem = (subCat: string, subVal: any) => {
            if (!subVal || typeof subVal !== "object" || !subVal.recurrence || !subVal.due_date) return;
            const startDate = subVal.start_date || subVal.due_date;
            const endDate = subVal.end_date || null;
            if (startDate > viewEnd) return;
            if (endDate && endDate < viewStart) return;
            if (!merged[mainCat]) merged[mainCat] = {} as any;
            const cat = merged[mainCat] as Record<string, any>;
            if (isV2Format(cat)) {
              cat.sub_categories[subCat] = subVal;
            } else {
              cat[subCat] = subVal;
            }
          };

          if (isV2Format(val)) {
            for (const [subCat, subVal] of Object.entries(val.sub_categories)) {
              processSubItem(subCat, subVal);
            }
          } else if (typeof val === "object" && val !== null && !Array.isArray(val) && !("amount" in val)) {
            for (const [subCat, subVal] of Object.entries(val as Record<string, unknown>)) {
              processSubItem(subCat, subVal);
            }
          }
        }
      });

      setCrossMonthBudgets(merged);
      setAllPaidDatesMap(paidMap);

      // Fetch ALL transactions for installment tx matching across months
      const txCol = collection(firestore, "users", userId, "transactions");
      getDocs(txCol).then((txSnap) => {
        const allTxMap: Record<string, TxEntry[]> = {};
        txSnap.forEach((d) => {
          const data = d.data();
          const subCat = (data.sub_category as string) ?? "";
          const amount = (data.amount as number) ?? 0;
          const date = (data.date as string) ?? "";
          if (subCat && date) {
            if (!allTxMap[subCat]) allTxMap[subCat] = [];
            allTxMap[subCat].push({ date, amount });
          }
        });
        setAllTxBySubDate(allTxMap);
      });
    });
  }, [userId, period, year, month]);

  // Fetch transactions for actuals (to determine paid status) — store per-date entries
  useEffect(() => {
    if (!userId || !period) return;
    const txCol = collection(firestore, "users", userId, "transactions");
    const txQ = query(txCol, where("month_year", "==", period));
    getDocs(txQ).then((txSnap) => {
      const map: Record<string, TxEntry[]> = {};
      txSnap.forEach((d) => {
        const data = d.data();
        const subCat = (data.sub_category as string) ?? "";
        const amount = (data.amount as number) ?? 0;
        const date = (data.date as string) ?? "";
        if (subCat && date) {
          if (!map[subCat]) map[subCat] = [];
          map[subCat].push({ date, amount });
        }
      });
      setTxBySubDate(map);
    });
  }, [userId, period]);

  // Merge current period budgets with cross-month recurring items (deduplicate by subCategory)
  const mergedBudgets = useMemo(() => {
    const result = { ...expenseBudgets };
    for (const [mainCat, val] of Object.entries(crossMonthBudgets)) {
      if (!result[mainCat]) {
        result[mainCat] = val;
      } else {
        // Merge sub-items, but current period takes priority
        const existing = result[mainCat];
        if (typeof val === "object" && val !== null && typeof existing === "object" && existing !== null) {
          if (isV2Format(existing) && isV2Format(val)) {
            const mergedSubs = { ...existing.sub_categories };
            for (const [subCat, subVal] of Object.entries(val.sub_categories)) {
              if (!mergedSubs[subCat]) mergedSubs[subCat] = subVal;
            }
            result[mainCat] = { ...existing, sub_categories: mergedSubs };
          } else if (!isV2Format(existing) && !isV2Format(val) && !("amount" in existing)) {
            const existingFlat = existing as Record<string, any>;
            const valFlat = val as Record<string, any>;
            const merged = { ...existingFlat };
            for (const [subCat, subVal] of Object.entries(valFlat)) {
              if (!merged[subCat]) merged[subCat] = subVal;
            }
            result[mainCat] = merged as ExpenseBudgetValue;
          }
        }
      }
    }
    return result;
  }, [expenseBudgets, crossMonthBudgets]);

  const dueDateItems = useMemo(() => extractDueDateItems(mergedBudgets, txBySubDate, period), [mergedBudgets, txBySubDate, period]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, DueDateItem[]> = {};
    for (const item of dueDateItems) {
      if (!map[item.dueDate]) map[item.dueDate] = [];
      map[item.dueDate].push(item);
    }
    return map;
  }, [dueDateItems]);

  const totalByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [date, items] of Object.entries(itemsByDate)) {
      map[date] = items.reduce((sum, i) => sum + i.amount, 0);
    }
    return map;
  }, [itemsByDate]);

  const monthTotal = useMemo(() => dueDateItems.reduce((s, i) => s + i.amount, 0), [dueDateItems]);
  const paidCount = useMemo(() => dueDateItems.filter(i => i.isPaid).length, [dueDateItems]);
  const recurringCount = useMemo(() => dueDateItems.filter(i => i.isRecurring).length, [dueDateItems]);

  // Installment data: recurring items with start_date + end_date
  interface InstallmentRow {
    mainCategory: string;
    subCategory: string;
    amountPerOccurrence: number;
    dueDate: string;
    recurrence: string;
    startDate: string;
    endDate: string;
    totalOccurrences: number;
    paidOccurrences: number;
    totalAmount: number;
  }

  const installmentData = useMemo(() => {
    const rows: InstallmentRow[] = [];
    const seen = new Set<string>();

    const processSubItem = (mainCat: string, subCat: string, subVal: any) => {
      if (!subVal || typeof subVal !== "object") return;
      const { recurrence, start_date, end_date, due_date, amount, paid_dates } = subVal;
      if (!recurrence || !start_date || !end_date || !due_date) return;
      const key = `${mainCat}::${subCat}`;
      if (seen.has(key)) return;
      seen.add(key);

      // Calculate total occurrences across all months from start to end
      const startD = new Date(start_date);
      const endD = new Date(end_date);
      let allDates: string[] = [];
      let y = startD.getFullYear();
      let m = startD.getMonth() + 1;
      const endY = endD.getFullYear();
      const endM = endD.getMonth() + 1;

      while (y < endY || (y === endY && m <= endM)) {
        const expanded = expandRecurrence(due_date, recurrence, y, m, start_date, end_date);
        allDates = allDates.concat(expanded);
        m++;
        if (m > 12) { m = 1; y++; }
      }

      const totalOcc = allDates.length;
      if (totalOcc === 0) return;

      // Count paid: from ALL paid_dates + tx matching across ALL months
      const paidKey = `${mainCat}::${subCat}`;
      const allPaidDates = allPaidDatesMap[paidKey] ?? [];
      const allTxList = allTxBySubDate[subCat] ?? [];
      const txMatchMap = matchTxToOccurrences(allTxList, allDates, amount ?? 0);

      let paidCount = 0;
      for (const d of allDates) {
        if (allPaidDates.includes(d)) {
          paidCount++;
        } else if (txMatchMap.get(d)?.isPaid) {
          paidCount++;
        }
      }

      rows.push({
        mainCategory: mainCat,
        subCategory: subCat,
        amountPerOccurrence: amount ?? 0,
        dueDate: due_date,
        recurrence,
        startDate: start_date,
        endDate: end_date,
        totalOccurrences: totalOcc,
        paidOccurrences: paidCount,
        totalAmount: (amount ?? 0) * totalOcc,
      });
    };

    for (const [mainCat, val] of Object.entries(mergedBudgets)) {
      if (isV2Format(val)) {
        for (const [subCat, subVal] of Object.entries(val.sub_categories)) {
          processSubItem(mainCat, subCat, subVal);
        }
      } else if (typeof val === "object" && val !== null && !Array.isArray(val) && !("amount" in val)) {
        for (const [subCat, subVal] of Object.entries(val as Record<string, unknown>)) {
          processSubItem(mainCat, subCat, subVal);
        }
      }
    }

    return rows.sort((a, b) => a.subCategory.localeCompare(b.subCategory));
  }, [mergedBudgets, allTxBySubDate, period, allPaidDatesMap]);
  const paidByDate = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const [date, items] of Object.entries(itemsByDate)) {
      map[date] = items.every(i => i.isPaid);
    }
    return map;
  }, [itemsByDate]);

  const days = getDaysInMonth(year, month);
  const startPadding = getStartPadding(year, month);

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const handleDateClick = (dateStr: string) => {
    if (itemsByDate[dateStr]?.length) {
      setSelectedDate(dateStr === selectedDate ? null : dateStr);
    }
  };

  const updateDueDate = async (mainCat: string, subCat: string, newDate: string) => {
    if (!userId) return;
    const docRef = doc(firestore, "users", userId, "budgets", period);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const budgets = { ...(data.expense_budgets ?? {}) } as Record<string, ExpenseBudgetValue>;
    const catData = budgets[mainCat];

    if (isV2Format(catData)) {
      budgets[mainCat] = {
        ...catData,
        sub_categories: {
          ...catData.sub_categories,
          [subCat]: { ...catData.sub_categories[subCat], due_date: newDate },
        },
      };
    } else if (typeof catData === "object" && catData !== null && !("amount" in catData)) {
      const flat = catData as unknown as Record<string, { amount: number; due_date?: string | null }>;
      budgets[mainCat] = { ...flat, [subCat]: { ...flat[subCat], due_date: newDate } } as unknown as ExpenseBudgetValue;
    }

    await updateDoc(docRef, { expense_budgets: budgets });
    toast({ 
      title: "อัปเดตวันชำระสำเร็จ", 
      description: `${subCat} → ${formatThaiDate(newDate)}`,
    });
  };

  const markAsPaid = async (mainCat: string, subCat: string, dateStr: string) => {
    if (!userId) return;
    const docRef = doc(firestore, "users", userId, "budgets", period);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const budgets = { ...(data.expense_budgets ?? {}) } as Record<string, any>;
    const catData = budgets[mainCat];

    if (isV2Format(catData)) {
      const sub = catData.sub_categories[subCat];
      if (sub) {
        const currentPaid = sub.paid_dates ?? [];
        budgets[mainCat] = {
          ...catData,
          sub_categories: {
            ...catData.sub_categories,
            [subCat]: { ...sub, paid_dates: [...currentPaid, dateStr] },
          },
        };
      }
    } else if (typeof catData === "object" && catData !== null) {
      const sub = catData[subCat];
      if (sub && typeof sub === "object") {
        const currentPaid = sub.paid_dates ?? [];
        budgets[mainCat] = { ...catData, [subCat]: { ...sub, paid_dates: [...currentPaid, dateStr] } };
      }
    }

    await updateDoc(docRef, { expense_budgets: budgets });
    toast({ title: "บันทึกการชำระสำเร็จ", description: `${subCat} — ${formatThaiDate(dateStr)}` });
  };

  const undoPaid = async (mainCat: string, subCat: string, dateStr: string) => {
    if (!userId) return;
    const docRef = doc(firestore, "users", userId, "budgets", period);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const budgets = { ...(data.expense_budgets ?? {}) } as Record<string, any>;
    const catData = budgets[mainCat];

    if (isV2Format(catData)) {
      const sub = catData.sub_categories[subCat];
      if (sub) {
        const currentPaid = (sub.paid_dates ?? []).filter((d: string) => d !== dateStr);
        budgets[mainCat] = {
          ...catData,
          sub_categories: {
            ...catData.sub_categories,
            [subCat]: { ...sub, paid_dates: currentPaid },
          },
        };
      }
    } else if (typeof catData === "object" && catData !== null) {
      const sub = catData[subCat];
      if (sub && typeof sub === "object") {
        const currentPaid = (sub.paid_dates ?? []).filter((d: string) => d !== dateStr);
        budgets[mainCat] = { ...catData, [subCat]: { ...sub, paid_dates: currentPaid } };
      }
    }

    await updateDoc(docRef, { expense_budgets: budgets });
    toast({ title: "ยกเลิกการชำระสำเร็จ", description: `${subCat} — ${formatThaiDate(dateStr)}` });
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = async (result: DropResult) => {
    setIsDragging(false);
    if (!result.destination) return;
    
    const sourceDate = result.source.droppableId;
    const destDate = result.destination.droppableId;
    
    if (sourceDate === destDate) return;
    
    const sourceItems = itemsByDate[sourceDate];
    if (!sourceItems) return;
    
    const item = sourceItems[result.source.index];
    if (!item) return;
    
    await updateDueDate(item.mainCategory, item.subCategory, destDate);
    
    // Keep the panel open but update to show the new date
    if (selectedDate === sourceDate && itemsByDate[sourceDate]?.length === 1) {
      setSelectedDate(null);
    }
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const selectedItems = selectedDate ? itemsByDate[selectedDate] || [] : [];

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">ปฏิทินการเงิน</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="space-y-5">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="flex items-center gap-1">
                      <Home className="h-4 w-4" />
                      <span>ปฏิทินการเงิน</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/15">
                      <Banknote className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">ยอดชำระเดือนนี้</p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(monthTotal)}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent/15">
                      <CheckCircle2 className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">ชำระแล้ว</p>
                      <p className="text-lg font-bold text-foreground">{paidCount} <span className="text-sm font-normal text-muted-foreground">/ {dueDateItems.length}</span></p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-muted/50 to-muted/20 border-border">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">รอชำระ</p>
                      <p className="text-lg font-bold text-foreground">{dueDateItems.length - paidCount} <span className="text-sm font-normal text-muted-foreground">รายการ</span></p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-destructive/15">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">เลยกำหนด</p>
                      <p className="text-lg font-bold text-foreground">
                        {dueDateItems.filter(i => getDaysUntil(i.dueDate) < 0 && !i.isPaid).length}
                        <span className="text-sm font-normal text-muted-foreground"> รายการ</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/15">
                      <RefreshCw className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">รายการซ้ำ</p>
                      <p className="text-lg font-bold text-foreground">{recurringCount} <span className="text-sm font-normal text-muted-foreground">รายการ</span></p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Calendar + Side Panel Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Calendar Grid */}
                <Card className="overflow-hidden lg:col-span-2">
                  <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center justify-between">
                      <Button variant="ghost" size="icon" onClick={goToPrevMonth} className="rounded-full hover:bg-primary/10">
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-primary" />
                        {THAI_MONTHS[month]} {year + 543}
                      </CardTitle>
                      <Button variant="ghost" size="icon" onClick={goToNextMonth} className="rounded-full hover:bg-primary/10">
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    {loading ? (
                      <div className="grid grid-cols-7 gap-1.5">
                        {[...Array(35)].map((_, i) => (
                          <Skeleton key={i} className="h-20 sm:h-24 rounded-lg" />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                        {/* Weekday headers */}
                        {THAI_WEEKDAYS.map((day, i) => (
                          <div
                            key={day}
                            className={`text-center text-[11px] sm:text-xs font-semibold py-2 rounded-md ${
                              i === 0 ? "text-destructive/70" : i === 6 ? "text-primary/70" : "text-muted-foreground"
                            }`}
                          >
                            {day}
                          </div>
                        ))}

                        {/* Empty padding */}
                        {[...Array(startPadding)].map((_, i) => (
                          <div key={`pad-${i}`} className="h-20 sm:h-24" />
                        ))}

                        {/* Day cells - all are Droppable */}
                        {days.map((d) => {
                          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                          const dayItems = itemsByDate[dateStr] || [];
                          const total = totalByDate[dateStr] || 0;
                          const isToday = dateStr === todayStr;
                          const hasItems = dayItems.length > 0;
                          const allPaid = paidByDate[dateStr] ?? false;
                          const somePaid = hasItems && dayItems.some(i => i.isPaid);
                          const isOverdue = hasItems && !allPaid && getDaysUntil(dateStr) < 0;
                          const isSunday = d.getDay() === 0;
                          const isSaturday = d.getDay() === 6;
                          const isSelected = dateStr === selectedDate;

                          return (
                            <Droppable droppableId={dateStr} key={dateStr}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  onClick={() => handleDateClick(dateStr)}
                                  className={`h-20 sm:h-24 p-1 sm:p-1.5 rounded-lg border text-xs transition-all duration-200 relative group
                                    ${isSelected
                                      ? "border-primary ring-2 ring-primary/30 bg-primary/10 shadow-md"
                                      : allPaid
                                        ? "border-accent/50 bg-accent/5"
                                        : isToday
                                          ? "border-primary/50 bg-primary/5 shadow-sm"
                                          : hasItems
                                            ? "border-border bg-card hover:shadow-md hover:border-primary/30"
                                            : "border-border/50 bg-card/50 hover:bg-card"
                                    }
                                    ${snapshot.isDraggingOver ? "bg-accent/30 border-accent ring-2 ring-accent/40 scale-[1.03]" : ""}
                                    ${hasItems ? "cursor-pointer" : ""}
                                    ${isDragging && !hasItems ? "border-dashed border-primary/30" : ""}
                                  `}
                                >
                                  {/* Day number */}
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className={`text-[11px] sm:text-xs font-semibold leading-none
                                      ${isToday ? "bg-primary text-primary-foreground rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center" : ""}
                                      ${!isToday && isSunday ? "text-destructive/80" : ""}
                                      ${!isToday && isSaturday ? "text-primary/80" : ""}
                                    `}>
                                      {d.getDate()}
                                    </span>
                                    {allPaid ? (
                                      <CheckCircle2 className="h-3 w-3 text-accent" />
                                    ) : isOverdue ? (
                                      <AlertTriangle className="h-3 w-3 text-destructive animate-pulse" />
                                    ) : null}
                                  </div>

                                  {/* Amount badge */}
                                  {total > 0 && (
                                    <div className={`mt-0.5 px-1 py-0.5 rounded text-[9px] sm:text-[10px] font-medium truncate text-center
                                      ${allPaid
                                        ? "line-through bg-accent/15 text-accent"
                                        : isOverdue
                                          ? "bg-destructive/15 text-destructive"
                                          : "bg-primary/10 text-primary"
                                      }
                                    `}>
                                      {formatCurrency(total)}
                                    </div>
                                  )}

                                  {/* Paid status */}
                                  {allPaid && (
                                    <div className="text-[9px] text-accent font-medium text-center mt-0.5">
                                      {(() => {
                                        // Check if any item was paid early/late via tolerance
                                        const toleranceItem = dayItems.find(i => i.isPaid && i.txDaysDiff !== undefined && i.txDaysDiff !== 0 && i.txDate);
                                        if (toleranceItem && toleranceItem.txDaysDiff !== undefined && toleranceItem.txDate) {
                                          const txDateFormatted = formatThaiDate(toleranceItem.txDate).split(" ").slice(0, 2).join(" ");
                                          if (toleranceItem.txDaysDiff < 0) return `จ่ายก่อน ${Math.abs(toleranceItem.txDaysDiff)} วัน (${txDateFormatted})`;
                                          if (toleranceItem.txDaysDiff > 0) return `จ่ายเลท ${toleranceItem.txDaysDiff} วัน (${txDateFormatted})`;
                                        }
                                        return "ชำระแล้ว";
                                      })()}
                                    </div>
                                  )}

                                  {/* Item count dots (show only if not all paid) */}
                                  {dayItems.length > 0 && !allPaid && (
                                    <div className="flex items-center justify-center gap-0.5 mt-1">
                                      {dayItems.slice(0, 3).map((item, idx) => (
                                        <div key={idx} className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${
                                          item.isPaid ? "bg-accent/60" : isOverdue ? "bg-destructive/60" : "bg-primary/50"
                                        }`} />
                                      ))}
                                      {dayItems.length > 3 && (
                                        <span className="text-[8px] text-muted-foreground ml-0.5">+{dayItems.length - 3}</span>
                                      )}
                                    </div>
                                  )}

                                  {/* Drop indicator when dragging */}
                                  {isDragging && !hasItems && (
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Move className="h-4 w-4 text-primary/40" />
                                    </div>
                                  )}

                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Side Panel - Selected Date Items */}
                <Card className={`overflow-hidden transition-all duration-300 ${selectedDate ? "opacity-100" : "opacity-70"}`}>
                  <CardHeader className="pb-2 bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        {selectedDate ? (
                          <>รายการวันที่ {formatThaiDate(selectedDate)}</>
                        ) : (
                          <>เลือกวันเพื่อดูรายการ</>
                        )}
                      </CardTitle>
                      {selectedDate && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedDate(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {selectedDate && selectedItems.length > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {selectedItems.length} รายการ
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          รวม {formatCurrency(totalByDate[selectedDate] || 0)}
                        </Badge>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-2">
                    {!selectedDate ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm text-center">คลิกที่วันในปฏิทิน<br/>เพื่อดูรายการที่ต้องชำระ</p>
                      </div>
                    ) : selectedItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm">ไม่มีรายการในวันนี้</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px] lg:h-[400px]">
                        <Droppable droppableId={selectedDate}>
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 p-1">
                              {selectedItems.map((item, index) => {
                                const IconComponent = CATEGORY_ICON_MAP[item.mainCategory] || Banknote;
                                const daysUntil = getDaysUntil(item.dueDate);
                                const isOverdue = daysUntil < 0;
                                
                                return (
                                  <Draggable
                                    key={`${item.mainCategory}-${item.subCategory}-${item.dueDate}`}
                                    draggableId={`${item.mainCategory}-${item.subCategory}-${item.dueDate}`}
                                    index={index}
                                    isDragDisabled={item.isRecurring}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`flex items-center gap-2 p-3 rounded-lg border transition-all
                                          ${snapshot.isDragging
                                            ? "shadow-2xl bg-card border-primary ring-2 ring-primary/30 scale-105 z-50"
                                            : item.isPaid
                                              ? "bg-accent/5 border-accent/30 hover:bg-accent/10"
                                              : isOverdue
                                                ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10"
                                                : "bg-muted/20 border-border/50 hover:bg-muted/40"
                                          }
                                        `}
                                      >
                                        {!item.isRecurring ? (
                                          <div 
                                            {...provided.dragHandleProps} 
                                            className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted/50"
                                          >
                                            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                                          </div>
                                        ) : (
                                          <div {...provided.dragHandleProps} className="p-1 -ml-1">
                                            <RefreshCw className="h-4 w-4 text-muted-foreground/30" />
                                          </div>
                                        )}
                                        <div className={`p-1.5 rounded-md shrink-0 ${
                                          item.isPaid ? "bg-accent/15" : isOverdue ? "bg-destructive/10" : "bg-primary/10"
                                        }`}>
                                          {item.isPaid 
                                            ? <CheckCircle2 className="h-4 w-4 text-accent" />
                                            : <IconComponent className={`h-4 w-4 ${isOverdue ? "text-destructive" : "text-primary"}`} />
                                          }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-1.5">
                                            <span className={`font-medium text-sm truncate ${item.isPaid ? "line-through text-muted-foreground" : ""}`}>
                                              {item.subCategory}
                                            </span>
                                            {item.isRecurring && (
                                              <RefreshCw className="h-3 w-3 text-primary shrink-0" />
                                            )}
                                            {item.isPaid && (
                                              <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 ${
                                                item.txDaysDiff !== undefined && item.txDaysDiff !== 0
                                                  ? item.txDaysDiff < 0
                                                    ? "border-primary/40 text-primary"
                                                    : "border-orange-400 text-orange-500"
                                                  : "border-accent/40 text-accent"
                                              }`}>
                                                {item.txDaysDiff !== undefined && item.txDaysDiff !== 0 && item.txDate
                                                  ? item.txDaysDiff < 0
                                                    ? `จ่ายก่อน ${Math.abs(item.txDaysDiff)} วัน (${formatThaiDate(item.txDate).split(" ").slice(0, 2).join(" ")})`
                                                    : `จ่ายเลท ${item.txDaysDiff} วัน (${formatThaiDate(item.txDate).split(" ").slice(0, 2).join(" ")})`
                                                  : "ชำระแล้ว"
                                                }
                                              </Badge>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-muted-foreground truncate">{item.mainCategory}</div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <div className={`font-bold text-sm tabular-nums ${
                                            item.isPaid ? "text-accent" : isOverdue ? "text-destructive" : ""
                                          }`}>
                                            {formatCurrency(item.amount)}
                                          </div>
                                          {item.isPaid ? (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={(e) => { e.stopPropagation(); undoPaid(item.mainCategory, item.subCategory, item.dueDate); }}
                                            >
                                              <X className="h-3 w-3 text-muted-foreground" />
                                            </Button>
                                          ) : (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={(e) => { e.stopPropagation(); markAsPaid(item.mainCategory, item.subCategory, item.dueDate); }}
                                            >
                                              <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </ScrollArea>
                    )}

                    {selectedDate && selectedItems.some(i => !i.isRecurring) && (
                      <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-primary/5 border border-primary/10">
                        <Move className="h-3.5 w-3.5 text-primary" />
                        <p className="text-[11px] text-primary/80">
                          ลากรายการที่ไม่ใช่รายการซ้ำไปวางบนวันอื่นเพื่อเปลี่ยนวันชำระ
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Installment Table + Monthly Items — 2 columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Installment Table */}
                {installmentData.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 text-primary" />
                        รายการผ่อนชำระ / งวด
                        <Badge variant="secondary" className="text-[10px] ml-1">
                          {installmentData.length}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0 sm:p-0">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">ชื่อรายการ</TableHead>
                              <TableHead className="text-xs text-right">ต่องวด</TableHead>
                              <TableHead className="text-xs hidden sm:table-cell">ความถี่</TableHead>
                              <TableHead className="text-xs hidden xl:table-cell">วันเริ่ม</TableHead>
                              <TableHead className="text-xs hidden xl:table-cell">วันสิ้นสุด</TableHead>
                              <TableHead className="text-xs text-center">งวด</TableHead>
                              <TableHead className="text-xs text-right">ยอดรวม</TableHead>
                              <TableHead className="text-xs text-right">จ่ายแล้ว</TableHead>
                              <TableHead className="text-xs text-right">คงเหลือ</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {installmentData.map((row) => {
                              const progressPct = row.totalOccurrences > 0 ? (row.paidOccurrences / row.totalOccurrences) * 100 : 0;
                              const remaining = row.totalOccurrences - row.paidOccurrences;
                              return (
                                <TableRow key={`${row.mainCategory}-${row.subCategory}`}>
                                  <TableCell className="text-xs font-medium py-3">
                                    <div className="flex flex-col gap-1">
                                      <span>{row.subCategory}</span>
                                      <span className="text-[10px] text-muted-foreground">{row.mainCategory}</span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-semibold tabular-nums py-3">
                                    {formatCurrency(row.amountPerOccurrence)}
                                  </TableCell>
                                  <TableCell className="text-xs hidden sm:table-cell py-3">
                                    <Badge variant="outline" className="text-[10px]">
                                      {formatFrequencyThai(row.recurrence)}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs hidden xl:table-cell text-muted-foreground py-3">
                                    {formatThaiDate(row.startDate)}
                                  </TableCell>
                                  <TableCell className="text-xs hidden xl:table-cell text-muted-foreground py-3">
                                    {formatThaiDate(row.endDate)}
                                  </TableCell>
                                  <TableCell className="py-3">
                                    <div className="flex flex-col items-center gap-1 min-w-[70px]">
                                      <span className="text-xs font-semibold tabular-nums">
                                        {row.paidOccurrences} / {row.totalOccurrences}
                                      </span>
                                      <Progress value={progressPct} className="h-1.5 w-full" />
                                      {remaining > 0 && (
                                        <span className="text-[10px] text-muted-foreground">เหลือ {remaining} งวด</span>
                                      )}
                                      {remaining === 0 && (
                                        <span className="text-[10px] text-accent font-medium">ครบแล้ว ✓</span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-semibold tabular-nums py-3">
                                    {formatCurrency(row.totalAmount)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-semibold tabular-nums py-3 text-accent">
                                    {formatCurrency(row.amountPerOccurrence * row.paidOccurrences)}
                                  </TableCell>
                                  <TableCell className="text-xs text-right font-semibold tabular-nums py-3 text-destructive">
                                    {formatCurrency(row.totalAmount - row.amountPerOccurrence * row.paidOccurrences)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Items List (Monthly Summary) */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      รายการทั้งหมดในเดือนนี้
                      {dueDateItems.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-1">
                          {dueDateItems.length}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {dueDateItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                        <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm font-medium">ไม่มีรายการที่ต้องชำระในเดือนนี้</p>
                        <p className="text-xs mt-1">กำหนดวันชำระได้ที่หน้าตั้งค่างบประมาณ</p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {dueDateItems.map((item, idx) => {
                          const daysUntil = getDaysUntil(item.dueDate);
                          const isOverdue = daysUntil < 0;
                          const isUrgent = daysUntil >= 0 && daysUntil <= 3;
                          const IconComponent = CATEGORY_ICON_MAP[item.mainCategory] || Banknote;

                          return (
                            <div
                              key={`${item.mainCategory}-${item.subCategory}-${idx}`}
                              onClick={() => setSelectedDate(item.dueDate)}
                              className={`flex items-center gap-3 p-3 rounded-lg transition-colors border cursor-pointer
                                ${item.isPaid
                                  ? "bg-accent/5 border-accent/20 hover:bg-accent/10"
                                  : isOverdue
                                    ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10"
                                    : isUrgent
                                      ? "bg-primary/5 border-primary/15 hover:bg-primary/10"
                                      : "bg-card border-border/50 hover:bg-muted/30"
                                }
                              `}
                            >
                              <div className={`p-2 rounded-lg shrink-0 ${
                                item.isPaid ? "bg-accent/10" : isOverdue ? "bg-destructive/10" : "bg-primary/10"
                              }`}>
                                {item.isPaid
                                  ? <CheckCircle2 className="h-4 w-4 text-accent" />
                                  : <IconComponent className={`h-4 w-4 ${isOverdue ? "text-destructive" : "text-primary"}`} />
                                }
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-medium text-sm truncate ${item.isPaid ? "line-through text-muted-foreground" : ""}`}>
                                    {item.subCategory}
                                  </span>
                                  {item.isRecurring && (
                                    <RefreshCw className="h-3 w-3 text-primary shrink-0" />
                                  )}
                                  {item.isPaid && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-accent/40 text-accent shrink-0">
                                      ชำระแล้ว
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{formatThaiDate(item.dueDate)}</span>
                                  {!item.isPaid && isOverdue && (
                                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                      เลยกำหนด {Math.abs(daysUntil)} วัน
                                    </Badge>
                                  )}
                                  {!item.isPaid && isUrgent && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
                                      อีก {daysUntil} วัน
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className={`text-sm font-bold tabular-nums ${
                                item.isPaid ? "text-accent" : isOverdue ? "text-destructive" : "text-foreground"
                              }`}>
                                {formatCurrency(item.amount)}
                              </div>
                            </div>
                          );
                        })}

                        <Separator className="my-2" />
                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-sm font-medium text-muted-foreground">รวมทั้งหมด</span>
                          <span className="text-base font-bold">{formatCurrency(monthTotal)}</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </DragDropContext>
        </main>
        <AppFooter />
      </div>
    </>
  );
};

export default CalendarPage;
