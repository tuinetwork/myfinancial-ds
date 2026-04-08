import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/hooks/useBudgetData";
import { ForecastResult } from "@/hooks/useEndOfMonthForecast";
import { Sparkles, Info, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  forecast: ForecastResult;
}

const confidenceLabel = { high: "ความแม่นยำสูง", medium: "ความแม่นยำปานกลาง", low: "ข้อมูลน้อย" };
const confidenceColor = { high: "text-accent", medium: "text-amber-500", low: "text-muted-foreground" };

export function ForecastCard({ forecast }: Props) {
  const { projectedBalance, dailyBurnRate, remainingDays, elapsedDays, totalDays, confidence, actualIncome, budgetedIncome, projectedIncome } = forecast;
  const elapsedPct = Math.round((elapsedDays / totalDays) * 100);
  const isNegative = projectedBalance < 0;
  const usingBudgetedIncome = projectedIncome > actualIncome;

  return (
    <Card className="border-none shadow-sm animate-fade-in">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          คาดการณ์สิ้นเดือน
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-56 text-xs">
              คำนวณจากรายรับที่ตั้งงบไว้ หักด้วยรายจ่ายจริง + ประมาณการรายจ่ายที่เหลือ (อัตราเฉลี่ย/วัน × วันที่เหลือ)
            </TooltipContent>
          </Tooltip>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Projected balance */}
        <div>
          <p className="text-xs text-muted-foreground mb-0.5">ยอดคงเหลือที่คาดการณ์</p>
          <div className="flex items-center gap-2">
            <p className={cn("text-2xl font-bold font-display", isNegative ? "text-destructive" : "text-foreground")}>
              {isNegative ? "-" : ""}{formatCurrency(Math.abs(projectedBalance))}
            </p>
            {isNegative
              ? <TrendingDown className="h-4 w-4 text-destructive" />
              : <TrendingUp className="h-4 w-4 text-accent" />}
          </div>
          {isNegative && (
            <p className="text-xs text-destructive mt-0.5">⚠ คาดว่าจะขาดดุลสิ้นเดือน</p>
          )}
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
            <span>ผ่านมาแล้ว {elapsedDays} วัน</span>
            <span>เหลืออีก {remainingDays} วัน</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${elapsedPct}%` }}
            />
          </div>
        </div>

        {/* Income row */}
        <div className="grid grid-cols-2 gap-2 text-xs border-t pt-2">
          <div>
            <p className="text-muted-foreground">รายรับจริงถึงตอนนี้</p>
            <p className="font-semibold text-accent">{formatCurrency(actualIncome)}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">
              ประมาณการรายรับทั้งเดือน
              {usingBudgetedIncome && (
                <span className="ml-1 text-[10px] text-primary">(จากงบ)</span>
              )}
            </p>
            <p className="font-semibold text-primary">{formatCurrency(projectedIncome)}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex justify-between text-xs">
          <div>
            <p className="text-muted-foreground">ใช้จ่ายเฉลี่ย/วัน</p>
            <p className="font-semibold font-display">{formatCurrency(dailyBurnRate)}</p>
          </div>
          <div className="text-right">
            <p className={cn("text-muted-foreground", confidenceColor[confidence])}>
              {confidenceLabel[confidence]}
            </p>
            <p className="text-muted-foreground text-[11px]">จากข้อมูล {elapsedDays} วัน</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
