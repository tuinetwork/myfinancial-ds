import { Bell, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useTransactionNotifications, TransactionNotification } from "@/hooks/useTransactionNotifications";
import { useRequesterNotifications } from "@/hooks/useRequesterNotifications";
import { formatCurrency } from "@/hooks/useBudgetData";
import { Link } from "react-router-dom";

function formatThaiDate(dateStr: string) {
  const monthNames = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const day = parseInt(parts[2], 10);
    const month = parseInt(parts[1], 10) - 1;
    return `${day} ${monthNames[month]}`;
  }
  return dateStr;
}

// 1. ปรับ typeLabel ให้รองรับ "โอน"
function typeLabel(type: string) {
  if (type === "income" || type === "รายรับ") return "รายรับ";
  if (type === "transfer" || type === "โอน" || type === "โอนระหว่างบัญชี") return "โอนระหว่างบัญชี";
  return "รายจ่าย";
}

// 2. ปรับ typeColor ให้รายการโอนเป็นสีเทา (slate)
function typeColor(type: string) {
  if (type === "income" || type === "รายรับ") return "text-income";
  if (type === "transfer" || type === "โอน" || type === "โอนระหว่างบัญชี") return "text-slate-600";
  return "text-expense";
}

function NotificationItem({ tx }: { tx: TransactionNotification }) {
  // เช็คเงื่อนไขว่าเป็นรายการโอนหรือไม่ (เผื่อข้อมูลมาเป็นภาษาไทยหรืออังกฤษ)
  const isTransfer = tx.type === "transfer" || tx.type === "โอน" || tx.type === "โอนระหว่างบัญชี" || tx.category === "โอนระหว่างบัญชี";
  const isIncome = tx.type === "income" || tx.type === "รายรับ";

  return (
    <div className="flex items-start gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
        style={{ 
          // 3. ปรับสีจุด (dot) ด้านหน้าให้เป็นสีเทาถ้าเป็นการโอน
          backgroundColor: isTransfer 
            ? "hsl(215 16% 47%)" // สี slate-500 โดยประมาณ
            : isIncome 
              ? "hsl(160 60% 45%)" 
              : "hsl(0 72% 55%)" 
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium truncate">{tx.category || typeLabel(tx.type)}</span>
          <span className={`text-xs font-semibold font-display whitespace-nowrap ${typeColor(tx.type)}`}>
            {/* 4. ถ้าเป็นการโอน ไม่ต้องใส่เครื่องหมาย +/- */}
            {!isTransfer && (isIncome ? "+" : "-")}{formatCurrency(tx.amount)}
          </span>
        </div>
        {tx.note && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{tx.note}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-0.5">{formatThaiDate(tx.date)}</p>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useTransactionNotifications();
  const { requesters, pendingCount, isAdmin } = useRequesterNotifications();
  const recent = notifications.slice(0, 5);
  const totalBadge = unreadCount + (isAdmin ? pendingCount : 0);

  return (
    <Popover onOpenChange={(open) => { if (open) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {totalBadge > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1 animate-in zoom-in-50">
              {totalBadge > 99 ? "99+" : totalBadge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        {/* Pending requesters section for admin/dev */}
        {isAdmin && pendingCount > 0 && (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <UserPlus className="h-3.5 w-3.5 text-primary" />
                <h4 className="text-sm font-semibold">รออนุมัติ</h4>
              </div>
              <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                {pendingCount}
              </Badge>
            </div>
            <div className="p-1">
              {requesters.slice(0, 3).map((req) => (
                <div key={req.id} className="flex items-center gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
                  <div className="w-2 h-2 rounded-full mt-0.5 shrink-0 bg-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{req.display_name || "ไม่ระบุชื่อ"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{req.email}</p>
                  </div>
                </div>
              ))}
              {pendingCount > 3 && (
                <p className="text-[11px] text-muted-foreground text-center py-1">
                  +{pendingCount - 3} รายการเพิ่มเติม
                </p>
              )}
            </div>
            <div className="border-t border-border px-4 py-2">
              <Link to="/admin" className="text-xs text-primary hover:underline font-medium">
                จัดการทั้งหมด →
              </Link>
            </div>
          </>
        )}

        {/* Transaction notifications */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h4 className="text-sm font-semibold">รายการล่าสุด</h4>
          {recent.length > 0 && (
            <span className="text-[11px] text-muted-foreground">{recent.length} รายการ</span>
          )}
        </div>
        {recent.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">ยังไม่มีรายการ</p>
          </div>
        ) : (
          <div className="p-1">
            {recent.map((tx) => (
              <NotificationItem key={tx.id} tx={tx} />
            ))}
          </div>
        )}
        {recent.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <Link to="/transactions" className="text-xs text-primary hover:underline font-medium">
              ดูทั้งหมด →
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
