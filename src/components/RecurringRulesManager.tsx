import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getAccounts } from "@/lib/firestore-services";
import { getRecurringRules, createRecurringRule, updateRecurringRule, deleteRecurringRule, RecurringRule } from "@/lib/recurring-service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Repeat, Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Account } from "@/types/finance";
import { collection, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";

interface CategoryData {
  label: string;
  main_categories: Record<string, string[]>;
}

const defaultForm = {
  label: "",
  amount: "",
  type: "expense" as "expense" | "income",
  main_category: "",
  sub_category: "",
  day_of_month: "1",
  from_account_id: "",
  to_account_id: "",
  note: "",
  is_active: true,
};

export function RecurringRulesManager() {
  const { userId } = useAuth();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Record<string, CategoryData>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RecurringRule | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecurringRule | null>(null);

  const loadData = async () => {
    if (!userId) return;
    const [r, a] = await Promise.all([getRecurringRules(userId), getAccounts(userId)]);
    const catSnap = await getDocs(collection(firestore, "users", userId, "categories"));
    const cats: Record<string, CategoryData> = {};
    catSnap.forEach((d) => { cats[d.id] = d.data() as CategoryData; });
    setRules(r.sort((a, b) => a.day_of_month - b.day_of_month));
    setAccounts(a);
    setCategories(cats);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [userId]);

  const currentCat = categories[form.type];
  const mainCats = currentCat?.main_categories ? Object.keys(currentCat.main_categories) : [];
  const subCats = form.main_category && currentCat?.main_categories?.[form.main_category]
    ? currentCat.main_categories[form.main_category] : [];

  const openCreate = () => {
    setEditTarget(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (rule: RecurringRule) => {
    setEditTarget(rule);
    setForm({
      label: rule.label,
      amount: String(rule.amount),
      type: rule.type,
      main_category: rule.main_category,
      sub_category: rule.sub_category,
      day_of_month: String(rule.day_of_month),
      from_account_id: rule.from_account_id || "",
      to_account_id: rule.to_account_id || "",
      note: rule.note || "",
      is_active: rule.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!userId) return;
    const amount = parseFloat(form.amount);
    if (!form.label.trim()) { toast.error("กรุณากรอกชื่อรายการ"); return; }
    if (isNaN(amount) || amount <= 0) { toast.error("กรุณากรอกจำนวนเงินที่ถูกต้อง"); return; }
    if (!form.main_category || !form.sub_category) { toast.error("กรุณาเลือกหมวดหมู่"); return; }
    const day = parseInt(form.day_of_month, 10);
    if (isNaN(day) || day < 1 || day > 28) { toast.error("วันที่ต้องอยู่ระหว่าง 1-28"); return; }

    setSaving(true);
    try {
      const data = {
        label: form.label.trim(),
        amount,
        type: form.type,
        main_category: form.main_category,
        sub_category: form.sub_category,
        day_of_month: day,
        is_active: form.is_active,
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
        ...(form.type === "expense" && form.from_account_id ? { from_account_id: form.from_account_id } : {}),
        ...(form.type === "income" && form.to_account_id ? { to_account_id: form.to_account_id } : {}),
      };

      if (editTarget) {
        await updateRecurringRule(userId, editTarget.id, data);
        toast.success("อัปเดตรายการซ้ำสำเร็จ");
      } else {
        await createRecurringRule(userId, data);
        toast.success("สร้างรายการซ้ำสำเร็จ");
      }
      setDialogOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error("เกิดข้อผิดพลาด: " + err.message);
    }
    setSaving(false);
  };

  const handleToggleActive = async (rule: RecurringRule) => {
    if (!userId) return;
    await updateRecurringRule(userId, rule.id, { is_active: !rule.is_active });
    await loadData();
  };

  const handleDelete = async () => {
    if (!userId || !deleteTarget) return;
    await deleteRecurringRule(userId, deleteTarget.id);
    toast.success("ลบรายการซ้ำสำเร็จ");
    setDeleteTarget(null);
    await loadData();
  };

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            รายการซ้ำรายเดือน
          </CardTitle>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />เพิ่ม
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีรายการซ้ำ</p>
        ) : (
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className={`flex items-center gap-3 p-3 rounded-xl border ${rule.is_active ? "border-border" : "border-dashed border-muted-foreground/30 opacity-60"}`}>
                <Switch checked={rule.is_active} onCheckedChange={() => handleToggleActive(rule)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{rule.label}</span>
                    <Badge variant={rule.type === "income" ? "secondary" : "outline"} className="text-[10px] h-4 px-1 shrink-0">
                      {rule.type === "income" ? "รายรับ" : "รายจ่าย"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ทุกวันที่ {rule.day_of_month} · {rule.sub_category} · ฿{rule.amount.toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(rule)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(rule)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground mt-4">รายการซ้ำจะถูกเพิ่มอัตโนมัติเมื่อเปิดแอปในเดือนใหม่</p>
      </CardContent>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "แก้ไขรายการซ้ำ" : "เพิ่มรายการซ้ำ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">ชื่อรายการ</Label>
                <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="เช่น ค่าไฟ" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">จำนวนเงิน (฿)</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">ประเภท</Label>
                <Select value={form.type} onValueChange={(v: "expense" | "income") => setForm((f) => ({ ...f, type: v, main_category: "", sub_category: "" }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="expense">รายจ่าย</SelectItem>
                    <SelectItem value="income">รายรับ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">วันที่ของเดือน (1-28)</Label>
                <Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm((f) => ({ ...f, day_of_month: e.target.value }))} className="mt-1" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">กลุ่มหมวดหมู่</Label>
                <Select value={form.main_category} onValueChange={(v) => setForm((f) => ({ ...f, main_category: v, sub_category: "" }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="เลือก" /></SelectTrigger>
                  <SelectContent>{mainCats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">หมวดหมู่</Label>
                <Select value={form.sub_category} onValueChange={(v) => setForm((f) => ({ ...f, sub_category: v }))} disabled={!form.main_category}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="เลือก" /></SelectTrigger>
                  <SelectContent>{subCats.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {accounts.length > 0 && (
              <div>
                <Label className="text-xs">บัญชี (ไม่บังคับ)</Label>
                <Select
                  value={form.type === "expense" ? form.from_account_id : form.to_account_id}
                  onValueChange={(v) => setForm((f) => form.type === "expense" ? { ...f, from_account_id: v } : { ...f, to_account_id: v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue placeholder="อัตโนมัติ" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">บันทึก (ไม่บังคับ)</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="บันทึกเพิ่มเติม" className="mt-1" />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <Label className="text-xs">เปิดใช้งาน</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>ยกเลิก</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editTarget ? "บันทึก" : "สร้าง"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบรายการซ้ำ</AlertDialogTitle>
            <AlertDialogDescription>ต้องการลบ "{deleteTarget?.label}" หรือไม่?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">ลบ</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
