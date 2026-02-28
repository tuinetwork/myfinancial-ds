import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTransactionNotifications, TransactionNotification } from "@/hooks/useTransactionNotifications";
import { formatCurrency } from "@/hooks/useBudgetData";

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

function typeLabel(type: string) {
  if (type === "income") return "รายรับ";
  return "รายจ่าย";
}

function typeColor(type: string) {
  return type === "income" ? "text-income" : "text-expense";
}

function NotificationItem({ tx }: { tx: TransactionNotification }) {
  return (
    <div className="flex items-start gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
      <div className="w-2 h-2 rounded-full mt-1.5 shrink-0"
        style={{ backgroundColor: tx.type === "income" ? "hsl(160 60% 45%)" : "hsl(0 72% 55%)" }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium truncate">{tx.category || typeLabel(tx.type)}</span>
          <span className={`text-xs font-semibold font-display whitespace-nowrap ${typeColor(tx.type)}`}>
            {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
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
  const recent = notifications.slice(0, 5);

  return (
    <Popover onOpenChange={(open) => { if (open) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1 animate-in zoom-in-50">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
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
      </PopoverContent>
    </Popover>
  );
}
