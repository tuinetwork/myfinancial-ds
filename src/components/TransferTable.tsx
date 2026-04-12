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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Download,
  MoreHorizontal, Pencil, Trash2, Loader2, ArrowRightLeft, Filter, X,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format, isWithinInterval, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { BudgetData, Transaction, formatCurrency } from "@/hooks/useBudgetData";
import { deleteTransactionAtomic, updateTransactionAtomic } from "@/lib/firestore-services";
import { toast } from "sonner";
import { Account } from "@/types/finance";

interface Props {
  data: BudgetData;
  userId?: string | null;
  onMutate?: () => void;
  allTransactions?: Transaction[];
}

function formatDate(dateStr: string) {
  const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const isoParts = dateStr.split("-");
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    const year = parseInt(isoParts[0], 10);
    const month = parseInt(isoParts[1], 10) - 1;
    const day = parseInt(isoParts[2], 10);
    const thaiYear = (year + 543) % 100;
    return `${day} ${monthNames[month]} ${thaiYear}`;
  }
  return dateStr;
}

function parseDateValue(dateStr: string): number {
  const isoParts = dateStr.split("-");
  if (isoParts.length === 3 && isoParts[0].length === 4) {
    return new Date(parseInt(isoParts[0], 10), parseInt(isoParts[1], 10) - 1, parseInt(isoParts[2], 10)).getTime();
  }
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
  }
  return new Date(dateStr).getTime();
}

type SortKey = "date" | "amount" | "from" | "to";
type SortDir = "asc" | "desc" | null;

