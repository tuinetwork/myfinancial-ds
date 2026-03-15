import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CalendarClock, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { formatCurrency, type BudgetData } from "@/hooks/useBudgetData";
import { expandRecurrence, formatFrequencyThai, matchTxToOccurrences, type TxEntry } from "@/lib/recurrence";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [filter, setFilter] = useState<"unpaid" | "paid">("unpaid");

  const allBills = useMemo(() => {
    const items: BillItem[] = [];
    const categories = ["bills", "debts", "subscriptions", "savings"] as const;
    const categoryNames: Record<typeof categories[number], string> = {
      bills: "บิล/สาธารณูปโภค",
      debts: "หนี้สิน",
      subscriptions: "ค่าสมาชิก",
      savings: "เงินออม",
    };

    const txBySubDate: Record<string, TxEntry[]> = {};
    for (const tx of data.transactions || []) {
      if (tx.type !== "รายรับ") {
        const key = tx.category;
        const date = (tx as any).date ?? "";
        if (key && date) {
          if (!txBySubDate[key]) txBySubDate[key] = [];
          txBySubDate[key].push({ date, amount: tx.amount });
        }
      }
    }

    const now = new Date();
    const months: { year: number; month: number }[] = [
      { year: now.getFullYear(), month: now.getMonth() + 1 },
      { year: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), month: now.getMonth() === 11 ? 1 : now.getMonth() + 2 },
    ];

    const seenKeys = new Set<string>();

    for (const cat of categories) {
      const catItems = data.expenses[cat] || [];
      for (const item of catItems) {
        if (!item.dueDate) continue;
        const rrule = item.recurrence ?? null;

        if (rrule) {
          const startDate = item.startDate ?? null;
          const endDate = item.endDate ?? null;
          const paidDates = item.paidDates ?? [];

          for (const { year, month } of months) {
            const expandedDates = expandRecurrence(item.dueDate, rrule, year, month, startDate, endDate);
            const txList = txBySubDate[item.label] ?? [];
            const txMatchMap = matchTxToOccurrences(txList, expandedDates, item.budget);
            for (const expDate of expandedDates) {
              const key = `${item.label}::${expDate}`;
              if (seenKeys.has(key)) continue;
              seenKeys.add(key);
              const daysUntil = getDaysUntil(expDate);
              const isPaidByDate = paidDates.includes(expDate);
              const isPaidByTx = !isPaidByDate && (txMatchMap.get(expDate)?.isPaid ?? false);
              const isPaid = isPaidByDate || isPaidByTx;
              items.push({
                label: item.label,
                category: categoryNames[cat],
                amount: item.budget,
                dueDate: expDate,
                isOverdue: daysUntil < 0,
                daysUntil,
                isPaid,
                paidAmount: isPaid ? item.budget : 0,
                paidPercent: isPaid ? 100 : 0,
                isRecurring: true,
              });
            }
          }
        } else {
          const daysUntil = getDaysUntil(item.dueDate);
          const paidDates = item.paidDates ?? [];
          const isPaidByDate = paidDates.includes(item.dueDate ?? "");
          const txList = txBySubDate[item.label] ?? [];
          const txMatchMap = matchTxToOccurrences(txList, [item.dueDate], item.budget);
          const isPaidByTx = txMatchMap.get(item.dueDate)?.isPaid ?? false;
          const isPaid = isPaidByDate || isPaidByTx;
          const totalTx = txList.reduce((s, t) => s + t.amount, 0);
          const paidAmount = isPaid ? item.budget : totalTx;
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

    items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return items;
  }, [data.expenses, data.transactions]);

  const filteredBills = useMemo(() => {
    if (filter === "paid") {
      return allBills.filter(item => item.isPaid).slice(0, 4);
    }
    return allBills.filter(item => !item.isPaid).slice(0, 4);
  }, [allBills, filter]);

  const paidCount = useMemo(() => allBills.filter(b => b.isPaid).length, [allBills]);

  if (allBills.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            บิลที่ต้องชำระ
          </CardTitle>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "unpaid" | "paid")}>
            <TabsList className="h-7">
              <TabsTrigger value="unpaid" className="text-[11px] px-2.5 h-5">
                ค้างชำระ
              </TabsTrigger>
              <TabsTrigger value="paid" className="text-[11px] px-2.5 h-5">
                ชำระแล้ว {paidCount > 0 && `(${paidCount})`}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {filteredBills.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {filter === "paid" ? "ยังไม่มีรายการที่ชำระแล้ว" : "ไม่มีบิลค้างชำระ 🎉"}
          </p>
        ) : (
          filteredBills.map((bill, idx) => (
            <div
              key={`${bill.label}-${bill.dueDate}-${idx}`}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {bill.isRecurring && <RefreshCw className="h-3 w-3 inline-block mr-1 text-primary" />}
                  {bill.isPaid && <CheckCircle2 className="h-3 w-3 inline-block mr-1 text-accent" />}
                  {bill.label}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatThaiDate(bill.dueDate)}</span>
                  {bill.isPaid ? (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-accent/50 text-accent">
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
                {bill.paidAmount > 0 && !bill.isPaid && (
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={bill.paidPercent} className="h-1.5 flex-1" />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatCurrency(bill.paidAmount)}/{formatCurrency(bill.amount)}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-sm font-semibold text-right">
                {formatCurrency(bill.amount)}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}