import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function YearlyTransactionTable({ yearlyData }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [filter, setFilter] = useState<string>("all");

  const monthOptions = yearlyData.months.map((m) => m.month);

  const transactions = useMemo(() => {
    if (selectedMonth === "all") return yearlyData.aggregated.transactions;
    const found = yearlyData.months.find((m) => m.month === selectedMonth);
    return found ? found.data.transactions : [];
  }, [yearlyData, selectedMonth]);

  const types = useMemo(
    () => Array.from(new Set(transactions.map((t) => t.type))),
    [transactions]
  );

  const filtered = useMemo(() => {
    const items = filter === "all" ? transactions : transactions.filter((t) => t.type === filter);
    return [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, filter]);

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
                <SelectItem key={m} value={m}>{m}</SelectItem>
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
                <TableHead className="text-xs w-28">วันที่</TableHead>
                <TableHead className="text-xs">ประเภท</TableHead>
                <TableHead className="text-xs">หมวดหมู่</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">รายละเอียด</TableHead>
                <TableHead className="text-xs text-right">จำนวน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t, i) => (
                <TableRow key={i} className="border-border">
                  <TableCell className="text-xs text-muted-foreground py-2.5">{formatDate(t.date)}</TableCell>
                  <TableCell className="py-2.5">
                    <Badge variant="secondary" className={`text-xs ${getTypeBadgeClass(t.type)}`}>{t.type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs py-2.5">{t.category}</TableCell>
                  <TableCell className="text-xs text-muted-foreground py-2.5 hidden sm:table-cell">{t.description || "-"}</TableCell>
                  <TableCell className={`text-xs text-right font-medium font-display py-2.5 ${t.type === "รายรับ" ? "text-income" : "text-expense"}`}>
                    {t.type === "รายรับ" ? "+" : "-"}{formatCurrency(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {filter !== "all" && filtered.length > 0 && (
              <TableFooter>
                <TableRow className="border-border bg-muted/50">
                  <TableCell colSpan={4} className="text-xs font-semibold py-2.5">
                    รวม {filter}
                  </TableCell>
                  <TableCell className={`text-xs text-right font-bold font-display py-2.5 ${filter === "รายรับ" ? "text-income" : "text-expense"}`}>
                    {filter === "รายรับ" ? "+" : "-"}{formatCurrency(filtered.reduce((s, t) => s + t.amount, 0))}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
