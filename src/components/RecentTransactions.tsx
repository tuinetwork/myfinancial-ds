import { useMemo, useRef, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetData, formatCurrency } from "@/hooks/useBudgetData";
import { ArrowUpRight, ArrowDownRight, Clock, ArrowRightLeft } from "lucide-react";

interface Props {
  data: BudgetData;
}

export function RecentTransactions({ data }: Props) {
  const recent = useMemo(() => {
    return [...data.transactions]
      .sort((a, b) => {
        const cmp = b.date.localeCompare(a.date);
        return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
      })
      .slice(0, 5);
  }, [data.transactions]);

  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(recent.map((t) => t.id));
    const freshIds = new Set<string>();
    currentIds.forEach((id) => {
      if (prevIdsRef.current.size > 0 && !prevIdsRef.current.has(id)) {
        freshIds.add(id);
      }
    });
    prevIdsRef.current = currentIds;
    if (freshIds.size > 0) {
      setNewIds(freshIds);
      const timer = setTimeout(() => setNewIds(new Set()), 600);
      return () => clearTimeout(timer);
    }
  }, [recent]);

  const formatDate = (dateStr: string) => {
    const parts = dateStr.split("-");
    const day = parseInt(parts[parts.length - 1] || "0", 10);
    const month = parts.length >= 2 ? parseInt(parts[parts.length - 2], 10) : 0;
    const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    return `${day} ${thaiMonths[month - 1] || ""}`;
  };

  return (
    <Card className="border-none shadow-argon animate-fade-in h-full flex flex-col" style={{ animationDelay: "480ms" }}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <CardTitle className="text-base font-semibold">รายการล่าสุด</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 flex-1">
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">ยังไม่มีรายการ</p>
        ) : (
          recent.map((t) => {
            // เช็คว่าเป็นรายการโอนหรือไม่ (ตรวจสอบทั้ง type และ category เพื่อความแม่นยำ)
            const isTransfer = t.type === "โอน" || t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี";
            const isIncome = t.type === "รายรับ";
            const isNew = newIds.has(t.id);

            return (
              <div
                key={t.id}
                className={`flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0 transition-all duration-300 ${
                  isNew ? "animate-fade-in bg-primary/5 rounded-lg" : ""
                }`}
              >
                {/* ไอคอน: ถ้าเป็นโอนให้ใช้ ArrowRightLeft สีเทา */}
                <div className={`shrink-0 p-1.5 rounded-lg ${
                  isTransfer ? "bg-slate-100" : isIncome ? "bg-income/10" : "bg-expense/10"
                }`}>
                  {isTransfer ? (
                    <ArrowRightLeft className="h-3.5 w-3.5 text-slate-500" />
                  ) : isIncome ? (
                    <ArrowUpRight className="h-3.5 w-3.5 text-income" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5 text-expense" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.category}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(t.date)}</p>
                </div>

                {/* จำนวนเงิน: ถ้าเป็นโอน ไม่ต้องมีเครื่องหมายลบ และใช้สีเทา */}
                <span className={`text-sm font-semibold font-display tabular-nums ${
                  isTransfer ? "text-slate-600" : isIncome ? "text-income" : "text-expense"
                }`}>
                  {isTransfer ? "" : (isIncome ? "+" : "-")}
                  {formatCurrency(t.amount)}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
