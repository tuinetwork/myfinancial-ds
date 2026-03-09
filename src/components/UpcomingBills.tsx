import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, AlertCircle } from "lucide-react";
import { formatCurrency, type BudgetData } from "@/hooks/useBudgetData";

interface UpcomingBillsProps {
  data: BudgetData;
}

interface BillItem {
  label: string;
  category: string;
  amount: number;
  dueDate: string;
  isOverdue: boolean;
  daysUntil: number;
}

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
  const dueDate = new Date(dateStr);
  dueDate.setHours(0, 0, 0, 0);
  const diffTime = dueDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export function UpcomingBills({ data }: UpcomingBillsProps) {
  const bills = useMemo(() => {
    const items: BillItem[] = [];
    const categories = ["bills", "debts", "subscriptions", "savings"] as const;
    const categoryNames: Record<typeof categories[number], string> = {
      bills: "บิล/สาธารณูปโภค",
      debts: "หนี้สิน",
      subscriptions: "ค่าสมาชิก",
      savings: "เงินออม",
    };

    for (const cat of categories) {
      const catItems = data.expenses[cat] || [];
      for (const item of catItems) {
        if (item.dueDate) {
          const daysUntil = getDaysUntil(item.dueDate);
          items.push({
            label: item.label,
            category: categoryNames[cat],
            amount: item.budget,
            dueDate: item.dueDate,
            isOverdue: daysUntil < 0,
            daysUntil,
          });
        }
      }
    }

    // Sort by due date (ascending)
    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    // Return top 5
    return items.slice(0, 5);
  }, [data.expenses]);

  if (bills.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          บิลที่ต้องชำระ
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {bills.map((bill, idx) => (
          <div
            key={`${bill.label}-${idx}`}
            className="flex items-center justify-between py-2 border-b border-border last:border-0"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{bill.label}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatThaiDate(bill.dueDate)}</span>
                {bill.isOverdue ? (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    เลยกำหนด
                  </Badge>
                ) : bill.daysUntil <= 3 ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-warning text-warning">
                    อีก {bill.daysUntil} วัน
                  </Badge>
                ) : null}
              </div>
            </div>
            <div className="text-sm font-semibold text-right">
              {formatCurrency(bill.amount)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
