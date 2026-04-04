import { useState, useMemo, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Download,
  MoreHorizontal, Pencil, Trash2, Loader2, CalendarIcon,
} from "lucide-react";
import { format, startOfWeek, startOfMonth, subDays, endOfDay, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { BudgetData, Transaction, formatCurrency } from "@/hooks/useBudgetData";
import {
  deleteTransactionAtomic, updateTransactionAtomic,
} from "@/lib/firestore-services";
import { toast } from "sonner";

interface CategoryData {
  label: string;
  main_categories: Record<string, string[]>;
  category_icons?: Record<string, string>;
}

interface Props {
  data: BudgetData;
  userId?: string | null;
  onMutate?: () => void;
  excludeTransfers?: boolean;
  allTransactions?: Transaction[]; // ทุก transaction ข้ามเดือน สำหรับ date range filter
}

function getTypeBadgeClass(type: string) {
  switch (type) {
    case "รายรับ":
      return "bg-income/15 text-income hover:bg-income/20 border-none";
    case "ค่าใช้จ่าย":
      return "bg-expense/15 text-expense hover:bg-expense/20 border-none";
    case "หนี้สิน":
      return "bg-debt/15 text-debt hover:bg-debt/20 border-none";
    case "บิล/สาธารณูปโภค":
      return "bg-saving/15 text-saving hover:bg-saving/20 border-none";
    case "ค่าสมาชิกรายเดือน":
      return "bg-primary/15 text-primary hover:bg-primary/20 border-none";
    case "เงินออมและการลงทุน":
      return "bg-investment/15 text-investment hover:bg-investment/20 border-none";
    case "โอน":
      return "bg-muted text-foreground hover:bg-muted/80 border-none";
    default:
      return "bg-muted text-muted-foreground border-none";
  }
}

function formatDate(dateStr: string) {
  const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  
  // YYYY-MM-DD format
  const isoParts = dateStr.split("-");
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    const year = parseInt(isoParts[0], 10);
    const month = parseInt(isoParts[1], 10) - 1;
    const day = parseInt(isoParts[2], 10);
    const thaiYear = (year + 543) % 100;
    return `${day} ${monthNames[month]} ${thaiYear}`;
  }
  
  // DD/MM/YYYY format (legacy)
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const thaiYear = (year + 543) % 100;
    return `${day} ${monthNames[month]} ${thaiYear}`;
  }
  return dateStr;
}

function parseDateValue(dateStr: string): number {
  // YYYY-MM-DD
  const isoParts = dateStr.split("-");
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    return new Date(parseInt(isoParts[0], 10), parseInt(isoParts[1], 10) - 1, parseInt(isoParts[2], 10)).getTime();
  }
  // DD/MM/YYYY
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
  }
  return new Date(dateStr).getTime();
}

type SortKey = "date" | "type" | "category" | "subcategory" | "amount";
type SortDir = "asc" | "desc" | null;

const TYPE_ORDER = ["รายรับ", "ค่าใช้จ่าย", "เงินออม", "บิล/สาธารณูปโภค", "ค่าสมาชิกรายเดือน", "หนี้สิน"];

// Helper to compute balance deltas for a transaction
function getBalanceDeltas(tx: Transaction): { accountId: string; delta: number }[] {
  const deltas: { accountId: string; delta: number }[] = [];
  if (tx.type === "รายรับ" && tx.to_account_id) {
    deltas.push({ accountId: tx.to_account_id, delta: tx.amount });
  } else if (tx.from_account_id) {
    // expense, debt, bills, etc — deducted from account
    deltas.push({ accountId: tx.from_account_id, delta: -tx.amount });
  }
  // Transfer has both
  if (tx.type === "โอนเงิน") {
    // Already handled by from/to above if present
  }
  return deltas;
}

