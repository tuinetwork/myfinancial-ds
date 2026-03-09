import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarClock, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { BudgetData } from "@/hooks/useBudgetData";
import { cn } from "@/lib/utils";

interface UpcomingBillsProps {
  data: BudgetData;
}

interface BillItem {
  name: string;
  category: string;
  amount: number;
  dueDate: string;
  daysUntil: number;
}

const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function formatThaiDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";
    const day = d.getDate();
    const month = THAI_MONTHS_SHORT[d.getMonth()];
    return `${day} ${month}`;
  } catch {
    return "-";
  }
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dateStr);
  dueDate.setHours(0, 0, 0, 0);
  const diffTime = dueDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function getUrgencyLabel(days: number): { text: string; color: string; icon: React.ElementType } {
  if (days < 0) return { text: "เลยกำหนด", color: "text-destructive", icon: AlertTriangle };
  if (days === 0) return { text: "วันนี้", color: "text-destructive", icon: AlertTriangle };
  if (days === 1) return { text: "พรุ่งนี้", color: "text-orange-500", icon: Clock };
  if (days <= 3) return { text: `อีก ${days} วัน`, color: "text-orange-500", icon: Clock };
  if (days <= 7) return { text: `อีก ${days} วัน`, color: "text-amber-500", icon: Clock };
  return { text: `อีก ${days} วัน`, color: "text-emerald-600", icon: CheckCircle2 };
}

export function UpcomingBills({ data }: UpcomingBillsProps) {
  const bills = useMemo(() => {
    const items: BillItem[] = [];
    
    // Collect bills from expense categories that have due dates
    const categoryMap = {
      bills: "บิล",
      debts: "หนี้สิน",
      subscriptions: "ค่าสมาชิก",
      savings: "เงินออม",
    };
    
    for (const [key, label] of Object.entries(categoryMap)) {
      const category = data.expenses[key as keyof typeof data.expenses];
      if (!category) continue;
      
      for (const item of category) {
        if (item.dueDate) {
          const daysUntil = getDaysUntil(item.dueDate);
          items.push({
            name: item.label,
            category: label,
            amount: item.budget,
            dueDate: item.dueDate,
            daysUntil,
          });
        }
      }
    }
    
    // Sort by due date (nearest first)
    items.sort((a, b) => a.daysUntil - b.daysUntil);
    
    // Return top 5
    return items.slice(0, 5);
  }, [data]);

  const totalUpcoming = bills.reduce((sum, bill) => sum + bill.amount, 0);

  if (bills.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            บิลที่ต้องชำระ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-2 text-emerald-500/50" />
            <p className="text-sm">ไม่มีบิลที่ต้องชำระในช่วงนี้</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            บิลที่ต้องชำระ
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            รวม {totalUpcoming.toLocaleString("th-TH")} ฿
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {bills.map((bill, index) => {
          const urgency = getUrgencyLabel(bill.daysUntil);
          const UrgencyIcon = urgency.icon;
          
          return (
            <div
              key={`${bill.name}-${index}`}
              className={cn(
                "flex items-center justify-between p-2.5 rounded-lg transition-colors",
                bill.daysUntil <= 0 ? "bg-destructive/10" : 
                bill.daysUntil <= 3 ? "bg-accent" : "bg-muted/50"
              )}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <UrgencyIcon className={cn("h-4 w-4 shrink-0", urgency.color)} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{bill.name}</p>
                  <p className="text-xs text-muted-foreground">{bill.category}</p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-sm font-medium tabular-nums">
                  {bill.amount.toLocaleString("th-TH")} ฿
                </p>
                <p className={cn("text-xs", urgency.color)}>
                  {formatThaiDateShort(bill.dueDate)} ({urgency.text})
                </p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
  );
}
