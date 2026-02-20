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
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
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
    default:
      return "bg-muted text-muted-foreground border-none";
  }
}

function formatDate(dateStr: string) {
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    const thaiYear = (d.getFullYear() + 543) % 100;
    const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${day} ${monthNames[d.getMonth()]} ${thaiYear}`;
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

export function TransactionTable({ data }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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
    const items = filter === "all" ? data.transactions : data.transactions.filter((t) => t.type === filter);
    const sorted = [...items];

    if (sortDir === null) return sorted;

    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "date":
          cmp = parseDateValue(a.date) - parseDateValue(b.date);
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

    return sorted;
  }, [data.transactions, filter, sortKey, sortDir]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, t) => sum + t.amount, 0),
    [filtered]
  );

  const headerClass = "text-xs cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "560ms" }}>
      <CardHeader className="pb-2 space-y-3">
        <CardTitle className="text-base font-semibold">
          รายการล่าสุด ({filtered.length} รายการ)
        </CardTitle>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs rounded-full"
            onClick={() => setFilter("all")}
          >
            ทั้งหมด
          </Button>
          {types.map((type) => (
            <Button
              key={type}
              variant={filter === type ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs rounded-full"
              onClick={() => setFilter(type)}
            >
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
                <TableHead className="text-xs hidden sm:table-cell">รายละเอียด</TableHead>
                <TableHead className={`${headerClass} text-right`} onClick={() => handleSort("amount")}>
                  <span className="flex items-center justify-end">จำนวน <SortIcon column="amount" /></span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell className="text-xs text-muted-foreground py-2.5">
                    {formatDate(t.date)}
                  </TableCell>
                  <TableCell className="py-2.5">
                    <Badge variant="secondary" className={`text-xs ${getTypeBadgeClass(t.type)}`}>
                      {t.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs py-2.5">{t.category}</TableCell>
                  <TableCell className="text-xs text-muted-foreground py-2.5 hidden sm:table-cell">
                    {t.description || "-"}
                  </TableCell>
                  <TableCell
                    className={`text-xs text-right font-medium font-display py-2.5 ${
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
                  <TableCell colSpan={4} className="text-xs font-semibold py-2.5 hidden sm:table-cell">
                    รวม {filter}
                  </TableCell>
                  <TableCell colSpan={3} className="text-xs font-semibold py-2.5 sm:hidden">
                    รวม {filter}
                  </TableCell>
                  <TableCell className="text-xs text-right font-bold font-display py-2.5">
                    {formatCurrency(totalAmount)}
                  </TableCell>
                </tr>
              </tfoot>
            )}
            {filter === "all" && (
              <tfoot>
                {types.map((type) => {
                  const typeTotal = data.transactions
                    .filter((t) => t.type === type)
                    .reduce((s, t) => s + t.amount, 0);
                  if (typeTotal === 0) return null;
                  return (
                    <tr key={type} className="border-t border-border bg-muted/30">
                      <TableCell colSpan={4} className="text-xs font-semibold py-2 hidden sm:table-cell">
                        รวม{type}
                      </TableCell>
                      <TableCell colSpan={3} className="text-xs font-semibold py-2 sm:hidden">
                        รวม{type}
                      </TableCell>
                      <TableCell
                        className={`text-xs text-right font-bold font-display py-2 ${
                          type === "รายรับ" ? "text-income" : "text-expense"
                        }`}
                      >
                        {formatCurrency(typeTotal)}
                      </TableCell>
                    </tr>
                  );
                })}
              </tfoot>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
