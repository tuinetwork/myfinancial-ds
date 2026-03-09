import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CalendarClock, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { formatCurrency, type BudgetData } from "@/hooks/useBudgetData";
import { expandRecurrence, formatFrequencyThai } from "@/lib/recurrence";

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
  isPaid: boolean;
  paidAmount: number;
  paidPercent: number;
  isRecurring: boolean;
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

    // Build a map of actual spending per sub-category from transactions
    const txActuals: Record<string, number> = {};
    for (const tx of data.transactions || []) {
      if (tx.type !== "รายรับ") {
        const key = tx.category;
        if (key) txActuals[key] = (txActuals[key] || 0) + tx.amount;
      }
    }

    for (const cat of categories) {
      const catItems = data.expenses[cat] || [];
      for (const item of catItems) {
        if (!item.dueDate) continue;
        const rrule = item.recurrence ?? null;

        if (rrule) {
          // Expand recurring items for the current month
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth() + 1;
          const startDate = item.startDate ?? null;
          const endDate = item.endDate ?? null;
          const paidDates = item.paidDates ?? [];
          const expandedDates = expandRecurrence(item.dueDate, rrule, year, month, startDate, endDate);
          for (const expDate of expandedDates) {
            const daysUntil = getDaysUntil(expDate);
            const isPaidByDate = paidDates.includes(expDate);
            items.push({
              label: item.label,
              category: categoryNames[cat],
              amount: item.budget,
              dueDate: expDate,
              isOverdue: daysUntil < 0,
              daysUntil,
              isPaid: isPaidByDate,
              paidAmount: isPaidByDate ? item.budget : 0,
              paidPercent: isPaidByDate ? 100 : 0,
              isRecurring: true,
            });
          }
        } else {
          // One-time payment
          const daysUntil = getDaysUntil(item.dueDate);
          const paidDates = item.paidDates ?? [];
          const isPaidByDate = paidDates.includes(item.dueDate ?? "");
          const paidAmount = isPaidByDate ? item.budget : (txActuals[item.label] ?? 0);
          const isPaid = isPaidByDate || (paidAmount >= item.budget && item.budget > 0);
          const paidPercent = item.budget > 0 ? Math.min(100, Math.round((paidAmount / item.budget) * 100)) : 0;
          items.push({
            label: item.label,
            category: categoryNames[cat],
            amount: item.budget,
            dueDate: item.dueDate,
            isOverdue: daysUntil < 0,
            daysUntil,
            isPaid,
            paidAmount,
            paidPercent,
            isRecurring: false,
          });
        }
      }
    }

    // Sort: unpaid first, then by due date ascending
    items.sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
      return a.dueDate.localeCompare(b.dueDate);
    });

    return items.slice(0, 5);
  }, [data.expenses, data.transactions]);

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
            className={`flex items-center justify-between py-2 border-b border-border last:border-0 ${bill.isPaid ? "opacity-60" : ""}`}
          >
            <div className="flex-1 min-w-0">
              <div className={`font-medium text-sm truncate ${bill.isPaid ? "line-through text-muted-foreground" : ""}`}>
                {bill.isRecurring && <RefreshCw className="h-3 w-3 inline-block mr-1 text-primary" />}
                {bill.label}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{formatThaiDate(bill.dueDate)}</span>
                {bill.isPaid ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500 text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    ชำระแล้ว
                  </Badge>
                ) : bill.isOverdue ? (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    เลยกำหนด {Math.abs(bill.daysUntil)} วัน
                  </Badge>
                ) : bill.daysUntil === 0 ? (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    วันนี้!
                  </Badge>
                ) : bill.daysUntil <= 3 ? (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive text-destructive">
                    อีก {bill.daysUntil} วัน
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/50 text-muted-foreground">
                    อีก {bill.daysUntil} วัน
                  </Badge>
                )}
              </div>
              {!bill.isPaid && bill.paidAmount > 0 && (
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={bill.paidPercent} className="h-1.5 flex-1" />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {formatCurrency(bill.paidAmount)}/{formatCurrency(bill.amount)}
                  </span>
                </div>
              )}
            </div>
            <div className={`text-sm font-semibold text-right ${bill.isPaid ? "line-through text-muted-foreground" : ""}`}>
              {formatCurrency(bill.amount)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
