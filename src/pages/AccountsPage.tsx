import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { createAccount, updateAccount, deleteAccountWithTransactions } from "@/lib/firestore-services";
import type { Account, AccountType } from "@/types/finance";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Wallet, Landmark, TrendingUp, CreditCard, Building2, Package, Plus, Eye, EyeOff, Trash2, Pencil, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const accountTypeConfig: Record<AccountType, { label: string; icon: React.ComponentType<{ className?: string }>; group: string }> = {
  cash: { label: "เงินสด", icon: Wallet, group: "Cash / Bank" },
  bank: { label: "ธนาคาร", icon: Landmark, group: "Cash / Bank" },
  investment: { label: "การลงทุน", icon: TrendingUp, group: "Investments" },
  credit_card: { label: "บัตรเครดิต", icon: CreditCard, group: "Credit / Loans" },
  loan: { label: "สินเชื่อ", icon: Building2, group: "Credit / Loans" },
  receivable: { label: "ลูกหนี้", icon: UserCheck, group: "Receivables" },
  payable: { label: "เจ้าหนี้", icon: UserX, group: "Payables" },
  inventory: { label: "สินค้าคงคลัง", icon: Package, group: "Inventory / Business" },
};

const accountTypes: AccountType[] = ["cash", "bank", "investment", "credit_card", "loan", "receivable", "inventory"];

export default function AccountsPage() {
  const { userId } = useAuth();
  const { privacyMode, togglePrivacy, maskValue } = usePrivacy();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<AccountType>("cash");
  const [newBalance, setNewBalance] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<Account | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<AccountType>("cash");
  const [editSaving, setEditSaving] = useState(false);

  const isMainAccount = (acc: Account) => acc.name === "กระเป๋าเงินสดหลัก";

  const handleDelete = async () => {
    if (!userId || !deleteTarget) return;
    setDeleting(true);
    try {
      const count = await deleteAccountWithTransactions(userId, deleteTarget.id);
      toast.success(`ลบบัญชี "${deleteTarget.name}" สำเร็จ พร้อมธุรกรรม ${count} รายการ`);
      setDeleteTarget(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (acc: Account) => {
    setEditTarget(acc);
    setEditName(acc.name);
    setEditType(acc.type);
  };

  const handleEdit = async () => {
    if (!userId || !editTarget || !editName.trim()) return;
    setEditSaving(true);
    try {
      await updateAccount(userId, editTarget.id, {
        name: editName.trim(),
        type: editType,
      });
      toast.success("แก้ไขบัญชีสำเร็จ");
      setEditTarget(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "accounts"), (snap) => {
      const accs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Account))
        .filter((a) => !a.is_deleted && a.is_active);
      setAccounts(accs);
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  const totalNetWorth = accounts.reduce((sum, a) => sum + a.balance, 0);

  const grouped = accounts.reduce<Record<string, Account[]>>((acc, account) => {
    const group = accountTypeConfig[account.type]?.group || "Other";
    if (!acc[group]) acc[group] = [];
    acc[group].push(account);
    return acc;
  }, {});

  const handleCreate = async () => {
    if (!userId || !newName.trim()) return;
    setSaving(true);
    try {
      await createAccount(userId, {
        name: newName.trim(),
        type: newType,
        balance: parseFloat(newBalance) || 0,
        currency: "THB",
        is_active: true,
        is_deleted: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      toast.success("สร้างบัญชีสำเร็จ");
      setDialogOpen(false);
      setNewName("");
      setNewType("cash");
      setNewBalance("");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const formatBalance = (balance: number) => {
    if (privacyMode) return "฿***";
    return `฿${balance.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;
  };

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center border-b border-border px-4 gap-3">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold text-foreground">บัญชี / กระเป๋าเงิน</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={togglePrivacy}>
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {/* Net Worth Card */}
          <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-1">Total Net Worth</p>
              <p className={cn(
                "text-3xl font-bold font-display",
                totalNetWorth >= 0 ? "text-accent" : "text-destructive"
              )}>
                {formatBalance(totalNetWorth)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{accounts.length} บัญชีที่ใช้งาน</p>
            </CardContent>
          </Card>

          {/* New Account Button */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" /> เพิ่มบัญชีใหม่
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>สร้างบัญชีใหม่</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>ชื่อบัญชี</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="เช่น กระเป๋าเงินสดหลัก" className="mt-1" />
                </div>
                <div>
                  <Label>ประเภท</Label>
                  <Select value={newType} onValueChange={(v) => setNewType(v as AccountType)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accountTypes.map((t) => (
                        <SelectItem key={t} value={t}>{accountTypeConfig[t].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>ยอดเงินเริ่มต้น (฿)</Label>
                  <Input type="number" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} placeholder="0.00" className="mt-1" />
                </div>
                <Button onClick={handleCreate} disabled={saving || !newName.trim()} className="w-full">
                  {saving ? "กำลังสร้าง..." : "สร้างบัญชี"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Grouped Account Cards */}
          {loading ? (
            <div className="text-center text-muted-foreground py-12">กำลังโหลด...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center text-muted-foreground py-12">ยังไม่มีบัญชี กดปุ่มด้านบนเพื่อสร้าง</div>
          ) : (
            Object.entries(grouped).map(([group, accs]) => (
              <div key={group} className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{group}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {accs.map((acc) => {
                    const config = accountTypeConfig[acc.type];
                    const IconComp = config?.icon || Wallet;
                    const isNegativeType = acc.type === "credit_card" || acc.type === "loan";
                    return (
                      <Card key={acc.id} className="hover:border-primary/30 transition-colors">
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                            isNegativeType ? "bg-destructive/10" : "bg-primary/10"
                          )}>
                            <IconComp className={cn("h-5 w-5", isNegativeType ? "text-destructive" : "text-primary")} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{acc.name}</p>
                            <p className="text-xs text-muted-foreground">{config?.label}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className={cn(
                              "text-sm font-semibold font-display tabular-nums",
                              isNegativeType || acc.balance < 0 ? "text-destructive" : "text-foreground"
                            )}>
                              {formatBalance(acc.balance)}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => openEdit(acc)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!isMainAccount(acc) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteTarget(acc)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {/* Delete Confirmation */}
          <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>ยืนยันการลบบัญชี</AlertDialogTitle>
                <AlertDialogDescription>
                  คุณต้องการลบบัญชี "<span className="font-semibold">{deleteTarget?.name}</span>" หรือไม่?
                  <br />
                  <span className="text-destructive font-medium">
                    ⚠️ รายการธุรกรรมทั้งหมดที่เชื่อมกับบัญชีนี้จะถูกลบถาวรด้วย
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "กำลังลบ..." : "ลบบัญชี"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Edit Account Dialog */}
          <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>แก้ไขบัญชี</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>ชื่อบัญชี</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>ประเภท</Label>
                  <Select value={editType} onValueChange={(v) => setEditType(v as AccountType)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {accountTypes.map((t) => (
                        <SelectItem key={t} value={t}>{accountTypeConfig[t].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleEdit} disabled={editSaving || !editName.trim()} className="w-full">
                  {editSaving ? "กำลังบันทึก..." : "บันทึก"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </>
  );
}
