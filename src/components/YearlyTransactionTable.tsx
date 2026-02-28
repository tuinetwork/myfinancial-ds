import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/hooks/useBudgetData";
import { YearlyData } from "@/hooks/useYearlyData";

interface Props {
  yearlyData: YearlyData;
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
    default:
      return "bg-muted text-muted-foreground border-none";
  }
}

function formatDate(dateStr: string) {
  const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  
  // Handle DD/MM/YYYY
  const slashParts = dateStr.split("/");
  if (slashParts.length === 3) {
    const day = parseInt(slashParts[0], 10);
    const month = parseInt(slashParts[1], 10) - 1;
    const year = parseInt(slashParts[2], 10);
    const thaiYear = (year + 543) % 100;
    return `${day} ${monthNames[month]} ${thaiYear}`;
  }
  
  // Handle YYYY-MM-DD
  const dashParts = dateStr.split("-");
  if (dashParts.length === 3) {
    const year = parseInt(dashParts[0], 10);
    const month = parseInt(dashParts[1], 10) - 1;
    const day = parseInt(dashParts[2], 10);
    const thaiYear = (year + 543) % 100;
    return `${day} ${monthNames[month]} ${thaiYear}`;
  }
  
  return dateStr;
}

function parseDateValue(dateStr: string): number {
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10)).getTime();
  }
  return new Date(dateStr).getTime();
}

type SortKey = "date" | "type" | "category" | "amount";
type SortDir = "asc" | "desc" | null;

const TYPE_ORDER = ["รายรับ", "ค่าใช้จ่าย", "เงินออม", "บิล/สาธารณูปโภค", "ค่าสมาชิกรายเดือน", "หนี้สิน"];

export function YearlyTransactionTable({ yearlyData }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [filter, setFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const thaiMonthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const formatPeriodThai = (period: string) => {
    const [y, m] = period.split("-");
    const thaiYear = (parseInt(y, 10) + 543) % 100;
    return `${thaiMonthNames[parseInt(m, 10) - 1]} ${thaiYear}`;
  };
  const monthOptions = yearlyData.months.map((m) => m.month);

  const transactions = useMemo(() => {
    if (selectedMonth === "all") return yearlyData.aggregated.transactions;
    const found = yearlyData.months.find((m) => m.month === selectedMonth);
    return found ? found.data.transactions : [];
  }, [yearlyData, selectedMonth]);

  const types = useMemo(() => {
    const available = Array.from(new Set(transactions.map((t) => t.type)));
    return TYPE_ORDER.filter((t) => available.includes(t)).concat(
      available.filter((t) => !TYPE_ORDER.includes(t))
    );
  }, [transactions]);

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
    const items = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);
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
  }, [transactions, filter, sortKey, sortDir]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, t) => sum + t.amount, 0),
    [filtered]
  );

  const headerClass = "text-sm cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "560ms" }}>
      <CardHeader className="pb-2 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-semibold">
            รายการล่าสุด ({filtered.length} รายการ)
          </CardTitle>
          <Select value={selectedMonth} onValueChange={(v) => { setSelectedMonth(v); setFilter("all"); }}>
            <SelectTrigger className="w-40 bg-card border-border shadow-sm h-8 text-xs">
              <SelectValue placeholder="เลือกเดือน" />
            </SelectTrigger>
            <SelectContent className="bg-card border-border shadow-lg z-50">
              <SelectItem value="all">ทุกเดือน</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>{formatPeriodThai(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant={filter === "all" ? "default" : "outline"} size="sm" className="h-7 text-xs rounded-full" onClick={() => setFilter("all")}>
            ทั้งหมด
          </Button>
          {types.map((type) => (
            <Button key={type} variant={filter === type ? "default" : "outline"} size="sm" className="h-7 text-xs rounded-full" onClick={() => setFilter(type)}>
              {type}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="max-h-96 overflow-auto">
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
              {filtered.map((t, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell className="text-sm text-muted-foreground py-2.5">{formatDate(t.date)}</TableCell>
                  <TableCell className="py-2.5">
                    <Badge variant="secondary" className={`text-sm ${getTypeBadgeClass(t.type)}`}>{t.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm py-2.5">{t.category}</TableCell>
                  <TableCell className="text-sm text-muted-foreground py-2.5 hidden sm:table-cell">{t.description || "-"}</TableCell>
                  <TableCell className={`text-sm text-right font-medium font-display py-2.5 ${t.type === "รายรับ" ? "text-income" : "text-expense"}`}>
                    {t.type === "รายรับ" ? "+" : "-"}{formatCurrency(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {filter !== "all" && filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/50">
                  <TableCell colSpan={4} className="text-sm font-semibold py-2.5 hidden sm:table-cell">
                    รวม {filter}
                  </TableCell>
                  <TableCell colSpan={3} className="text-sm font-semibold py-2.5 sm:hidden">
                    รวม {filter}
                  </TableCell>
                  <TableCell className={`text-sm text-right font-bold font-display py-2.5 ${filter === "รายรับ" ? "text-income" : "text-expense"}`}>
                    {filter === "รายรับ" ? "+" : "-"}{formatCurrency(totalAmount)}
                  </TableCell>
                </tr>
              </tfoot>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
