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
  const d = new Date(dateStr);
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export function TransactionTable({ data }: Props) {
  const sorted = [...data.transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <Card className="border-none shadow-sm animate-fade-in" style={{ animationDelay: "560ms" }}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          รายการล่าสุด ({sorted.length} รายการ)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <div className="max-h-96 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-xs w-20">วันที่</TableHead>
                <TableHead className="text-xs">ประเภท</TableHead>
                <TableHead className="text-xs">หมวดหมู่</TableHead>
                <TableHead className="text-xs hidden sm:table-cell">รายละเอียด</TableHead>
                <TableHead className="text-xs text-right">จำนวน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((t, i) => (
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
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
