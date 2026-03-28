import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Insight } from "@/hooks/useSpendingInsights";

interface Props {
  insights: Insight[];
}

export function SpendingInsightsButton({ insights }: Props) {
  const hasWarning = insights.some((t) => t.priority >= 5);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Lightbulb className={cn("h-4 w-4", hasWarning ? "text-amber-500" : "text-muted-foreground")} />
          {hasWarning && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white px-1 animate-in zoom-in-50">
              {insights.filter((t) => t.priority >= 5).length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
          <h4 className="text-sm font-semibold">คำแนะนำการเงิน</h4>
        </div>
        {insights.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">ไม่มีคำแนะนำ</p>
          </div>
        ) : (
          <div className="p-1">
            {insights.map((tip, i) => {
              const Icon = tip.icon;
              return (
                <div key={i} className="flex items-start gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
                  <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", tip.color)} />
                  <div>
                    <p className="text-sm font-medium">{tip.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{tip.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
