import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";

interface Props {
  data: BudgetData;
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

type SortKey = "date" | "type" | "category" | "amount";
type SortDir = "asc" | "desc" | null;

const TYPE_ORDER = ["รายรับ", "ค่าใช้จ่าย", "เงินออม", "บิล/สาธารณูปโภค", "ค่าสมาชิกรายเดือน", "หนี้สิน"];

export function TransactionTable({ data }: Props) {
  const [pageSize, setPageSize] = useState(50);
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  const types = useMemo(() => {
    const available = Array.from(new Set(data.transactions.map((t) => t.type)));
    return TYPE_ORDER.filter((t) => available.includes(t)).concat(
      available.filter((t) => !TYPE_ORDER.includes(t))
    );
  }, [data.transactions]);

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
    let items = filter === "all" ? data.transactions : data.transactions.filter((t) => t.type === filter);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (t) =>
          t.category.toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q)
      );
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
          cmp = a.category.localeCompare(b.category, "th");
          break;
        case "amount":
          cmp = a.amount - b.amount;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return indexed;
  }, [data.transactions, filter, search, sortKey, sortDir]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, t) => sum + t.amount, 0),
    [filtered]
  );

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  // Reset page when filter/search/pageSize changes
  useMemo(() => { setPage(0); }, [filter, search, pageSize]);

  const exportCSV = () => {
    const BOM = "\uFEFF";
    const headers = ["วันที่", "ประเภท", "หมวดหมู่", "รายละเอียด", "จำนวน"];
    const rows = filtered.map((t) => [
      t.date,
      t.type,
      t.category,
      t.description || "",
      t.type === "รายรับ" ? t.amount : -t.amount,
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
                <TableHead className="text-sm hidden sm:table-cell">รายละเอียด</TableHead>
                <TableHead className={`${headerClass} text-right`} onClick={() => handleSort("amount")}>
                  <span className="flex items-center justify-end">จำนวน <SortIcon column="amount" /></span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((t, i) => (
                <TableRow key={i} className="border-border">
                 <TableCell className="text-xs sm:text-sm text-muted-foreground py-2 sm:py-2.5 whitespace-nowrap">
                    {formatDate(t.date)}
                  </TableCell>
                  <TableCell className="py-2 sm:py-2.5">
                    <Badge variant="secondary" className={`text-xs sm:text-sm ${getTypeBadgeClass(t.type)}`}>
                      {t.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs sm:text-sm py-2 sm:py-2.5 max-w-[100px] sm:max-w-none truncate">{t.category}</TableCell>
                  <TableCell className="text-xs sm:text-sm text-muted-foreground py-2 sm:py-2.5 hidden sm:table-cell">
                    {t.description || "-"}
                  </TableCell>
                  <TableCell
                    className={`text-xs sm:text-sm text-right font-medium font-display py-2 sm:py-2.5 whitespace-nowrap ${
                      t.type === "รายรับ" ? "text-income" : "text-expense"
                    }`}
                  >
                    {t.type === "รายรับ" ? "+" : "-"}
                    {formatCurrency(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {filter !== "all" && (
              <tfoot>
                <tr className="border-t border-border bg-muted/50">
                  <TableCell colSpan={4} className="text-sm font-semibold py-2.5 hidden sm:table-cell">
                    รวม {filter}
                  </TableCell>
                  <TableCell colSpan={3} className="text-sm font-semibold py-2.5 sm:hidden">
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
  );
}
