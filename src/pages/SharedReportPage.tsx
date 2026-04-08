import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSharedReport, SharedReport } from "@/lib/share-service";
import { formatCurrency } from "@/hooks/useBudgetData";
import { Loader2, TrendingDown, TrendingUp, AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

function ProgressBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SharedReportPage() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"not_found" | "expired" | null>(null);

  useEffect(() => {
    if (!token) return;
    getSharedReport(token)
      .then((r) => {
        if (!r) { setError("not_found"); return; }
        if (r.expiresAt < Date.now()) { setError("expired"); return; }
        setReport(r);
      })
      .catch(() => setError("not_found"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-3 max-w-sm">
          {error === "expired" ? (
            <>
              <AlertTriangle className="h-12 w-12 mx-auto text-amber-500" />
              <h1 className="text-xl font-bold">ลิงก์หมดอายุแล้ว</h1>
              <p className="text-muted-foreground text-sm">ลิงก์แชร์รายงานนี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่จากเจ้าของรายงาน</p>
            </>
          ) : (
            <>
              <Lock className="h-12 w-12 mx-auto text-muted-foreground" />
              <h1 className="text-xl font-bold">ไม่พบรายงาน</h1>
              <p className="text-muted-foreground text-sm">ลิงก์นี้ไม่ถูกต้องหรือถูกลบไปแล้ว</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const { snapshot: s, sharedBy } = report;
  const isDeficit = s.balance < 0;
  const expireDate = new Date(report.expiresAt).toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-lg mx-auto p-4 space-y-5 pb-12">
        {/* Header */}
        <div className="pt-6 pb-2 text-center space-y-1">
          <p className="text-xs text-muted-foreground">รายงานสรุปการเงิน</p>
          <h1 className="text-2xl font-bold font-display">{s.monthName}</h1>
          <p className="text-xs text-muted-foreground">แชร์โดย <span className="font-medium text-foreground">{sharedBy}</span></p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card rounded-xl p-3 border text-center">
            <p className="text-[10px] text-muted-foreground mb-1">รายรับ</p>
            <p className="text-sm font-bold text-accent">{formatCurrency(s.totalIncome)}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border text-center">
            <p className="text-[10px] text-muted-foreground mb-1">รายจ่าย</p>
            <p className="text-sm font-bold text-destructive">{formatCurrency(s.totalExpense)}</p>
          </div>
          <div className="bg-card rounded-xl p-3 border text-center">
            <p className="text-[10px] text-muted-foreground mb-1">คงเหลือ</p>
            <div className="flex items-center justify-center gap-1">
              {isDeficit
                ? <TrendingDown className="h-3 w-3 text-destructive shrink-0" />
                : <TrendingUp className="h-3 w-3 text-accent shrink-0" />}
              <p className={cn("text-sm font-bold", isDeficit ? "text-destructive" : "text-foreground")}>
                {isDeficit ? "-" : ""}{formatCurrency(Math.abs(s.balance))}
              </p>
            </div>
          </div>
        </div>

        {/* Income breakdown */}
        {s.incomeItems.length > 0 && (
          <div className="bg-card rounded-xl p-4 border space-y-3">
            <h2 className="text-sm font-semibold">รายรับ</h2>
            {s.incomeItems.map((item) => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground">{item.label}</span>
                  <span className="text-accent font-medium">{formatCurrency(item.actual)}</span>
                </div>
                <ProgressBar value={item.actual} max={item.budget || item.actual} color="bg-accent" />
              </div>
            ))}
          </div>
        )}

        {/* Expense breakdown */}
        {s.expenseCategories.length > 0 && (
          <div className="bg-card rounded-xl p-4 border space-y-3">
            <h2 className="text-sm font-semibold">รายจ่าย</h2>
            {s.expenseCategories.map((item) => {
              const over = item.budget > 0 && item.actual > item.budget;
              return (
                <div key={item.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground">{item.label}</span>
                    <span className={cn("font-medium", over ? "text-destructive" : "text-foreground")}>
                      {formatCurrency(item.actual)}
                      {item.budget > 0 && (
                        <span className="text-muted-foreground ml-1">/ {formatCurrency(item.budget)}</span>
                      )}
                    </span>
                  </div>
                  {item.budget > 0 && (
                    <ProgressBar value={item.actual} max={item.budget} color={over ? "bg-destructive" : "bg-primary"} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Top transactions */}
        {s.topTransactions.length > 0 && (
          <div className="bg-card rounded-xl p-4 border space-y-2">
            <h2 className="text-sm font-semibold">รายการสูงสุด 15 อันดับ</h2>
            <div className="space-y-1">
              {s.topTransactions.map((tx, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">{tx.description || tx.category}</p>
                    <p className="text-muted-foreground">{tx.date} · {tx.category}</p>
                  </div>
                  <p className={cn("ml-3 font-medium shrink-0", tx.type === "รายรับ" ? "text-accent" : "text-foreground")}>
                    {tx.type === "รายรับ" ? "+" : "-"}{formatCurrency(tx.amount)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground">
          ข้อมูล ณ วันที่สร้างลิงก์ · ลิงก์หมดอายุ {expireDate}
        </p>
      </div>
    </div>
  );
}
