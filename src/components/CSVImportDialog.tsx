import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { collection, query, where, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { createTransactionAtomic } from "@/lib/firestore-services";
import { parseCSV, detectBankFormat, mapRowToTransaction, BANK_FORMATS, BankFormat, ParsedRow } from "@/lib/csv-parser";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { FileUp, Loader2, CheckCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatCurrency } from "@/hooks/useBudgetData";
import { collection as col } from "firebase/firestore";

type Step = "upload" | "map" | "review" | "done";

interface ImportRow extends ParsedRow {
  selected: boolean;
  main_category: string;
  sub_category: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

async function getNextTxId(userId: string, monthYear: string): Promise<string> {
  const txCol = collection(firestore, "users", userId, "transactions");
  const q = query(txCol, where("month_year", "==", monthYear));
  const snap = await getDocs(q);
  const prefix = `${monthYear}-tx-`;
  let maxNum = 0;
  snap.forEach((d) => {
    if (d.id.startsWith(prefix)) {
      const n = parseInt(d.id.slice(prefix.length), 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
}

export function CSVImportDialog({ open, onOpenChange }: Props) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [format, setFormat] = useState<BankFormat | null>(null);
  const [formatIdx, setFormatIdx] = useState("0");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [imported, setImported] = useState(0);
  const [defaultMain, setDefaultMain] = useState("ค่าใช้จ่ายทั่วไป");
  const [defaultSub, setDefaultSub] = useState("ค่าอาหาร/เครื่องดื่ม");

  const reset = () => {
    setStep("upload");
    setFormat(null);
    setFormatIdx("0");
    setRows([]);
    setProgress(0);
    setImported(0);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length < 2) { toast.error("ไฟล์ CSV ไม่มีข้อมูล"); return; }

      const headers = parsed[0];
      const detected = detectBankFormat(headers);
      const fmt = detected || BANK_FORMATS[parseInt(formatIdx, 10)];
      setFormat(fmt);

      const dataRows = parsed.slice(1);
      const mapped: ImportRow[] = [];
      for (const row of dataRows) {
        const tx = mapRowToTransaction(row, fmt);
        if (!tx) continue;
        mapped.push({
          ...tx,
          selected: true,
          main_category: defaultMain,
          sub_category: defaultSub,
        });
      }
      setRows(mapped);
      setStep("review");
    };
    reader.readAsText(file, "UTF-8");
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!userId) return;
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) { toast.error("ไม่มีรายการที่เลือก"); return; }

    setStep("done");
    setProgress(0);
    let done = 0;

    // Group by month to get IDs efficiently
    const byMonth: Record<string, ImportRow[]> = {};
    for (const row of selected) {
      const m = row.date.slice(0, 7);
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(row);
    }

    for (const [monthYear, monthRows] of Object.entries(byMonth)) {
      for (const row of monthRows) {
        try {
          const txId = await getNextTxId(userId, monthYear);
          await createTransactionAtomic(userId, txId, {
            type: row.type,
            amount: row.amount,
            date: row.date,
            month_year: monthYear,
            main_category: row.main_category,
            sub_category: row.sub_category,
            note: row.description.slice(0, 200),
            created_at: Date.now(),
            is_imported: true,
          }, []);
          done++;
          setImported(done);
          setProgress(Math.round((done / selected.length) * 100));
        } catch (err) {
          console.error("Import error:", err);
        }
      }
    }

    queryClient.invalidateQueries({ queryKey: ["budget-data"] });
    toast.success(`นำเข้าสำเร็จ ${done} รายการ`);
  };

  const toggleAll = (checked: boolean) =>
    setRows((r) => r.map((row) => ({ ...row, selected: checked })));

  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onOpenChange(false); } }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" />
            นำเข้า CSV จากธนาคาร
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-1">

          {/* Step: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs">รูปแบบธนาคาร</Label>
                <Select value={formatIdx} onValueChange={setFormatIdx}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_FORMATS.map((f, i) => (
                      <SelectItem key={i} value={String(i)}>{f.name}</SelectItem>
                    ))}
                    <SelectItem value="auto">ตรวจจับอัตโนมัติ</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">คลิกเพื่อเลือกไฟล์ CSV</p>
                <p className="text-xs text-muted-foreground mt-1">รองรับไฟล์ .csv จาก KTB, SCB, KBANK, BBL</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            </div>
          )}

          {/* Step: Review */}
          {step === "review" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedCount === rows.length}
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                  <span className="text-sm">เลือกทั้งหมด</span>
                </div>
                <Badge variant="secondary">{selectedCount} / {rows.length} รายการ</Badge>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-y-auto max-h-64">
                  <table className="text-xs w-full">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="w-8 px-3 py-2"></th>
                        <th className="px-3 py-2 text-left">วันที่</th>
                        <th className="px-3 py-2 text-left">รายละเอียด</th>
                        <th className="px-3 py-2 text-right">จำนวน</th>
                        <th className="px-3 py-2 text-center">ประเภท</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={i} className={`border-t border-border ${row.selected ? "" : "opacity-40"}`}>
                          <td className="px-3 py-1.5">
                            <Checkbox checked={row.selected} onCheckedChange={(v) =>
                              setRows((r) => r.map((x, j) => j === i ? { ...x, selected: !!v } : x))
                            } />
                          </td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{row.date}</td>
                          <td className="px-3 py-1.5 max-w-[160px] truncate">{row.description}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                            {formatCurrency(row.amount)}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <Badge variant={row.type === "income" ? "secondary" : "outline"} className="text-[10px]">
                              {row.type === "income" ? "รายรับ" : "รายจ่าย"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">กลุ่มหมวดหมู่ (ค่าเริ่มต้น)</Label>
                  <input
                    className="mt-1 w-full text-xs border border-border rounded-md px-3 py-1.5 bg-background"
                    value={defaultMain}
                    onChange={(e) => setDefaultMain(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">หมวดหมู่ (ค่าเริ่มต้น)</Label>
                  <input
                    className="mt-1 w-full text-xs border border-border rounded-md px-3 py-1.5 bg-background"
                    value={defaultSub}
                    onChange={(e) => setDefaultSub(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">* สามารถแก้ไขหมวดหมู่ทีละรายการได้ในหน้าธุรกรรมภายหลัง</p>

              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={reset}>เริ่มใหม่</Button>
                <Button onClick={handleImport} disabled={selectedCount === 0}>
                  นำเข้า {selectedCount} รายการ
                </Button>
              </div>
            </div>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <div className="text-center space-y-4 py-4">
              {progress < 100 ? (
                <>
                  <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                  <p className="text-sm font-medium">กำลังนำเข้า... {imported} รายการ</p>
                  <Progress value={progress} className="h-2" />
                </>
              ) : (
                <>
                  <CheckCircle className="h-12 w-12 text-accent mx-auto" />
                  <p className="text-lg font-semibold">นำเข้าสำเร็จ!</p>
                  <p className="text-sm text-muted-foreground">นำเข้า {imported} รายการเรียบร้อยแล้ว</p>
                  <Button onClick={() => { reset(); onOpenChange(false); }}>ปิด</Button>
                </>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