export function TransactionTable({ data, userId, onMutate, excludeTransfers = false, allTransactions }: Props) {
  const [pageSize, setPageSize] = useState(50);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  // Edit state
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState<Date>(new Date());
  const [editMainCategory, setEditMainCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Category data
  const [categories, setCategories] = useState<Record<string, CategoryData>>({});

  // Delete state
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = !!userId;

  // Load categories
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "categories"), (snap) => {
      const cats: Record<string, CategoryData> = {};
      snap.forEach((d) => { cats[d.id] = d.data() as CategoryData; });
      setCategories(cats);
    });
    return () => unsub();
  }, [userId]);

  const baseTransactions = useMemo(() => {
    // ถ้ามี dateFrom/dateTo และมี allTransactions → ใช้ข้อมูลทั้งหมดข้ามเดือน
    const source = (dateFrom || dateTo) && allTransactions ? allTransactions : data.transactions;
    if (excludeTransfers) {
      return source.filter((t) => t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี");
    }
    return source;
  }, [data.transactions, allTransactions, excludeTransfers, dateFrom, dateTo]);

  const types = useMemo(() => {
    const available = Array.from(new Set(baseTransactions.map((t) => t.type)));
    return TYPE_ORDER.filter((t) => available.includes(t)).concat(
      available.filter((t) => !TYPE_ORDER.includes(t))
    );
  }, [baseTransactions]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : prev === "desc" ? null : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column || sortDir === null)
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const filtered = useMemo(() => {
    let items = filter === "all" ? baseTransactions : baseTransactions.filter((t) => t.type === filter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (t) =>
          t.category.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q)
      );
    }

    // Amount range filter
    const minVal = parseFloat(minAmount);
    const maxVal = parseFloat(maxAmount);
    if (!isNaN(minVal)) items = items.filter((t) => t.amount >= minVal);
    if (!isNaN(maxVal)) items = items.filter((t) => t.amount <= maxVal);

    // Date range filter
    if (dateFrom || dateTo) {
      items = items.filter((t) => {
        const ts = parseDateValue(t.date);
        if (dateFrom) {
          const from = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate()).getTime();
          if (ts < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate(), 23, 59, 59, 999).getTime();
          if (ts > to) return false;
        }
        return true;
      });
    }

    const indexed = items.map((t, i) => ({ ...t, _idx: i }));

    if (sortDir === null) return indexed;

    indexed.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = parseDateValue(a.date) - parseDateValue(b.date);
          if (cmp === 0) cmp = a._idx - b._idx;
          break;
        case "type":
          cmp = a.type.localeCompare(b.type, "th");
          break;
        case "category":
          cmp = (a.main_category || a.category).localeCompare(b.main_category || b.category, "th");
          break;
        case "subcategory":
          cmp = a.category.localeCompare(b.category, "th");
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return indexed;
  }, [baseTransactions, filter, search, sortKey, sortDir, dateFrom, dateTo, minAmount, maxAmount]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, t) => sum + t.amount, 0),
    [filtered]
  );

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  // Reset page when filter/search/pageSize changes
  useMemo(() => { setPage(0); }, [filter, search, pageSize, dateFrom, dateTo, minAmount, maxAmount]);

  const exportCSV = () => {
    const BOM = "\uFEFF";
    const headers = ["วันที่", "ประเภท", "หมวดหมู่", "หมวดหมู่ย่อย", "รายละเอียด", "จำนวน"];
    const rows = filtered.map((t) => [
      t.date,
      t.type,
      t.main_category || t.category,
      t.category,
      t.description || "",
      t.type === "รายรับ" ? t.amount : t.type === "โอน" ? t.amount : -t.amount,
    ]);
    const csv = BOM + [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ===== Edit Handler =====
  const openEdit = (tx: Transaction) => {
    setEditTx(tx);
    setEditAmount(String(tx.amount));
    setEditNote(tx.description || "");
    // Parse date string to Date object
    const parts = tx.date.split("-");
    if (parts.length === 3 && parts[0].length === 4) {
      setEditDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
    } else {
      setEditDate(new Date());
    }
    // Find main category from sub_category (tx.category = sub_category)
    const txType = tx.type === "รายรับ" ? "income" : "expense";
    const catData = categories[txType];
    if (catData?.main_categories) {
      for (const [main, subs] of Object.entries(catData.main_categories)) {
        if (subs.includes(tx.category)) {
          setEditMainCategory(main);
          setEditSubCategory(tx.category);
          return;
        }
      }
    }
    setEditMainCategory("");
    setEditSubCategory(tx.category);
  };

  // Derived category lists for edit
  const editTxType = editTx?.type === "รายรับ" ? "income" : "expense";
  const editCatData = categories[editTxType];
  const editMainCats = editCatData?.main_categories ? Object.keys(editCatData.main_categories) : [];
  const editSubCats = editMainCategory && editCatData?.main_categories?.[editMainCategory]
    ? editCatData.main_categories[editMainCategory]
    : [];

  const handleSaveEdit = async () => {
    if (!editTx || !userId) return;
    const newAmount = parseFloat(editAmount);
    if (isNaN(newAmount) || newAmount <= 0 || newAmount > 9999999.99) {
      toast.error("จำนวนเงินไม่ถูกต้อง (0.01 - 9,999,999.99)");
      return;
    }
    if (editNote.length > 500) {
      toast.error("บันทึกต้องไม่เกิน 500 ตัวอักษร");
      return;
    }
    if (!editSubCategory) {
      toast.error("กรุณาเลือกหมวดหมู่");
      return;
    }

    setEditSaving(true);
    try {
      const amountChanged = newAmount !== editTx.amount;
      const newDateStr = format(editDate, "yyyy-MM-dd");
      const newMonthYear = format(editDate, "yyyy-MM");

      // Compute balance adjustments
      const oldReversals: { accountId: string; delta: number }[] = [];
      const newUpdates: { accountId: string; delta: number }[] = [];

      if (amountChanged) {
        const oldDeltas = getBalanceDeltas(editTx);
        for (const d of oldDeltas) {
          oldReversals.push({ accountId: d.accountId, delta: -d.delta });
        }
        const newTx = { ...editTx, amount: newAmount };
        const newDeltas = getBalanceDeltas(newTx);
        for (const d of newDeltas) {
          newUpdates.push(d);
        }
      }

      await updateTransactionAtomic(
        userId,
        editTx.id,
        {
          amount: newAmount,
          note: editNote.trim(),
          date: newDateStr,
          month_year: newMonthYear,
          main_category: editMainCategory,
          sub_category: editSubCategory,
        },
        oldReversals,
        newUpdates
      );

      toast.success("แก้ไขรายการสำเร็จ");
      setEditTx(null);
      onMutate?.();
    } catch (err: any) {
      toast.error("แก้ไขล้มเหลว: " + err.message);
    }
    setEditSaving(false);
  };

  // ===== Delete Handler =====
  const handleDelete = async () => {
    if (!deleteTx || !userId) return;
    setDeleting(true);
    try {
      // Reverse the balance effect
      const oldDeltas = getBalanceDeltas(deleteTx);
      const reversals = oldDeltas.map((d) => ({ accountId: d.accountId, delta: -d.delta }));

      await deleteTransactionAtomic(userId, deleteTx.id, reversals);
      toast.success("ลบรายการสำเร็จ");
      setDeleteTx(null);
      onMutate?.();
    } catch (err: any) {
      toast.error("ลบล้มเหลว: " + err.message);
    }
    setDeleting(false);
  };

  const headerClass = "text-sm cursor-pointer select-none hover:text-foreground transition-colors";

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0);
      if (page > 2) pages.push("ellipsis");
      for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 3) pages.push("ellipsis");
      pages.push(totalPages - 1);
    }
    return pages;
  };

  return (
    <>
      <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "560ms" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">รายการธุรกรรม</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Top controls */}
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="w-[65px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground hidden sm:inline">รายการต่อหน้า</span>

              <Select value={filter} onValueChange={setFilter}>
                <SelectTrigger className="w-[130px] sm:w-[160px] h-8 text-xs">
                  <SelectValue placeholder="ประเภท" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {types.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Quick date presets */}
              <Select
                value="custom"
                onValueChange={(val) => {
                  const today = new Date();
                  switch (val) {
                    case "7days":
                      setDateFrom(subDays(today, 6));
                      setDateTo(today);
                      break;
                    case "this_week":
                      setDateFrom(startOfWeek(today, { weekStartsOn: 1 }));
                      setDateTo(today);
                      break;
                    case "this_month":
                      setDateFrom(startOfMonth(today));
                      setDateTo(today);
                      break;
                    case "30days":
                      setDateFrom(subDays(today, 29));
                      setDateTo(today);
                      break;
                    case "clear":
                      setDateFrom(undefined);
                      setDateTo(undefined);
                      break;
                  }
                }}
              >
                <SelectTrigger className="w-[120px] sm:w-[140px] h-8 text-xs">
                  <SelectValue placeholder="ช่วงเวลา" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7days">7 วันล่าสุด</SelectItem>
                  <SelectItem value="this_week">สัปดาห์นี้</SelectItem>
                  <SelectItem value="this_month">เดือนนี้</SelectItem>
                  <SelectItem value="30days">30 วันล่าสุด</SelectItem>
                  <SelectItem value="custom" disabled className="hidden">กำหนดเอง</SelectItem>
                  {(dateFrom || dateTo) && (
                    <SelectItem value="clear">ล้างตัวกรอง</SelectItem>
                  )}
                </SelectContent>
              </Select>

              {/* Date range filter */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, "dd/MM/yy") : "เริ่ม"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">ถึง</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "dd/MM/yy") : "สิ้นสุด"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                  ✕
                </Button>
              )}

              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <Input
                  placeholder="ค้นหา..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-8 w-28 sm:w-48 text-xs"
                />
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    placeholder="ขั้นต่ำ"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    className="h-8 w-20 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">-</span>
                  <Input
                    type="number"
                    placeholder="สูงสุด"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    className="h-8 w-20 text-xs"
                  />
                  {(minAmount || maxAmount) && (
                    <Button variant="ghost" size="sm" className="h-8 text-xs px-1.5" onClick={() => { setMinAmount(""); setMaxAmount(""); }}>
                      ✕
                    </Button>
                  )}
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={exportCSV}>
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Export CSV</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className={`${headerClass} w-28`} onClick={() => handleSort("date")}>
                    <span className="flex items-center">วันที่ <SortIcon column="date" /></span>
                  </TableHead>
                  <TableHead className={headerClass} onClick={() => handleSort("type")}>
                    <span className="flex items-center">ประเภท <SortIcon column="type" /></span>
                  </TableHead>
                  <TableHead className={headerClass} onClick={() => handleSort("category")}>
                    <span className="flex items-center">หมวดหมู่ <SortIcon column="category" /></span>
                  </TableHead>
                  <TableHead className={`${headerClass} hidden md:table-cell`} onClick={() => handleSort("subcategory")}>
                    <span className="flex items-center">หมวดหมู่ย่อย <SortIcon column="subcategory" /></span>
                  </TableHead>
                  <TableHead className="text-sm hidden sm:table-cell">รายละเอียด</TableHead>
                  <TableHead className={`${headerClass} text-right`} onClick={() => handleSort("amount")}>
                    <span className="flex items-center justify-end">จำนวน <SortIcon column="amount" /></span>
                  </TableHead>
                  {canEdit && (
                    <TableHead className="text-sm w-10" />
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((t, i) => (
                  <TableRow key={t.id || i} className="border-border group">
                    <TableCell className="text-xs sm:text-sm text-muted-foreground py-2 sm:py-2.5 whitespace-nowrap">
                      {formatDate(t.date)}
                    </TableCell>
                    <TableCell className="py-2 sm:py-2.5">
                      <Badge variant="secondary" className={`text-xs sm:text-sm ${getTypeBadgeClass(t.type)}`}>
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs sm:text-sm py-2 sm:py-2.5 max-w-[100px] sm:max-w-none truncate">{t.main_category || t.category}</TableCell>
                    <TableCell className="text-xs sm:text-sm py-2 sm:py-2.5 max-w-[100px] sm:max-w-none truncate hidden md:table-cell">{t.category}</TableCell>
                    <TableCell className="text-xs sm:text-sm text-muted-foreground py-2 sm:py-2.5 hidden sm:table-cell">
                      {t.description || "-"}
                    </TableCell>
                    <TableCell
                      className={`text-xs sm:text-sm text-right font-medium font-display py-2 sm:py-2.5 whitespace-nowrap ${
                        t.type === "รายรับ" ? "text-income" : t.type === "โอน" ? "text-muted-foreground" : "text-expense"
                      }`}
                    >
                      {t.type === "รายรับ" ? "+" : t.type === "โอน" ? "" : "-"}
                      {formatCurrency(t.amount)}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="py-2 sm:py-2.5 w-10">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem onClick={() => openEdit(t)} className="gap-2 text-sm">
                              <Pencil className="h-3.5 w-3.5" /> แก้ไข
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteTx(t)}
                              className="gap-2 text-sm text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> ลบ
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
              {filter !== "all" && (
                <tfoot>
                  <tr className="border-t border-border bg-muted/50">
                    <TableCell colSpan={canEdit ? 6 : 5} className="text-sm font-semibold py-2.5 hidden sm:table-cell">
                      รวม {filter}
                    </TableCell>
                    <TableCell colSpan={canEdit ? 5 : 4} className="text-sm font-semibold py-2.5 sm:hidden">
                      รวม {filter}
                    </TableCell>
                    <TableCell className="text-sm text-right font-bold font-display py-2.5">
                      {formatCurrency(totalAmount)}
                    </TableCell>
                  </tr>
                </tfoot>
              )}
            </Table>
          </div>

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
              <span className="text-[11px] sm:text-xs text-muted-foreground">
                {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {getPageNumbers().map((p, i) =>
                  p === "ellipsis" ? (
                    <span key={`e${i}`} className="text-xs text-muted-foreground px-1">…</span>
                  ) : (
                    <Button
                      key={p}
                      variant={page === p ? "default" : "outline"}
                      size="icon"
                      className="h-6 w-6 sm:h-7 sm:w-7 text-xs"
                      onClick={() => setPage(p)}
                    >
                      {p + 1}
                    </Button>
                  )
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Edit Dialog ===== */}
      <Dialog open={!!editTx} onOpenChange={(o) => !o && setEditTx(null)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              แก้ไขรายการ
            </DialogTitle>
            <DialogDescription>
              {editTx && (
                <Badge variant="secondary" className={`text-xs ${getTypeBadgeClass(editTx.type)}`}>
                  {editTx.type}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Date Picker */}
            <div className="space-y-2">
              <Label>วันที่</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !editDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editDate ? format(editDate, "dd/MM/yyyy") : "เลือกวันที่"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editDate}
                    onSelect={(d) => d && setEditDate(d)}
                    disabled={(d) => d > new Date() || d < new Date(new Date().getFullYear() - 5, 0, 1)}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Category Selection */}
            {editTx?.type !== "โอนเงิน" && editMainCats.length > 0 && (
              <div className="space-y-2">
                <Label>หมวดหมู่หลัก</Label>
                <Select value={editMainCategory} onValueChange={(v) => { setEditMainCategory(v); setEditSubCategory(""); }}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="เลือกหมวดหมู่หลัก" />
                  </SelectTrigger>
                  <SelectContent>
                    {editMainCats.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editSubCats.length > 0 && (
              <div className="space-y-2">
                <Label>หมวดหมู่ย่อย</Label>
                <div className="flex flex-wrap gap-1.5">
                  {editSubCats.map((sub) => (
                    <button
                      key={sub}
                      onClick={() => setEditSubCategory(sub)}
                      className={cn(
                        "px-3 py-1.5 text-xs rounded-full border transition-colors",
                        editSubCategory === sub
                          ? editTx?.type === "รายรับ"
                            ? "bg-income/20 text-income border-income/40 font-medium"
                            : "bg-expense/20 text-expense border-expense/40 font-medium"
                          : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Amount */}
            <div className="space-y-2">
              <Label>จำนวนเงิน</Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max="9999999.99"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="text-lg font-mono"
              />
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>บันทึก</Label>
              <Textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="รายละเอียดเพิ่มเติม..."
                maxLength={500}
                rows={3}
              />
              <p className="text-[11px] text-muted-foreground text-right">{editNote.length}/500</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)}>ยกเลิก</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Delete Confirmation ===== */}
      <AlertDialog open={!!deleteTx} onOpenChange={(o) => !o && setDeleteTx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              ยืนยันการลบรายการ
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTx && (
                <span className="space-y-1 block">
                  <span className="block">
                    {formatDate(deleteTx.date)} — {deleteTx.category}
                  </span>
                  <span className="block font-semibold text-foreground">
                    {deleteTx.type === "รายรับ" ? "+" : "-"}{formatCurrency(deleteTx.amount)} บาท
                  </span>
                  <span className="block text-destructive text-xs mt-2">
                    ยอดเงินในบัญชีจะถูกปรับย้อนกลับโดยอัตโนมัติ การกระทำนี้ไม่สามารถย้อนกลับได้
                  </span>
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              ลบรายการ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
