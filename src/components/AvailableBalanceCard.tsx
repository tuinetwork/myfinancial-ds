import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AvailableBalanceCardProps {
  /** ยอดเงินที่ใช้ได้ */
  availableBalance: number;
  /** กระแสเงินสดสุทธิเดือนนี้ (บวก/ลบ) */
  netCashflow: number;
  className?: string;
}

const formatTHB = (value: number) =>
  new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));

export function AvailableBalanceCard({
  availableBalance,
  netCashflow,
  className,
}: AvailableBalanceCardProps) {
  const isPositive = netCashflow >= 0;
  const TrendIcon = isPositive ? ArrowUpRight : ArrowDownRight;
  const trendColor = isPositive ? "text-income" : "text-expense";
  const sign = isPositive ? "+" : "-";

  return (
    <div
      className={cn(
        // Glassmorphism: translucent surface, backdrop blur, subtle border + shadow
        "relative flex flex-col gap-3 p-6 rounded-3xl",
        "border border-border/60 shadow-sm",
        "bg-card/60 backdrop-blur-xl backdrop-saturate-150",
        "supports-[backdrop-filter]:bg-card/50",
        "transition-shadow hover:shadow-md",
        className,
      )}
    >
      {/* Title */}
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        ยอดเงินที่ใช้ได้
      </p>

      {/* Main Value */}
      <p className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-foreground tabular-nums">
        <span className="mr-1 text-2xl sm:text-3xl text-muted-foreground/80 font-semibold align-top">
          ฿
        </span>
        {formatTHB(availableBalance)}
      </p>

      {/* Sub-text: Net cashflow */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-muted-foreground">กระแสเงินสดเดือนนี้:</span>
        <span className={cn("inline-flex items-center gap-0.5 font-semibold tabular-nums", trendColor)}>
          <TrendIcon className="h-4 w-4" strokeWidth={2.5} />
          {sign}฿{formatTHB(netCashflow)}
        </span>
      </div>
    </div>
  );
}

export default AvailableBalanceCard;
