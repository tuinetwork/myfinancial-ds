import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { BudgetData } from "@/hooks/useBudgetData";
import { createSharedReport } from "@/lib/share-service";
import { Share2, Copy, Check, Loader2, Link } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: BudgetData;
  carryOver: number;
}

export function ShareReportDialog({ open, onOpenChange, data, carryOver }: Props) {
  const { userId, user } = useAuth();
  const { toast } = useToast();
  const [link, setLink] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!userId || !user) return;
    setGenerating(true);
    try {
      const token = await createSharedReport(
        userId,
        user.displayName || "ผู้ใช้",
        data,
        carryOver
      );
      const url = `${window.location.origin}/report/${token}`;
      setLink(url);
    } catch (e) {
      toast({ title: "เกิดข้อผิดพลาด", description: "ไม่สามารถสร้างลิงก์ได้", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast({ title: "คัดลอกแล้ว", description: "ลิงก์ถูกคัดลอกไปยังคลิปบอร์ด" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setLink(""); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            แชร์รายงาน {data.month}
          </DialogTitle>
          <DialogDescription>
            สร้างลิงก์สาธารณะให้คนอื่นดูรายงานสรุปของเดือนนี้ได้ โดยไม่ต้องล็อกอิน
            ลิงก์มีอายุ 72 ชั่วโมง
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {!link ? (
            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />กำลังสร้างลิงก์...</>
              ) : (
                <><Link className="h-4 w-4 mr-2" />สร้างลิงก์แชร์</>
              )}
            </Button>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">ลิงก์สาธารณะ (มีอายุ 30 วัน)</p>
              <div className="flex gap-2">
                <Input value={link} readOnly className="text-xs font-mono" />
                <Button
                  size="icon"
                  variant={copied ? "default" : "outline"}
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                ข้อมูลเป็น snapshot ณ เวลาที่สร้างลิงก์ ลิงก์มีอายุ 72 ชั่วโมง
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
