import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useSettings } from "@/contexts/SettingsContext";
import { Settings, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: Props) {
  const { includeCarryOver, setIncludeCarryOver } = useSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md backdrop-blur-md bg-card/95 border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" />
            ตั้งค่าทั่วไป
          </DialogTitle>
        </DialogHeader>

        <Separator />

        <div className="space-y-6 py-2">
          {/* Carry-over toggle */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <Label htmlFor="carry-over" className="text-sm font-medium">
                  รวมยอดยกมา
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p className="text-xs">
                      ยอดยกมา = ผลรวมรายรับ - รายจ่าย ของทุกเดือนก่อนหน้า (ไม่รวมรายการโอน)
                      เปิดสวิตช์นี้เพื่อให้ยอดรายรับและคงเหลือสุทธิรวมยอดสะสมจากเดือนก่อนๆ ด้วย
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground">
                เมื่อเปิด: ยอดรายรับจะรวมยอดยกมาจากเดือนก่อน
                และยอดคงเหลือสุทธิจะสะท้อนยอดสะสมทั้งหมด
              </p>
            </div>
            <Switch
              id="carry-over"
              checked={includeCarryOver}
              onCheckedChange={setIncludeCarryOver}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">คำอธิบายการคำนวณ</h4>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                <p className="font-medium text-foreground">การ์ดรายรับ</p>
                <p>• ยอดรวม = รายรับจริง {includeCarryOver ? "+ ยอดยกมา" : "(ไม่รวมยอดยกมา)"}</p>
                <p>• เปอร์เซ็นต์ = ((ยอดรวม - งบประมาณรายรับ) / งบประมาณรายรับ) × 100</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                <p className="font-medium text-foreground">การ์ดรายจ่าย</p>
                <p>• ยอดรวม = รายจ่ายจริง (ไม่รวมรายการโอน)</p>
                <p>• เปอร์เซ็นต์ = ((รายจ่ายจริง - งบประมาณรายจ่าย) / งบประมาณรายจ่าย) × 100</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                <p className="font-medium text-foreground">การ์ดคงเหลือสุทธิ</p>
                <p>• คงเหลือ = รายรับจริง {includeCarryOver ? "+ ยอดยกมา" : ""} - รายจ่ายจริง</p>
                <p>• ไม่รวมรายการโอนระหว่างบัญชี</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                <p className="font-medium text-foreground">เปรียบเทียบกับเดือนก่อน</p>
                <p>• เปอร์เซ็นต์ = ((เดือนนี้ - เดือนก่อน) / เดือนก่อน) × 100</p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