export function TransferTable({ data, userId, onMutate, allTransactions }: Props) {
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Filters
  const [filterFrom, setFilterFrom] = useState<string>("all");
  const [filterTo, setFilterTo] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Edit state
  const [editTx, setEditTx] = useState<Transaction | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteTx, setDeleteTx] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canEdit = !!userId;

  // Load accounts for name mapping
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "accounts"), (snap) => {
      const accs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account));
      setAccounts(accs);
    });
    return () => unsub();
  }, [userId]);

  const accountMap = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((a) => { map[a.id] = a.name; });
    return map;
  }, [accounts]);

  const transfers = useMemo(() => {
    // ถ้ามี dateRange และมี allTransactions ให้ใช้ทั้งหมด มิฉะนั้นใช้เฉพาะเดือนที่เลือก
    const source = (dateRange?.from && allTransactions) ? allTransactions : data.transactions;
    return source.filter(
      (t) => t.type === "โอน" || t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี"
    );
  }, [data.transactions, allTransactions, dateRange]);

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
    let items = transfers;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (t) =>
          (t.description || "").toLowerCase().includes(q) ||
          (accountMap[t.from_account_id || ""] || "").toLowerCase().includes(q) ||
          (accountMap[t.to_account_id || ""] || "").toLowerCase().includes(q) ||
          String(t.amount).includes(q)
      );
    }

    if (filterFrom !== "all") {
      items = items.filter((t) => t.from_account_id === filterFrom);
    }

    if (filterTo !== "all") {
      items = items.filter((t) => t.to_account_id === filterTo);
    }

    if (dateRange?.from) {
      items = items.filter((t) => {
        try {
          const d = parseISO(t.date);
          const from = dateRange.from!;
          const to = dateRange.to ?? dateRange.from!;
          return isWithinInterval(d, { start: from, end: to });
        } catch { return true; }
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
        case "amount":
          cmp = a.amount - b.amount;
          break;
        case "from":
          cmp = (accountMap[a.from_account_id || ""] || "").localeCompare(accountMap[b.from_account_id || ""] || "", "th");
          break;
        case "to":
          cmp = (accountMap[a.to_account_id || ""] || "").localeCompare(accountMap[b.to_account_id || ""] || "", "th");
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return indexed;
  }, [transfers, search, filterFrom, filterTo, dateRange, sortKey, sortDir, accountMap]);

  const totalAmount = useMemo(() => filtered.reduce((sum, t) => sum + t.amount, 0), [filtered]);
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useMemo(() => { setPage(0); }, [search, pageSize, filterFrom, filterTo, dateRange]);

  const exportCSV = () => {
    const BOM = "\uFEFF";
    const headers = ["วันที่", "บัญชีต้นทาง", "บัญชีปลายทาง", "รายละเอียด", "จำนวน"];
    const rows = filtered.map((t) => [
      t.date,
      accountMap[t.from_account_id || ""] || "-",
      accountMap[t.to_account_id || ""] || "-",
      t.description || "",
      t.amount,
    ]);
    const csv = BOM + [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transfers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async () => {
    if (!deleteTx || !userId) return;
    setDeleting(true);
    try {
      const reversals: { accountId: string; delta: number }[] = [];
      if (deleteTx.from_account_id) {
        reversals.push({ accountId: deleteTx.from_account_id, delta: deleteTx.amount });
      }
      if (deleteTx.to_account_id) {
        reversals.push({ accountId: deleteTx.to_account_id, delta: -deleteTx.amount });
      }
      await deleteTransactionAtomic(userId, deleteTx.id, reversals);
      toast.success("ลบรายการโอนสำเร็จ");
      setDeleteTx(null);
      onMutate?.();
    } catch (err: any) {
      toast.error("ลบล้มเหลว: " + err.message);
    }
    setDeleting(false);
  };

  const openEdit = (tx: Transaction) => {
    setEditTx(tx);
    setEditNote(tx.description || "");
  };

  const handleSaveEdit = async () => {
    if (!editTx || !userId) return;
    if (editNote.length > 500) {
      toast.error("บันทึกต้องไม่เกิน 500 ตัวอักษร");
      return;
    }
    setEditSaving(true);
    try {
      await updateTransactionAtomic(userId, editTx.id, { note: editNote.trim() }, [], []);
      toast.success("แก้ไขรายละเอียดสำเร็จ");
      setEditTx(null);
      onMutate?.();
    } catch (err: any) {
      toast.error("แก้ไขล้มเหลว: " + err.message);
    }
    setEditSaving(false);
  };

  const headerClass = "text-sm cursor-pointer select-none hover:text-foreground transition-colors";

  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0);
      if (page > 2) pages.push("ellipsis");
      for (let i = Math.max(1, page - 1); i <= Math.min(totalPages - 2, page + 1); i++) pages.push(i);
      if (page < totalPages - 3) pages.push("ellipsis");
      pages.push(totalPages - 1);
    }
    return pages;
  };

  return (
    <>
      <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "560ms" }}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-primary" />
            รายการโอนระหว่างบัญชี
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Row 1: Page size + search + export */}
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

            <div className="flex items-center gap-2 ml-auto">
              <Input
                placeholder="ค้นหา..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-28 sm:w-48 text-xs"
              />
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={exportCSV}>
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            </div>
          </div>

          {/* Row 2: Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

            {/* From account */}
            <Select value={filterFrom} onValueChange={setFilterFrom}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue placeholder="บัญชีต้นทาง" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">บัญชีต้นทาง ทั้งหมด</SelectItem>
                {accounts.filter(a => !a.is_deleted).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* To account */}
            <Select value={filterTo} onValueChange={setFilterTo}>
              <SelectTrigger className="h-8 text-xs w-40">
                <SelectValue placeholder="บัญชีปลายทาง" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">บัญชีปลายทาง ทั้งหมด</SelectItem>
                {accounts.filter(a => !a.is_deleted).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 font-normal">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {dateRange?.from ? (
                    dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
                      ? `${format(dateRange.from, "d MMM", { locale: th })} – ${format(dateRange.to, "d MMM yy", { locale: th })}`
                      : format(dateRange.from, "d MMM yy", { locale: th })
                  ) : "ช่วงเวลา"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                  locale={th}
                />
              </PopoverContent>
            </Popover>

            {/* Clear filters */}
            {(filterFrom !== "all" || filterTo !== "all" || dateRange) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground gap-1"
                onClick={() => { setFilterFrom("all"); setFilterTo("all"); setDateRange(undefined); }}
              >
                <X className="h-3 w-3" /> ล้างตัวกรอง
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              ไม่มีรายการโอนในเดือนนี้
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className={`${headerClass} w-28`} onClick={() => handleSort("date")}>
                        <span className="flex items-center">วันที่ <SortIcon column="date" /></span>
                      </TableHead>
                      <TableHead className={headerClass} onClick={() => handleSort("from")}>
                        <span className="flex items-center">บัญชีต้นทาง <SortIcon column="from" /></span>
                      </TableHead>
                      <TableHead className="text-sm w-8 text-center">→</TableHead>
                      <TableHead className={headerClass} onClick={() => handleSort("to")}>
                        <span className="flex items-center">บัญชีปลายทาง <SortIcon column="to" /></span>
                      </TableHead>
                      <TableHead className="text-sm hidden sm:table-cell">รายละเอียด</TableHead>
                      <TableHead className={`${headerClass} text-right`} onClick={() => handleSort("amount")}>
                        <span className="flex items-center justify-end">จำนวน <SortIcon column="amount" /></span>
                      </TableHead>
                      {canEdit && <TableHead className="text-sm w-10" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paged.map((t, i) => (
                      <TableRow key={t.id || i} className="border-border group">
                        <TableCell className="text-xs sm:text-sm text-muted-foreground py-2 sm:py-2.5 whitespace-nowrap">
                          <div>{formatDate(t.date)}</div>
                          {t.created_at && (
                            <div className="text-[10px] text-muted-foreground/60">
                              {new Date(t.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm py-2 sm:py-2.5">
                          <Badge variant="outline" className="text-xs font-normal">
                            {accountMap[t.from_account_id || ""] || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center py-2 sm:py-2.5">
                          <ArrowRightLeft className="h-3.5 w-3.5 text-muted-foreground mx-auto" />
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm py-2 sm:py-2.5">
                          <Badge variant="outline" className="text-xs font-normal">
                            {accountMap[t.to_account_id || ""] || "-"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-muted-foreground py-2 sm:py-2.5 hidden sm:table-cell">
                          {t.description || "-"}
                        </TableCell>
                        <TableCell className="text-xs sm:text-sm text-right font-medium font-display py-2 sm:py-2.5 whitespace-nowrap text-muted-foreground">
                          {formatCurrency(t.amount)}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="py-2 sm:py-2.5 w-10">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  <tfoot>
                    <tr className="border-t border-border bg-muted/50">
                      <TableCell colSpan={canEdit ? 5 : 4} className="text-sm font-semibold py-2.5 hidden sm:table-cell">
                        รวมโอน ({filtered.length} รายการ)
                      </TableCell>
                      <TableCell colSpan={canEdit ? 4 : 3} className="text-sm font-semibold py-2.5 sm:hidden">
                        รวมโอน
                      </TableCell>
                      <TableCell className="text-sm text-right font-bold font-display py-2.5">
                        {formatCurrency(totalAmount)}
                      </TableCell>
                      {canEdit && <TableCell />}
                    </tr>
                  </tfoot>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2">
                  <span className="text-[11px] sm:text-xs text-muted-foreground">
                    {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} / {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    {getPageNumbers().map((p, i) =>
                      p === "ellipsis" ? (
                        <span key={`e${i}`} className="text-xs text-muted-foreground px-1">…</span>
                      ) : (
                        <Button key={p} variant={page === p ? "default" : "outline"} size="icon" className="h-6 w-6 sm:h-7 sm:w-7 text-xs" onClick={() => setPage(p)}>
                          {p + 1}
                        </Button>
                      )
                    )}
                    <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editTx} onOpenChange={(o) => !o && setEditTx(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              แก้ไขรายละเอียดการโอน
            </DialogTitle>
          </DialogHeader>
          {editTx && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{formatDate(editTx.date)}</span>
                <span>—</span>
                <Badge variant="outline" className="text-xs font-normal">
                  {accountMap[editTx.from_account_id || ""] || "-"}
                </Badge>
                <ArrowRightLeft className="h-3 w-3" />
                <Badge variant="outline" className="text-xs font-normal">
                  {accountMap[editTx.to_account_id || ""] || "-"}
                </Badge>
                <span className="ml-auto font-medium">{formatCurrency(editTx.amount)}</span>
              </div>
              <div className="space-y-2">
                <Label>รายละเอียด</Label>
                <Textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="เพิ่มรายละเอียด เช่น ค่าโอนคืน, ออมแชร์งวดที่ 3..."
                  maxLength={500}
                  rows={3}
                />
                <p className="text-[11px] text-muted-foreground text-right">{editNote.length}/500</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)}>ยกเลิก</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTx} onOpenChange={(o) => !o && setDeleteTx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              ยืนยันการลบรายการโอน
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTx && (
                <span className="space-y-1 block">
                  <span className="block">
                    {formatDate(deleteTx.date)} — {accountMap[deleteTx.from_account_id || ""] || "?"} → {accountMap[deleteTx.to_account_id || ""] || "?"}
                  </span>
                  <span className="block font-semibold text-foreground">
                    {formatCurrency(deleteTx.amount)} บาท
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
