import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
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

const accountTypes: AccountType[] = ["cash", "bank", "investment", "credit_card", "loan", "receivable", "payable", "inventory"];

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(217 72% 50%)",
  "hsl(160 60% 45%)",
  "hsl(35 90% 55%)",
  "hsl(280 60% 55%)",
  "hsl(190 70% 50%)",
  "hsl(45 80% 50%)",
  "hsl(320 60% 50%)",
  "hsl(10 80% 55%)",
];

const liabilityTypes: string[] = ["credit_card", "loan", "payable"];

function AssetPieChart({ accounts, privacyMode, formatBalance, liabilityTypes }: {
  accounts: Account[];
  privacyMode: boolean;
  formatBalance: (b: number) => string;
  liabilityTypes: string[];
}) {
  const chartData = useMemo(() => {
    const byType: Record<string, number> = {};
    accounts.forEach((a) => {
      const label = accountTypeConfig[a.type]?.label || a.type;
      const value = liabilityTypes.includes(a.type) ? Math.abs(Number(a.balance) || 0) : (Number(a.balance) || 0);
      if (value > 0) {
        byType[label] = (byType[label] || 0) + value;
      }
    });
    return Object.entries(byType)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [accounts, liabilityTypes]);

  const total = chartData.reduce((s, d) => s + d.value, 0);

  if (chartData.length === 0) return null;

  return (
    <Card className="border-none shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm sm:text-base font-semibold">สัดส่วนตามประเภทบัญชี</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:w-1/2 h-52 sm:h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius="30%"
                  outerRadius="65%"
                  dataKey="value"
                  stroke="none"
                  label={({ name, percent, x, y, textAnchor }) =>
                    percent > 0.05 ? (
                      <text x={x} y={y} textAnchor={textAnchor} fontSize={10} fill="currentColor">
                        {name} {(percent * 100).toFixed(0)}%
                      </text>
                    ) : null
                  }
                  labelLine={false}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => (privacyMode ? "***" : `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`)}
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "12px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 w-full space-y-1.5 max-h-60 overflow-y-auto">
            {chartData.map((item, i) => {
              const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0";
              return (
                <div key={item.name} className="flex items-center gap-1.5 text-xs sm:text-sm">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-muted-foreground truncate min-w-0">{item.name}</span>
                  <span className="ml-auto font-medium font-display whitespace-nowrap text-xs sm:text-sm">{formatBalance(item.value)}</span>
                  <span className="text-[11px] sm:text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AccountsPage() {
  const { userId } = useAuth();
  const { privacyMode, togglePrivacy } = usePrivacy();
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

  // State เก็บความมั่งคั่งสุทธิที่แท้จริงจาก Transactions
  const [trueNetWorth, setTrueNetWorth] = useState<number>(0);

  const isMainAccount = (acc: Account) => acc.name === "กระเป๋าเงินสดหลัก";

  // ดึงข้อมูล Transactions เพื่อหา True Net Worth
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "transactions"), (snap) => {
      let income = 0;
      let expense = 0;
      snap.forEach(doc => {
        const t = doc.data();
        if (!t.is_deleted) {
          if (t.type === 'income') income += (Number(t.amount) || 0);
          if (t.type === 'expense') expense += (Number(t.amount) || 0);
        }
      });
      setTrueNetWorth(income - expense);
    });
    return () => unsub();
  }, [userId]);

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

  // คำนวณยอดกระเป๋าหลักอัตโนมัติเพื่อให้สมดุลกับ True Net Worth
  const displayAccounts = useMemo(() => {
    let otherAssetsTotal = 0;
    let liabilitiesTotal = 0;

    accounts.forEach(acc => {
      if (isMainAccount(acc)) return;
      
      const bal = Number(acc.balance) || 0;
      if (liabilityTypes.includes(acc.type)) {
        liabilitiesTotal += Math.abs(bal);
      } else {
        otherAssetsTotal += bal;
      }
    });

    const calculatedMainBalance = trueNetWorth - otherAssetsTotal + liabilitiesTotal;

    return accounts.map(acc => {
      if (isMainAccount(acc)) {
        return { ...acc, balance: calculatedMainBalance };
      }
      return acc;
    });
  }, [accounts, trueNetWorth]);

  // แยก Asset และ Liability เพื่อการแสดงผลที่ชัดเจน
  const { assetAccounts, liabilityAccounts } = useMemo(() => {
    const assets = displayAccounts.filter(a => !liabilityTypes.includes(a.type));
    const liabilities = displayAccounts.filter(a => liabilityTypes.includes(a.type));

    // เรียงให้กระเป๋าหลัก (Main Account) อยู่บนสุดเสมอ
    assets.sort((a, b) => {
      if (isMainAccount(a)) return -1;
      if (isMainAccount(b)) return 1;
      return 0;
    });

    return { assetAccounts: assets, liabilityAccounts: liabilities };
  }, [displayAccounts]);

  const totalAssets = assetAccounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
  const totalLiabilities = liabilityAccounts.reduce((sum, a) => sum + Math.abs(Number(a.balance) || 0), 0);
  const totalNetWorth = totalAssets - totalLiabilities;

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

  // Component สำหรับเรนเดอร์การ์ดกระเป๋าเงินเพื่อลดโค้ดซ้ำ
  const renderAccountCard = (acc: Account) => {
    const config = accountTypeConfig[acc.type];
    const IconComp = config?.icon || Wallet;
    const isNegativeType = liabilityTypes.includes(acc.type);
    
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
              isNegativeType || Number(acc.balance) < 0 ? "text-destructive" : "text-foreground"
            )}>
              {formatBalance(Number(acc.balance))}
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
              <div className="flex items-center gap-4 mt-3 text-sm">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-accent" />
                  <span className="text-muted-foreground">สินทรัพย์</span>
                  <span className="font-semibold text-accent">{formatBalance(totalAssets)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-destructive" />
                  <span className="text-muted-foreground">หนี้สิน</span>
                  <span className="font-semibold text-destructive">{formatBalance(totalLiabilities)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{displayAccounts.length} บัญชีที่ใช้งาน</p>
            </CardContent>
          </Card>

          {/* Asset Allocation Pie Chart */}
          <AssetPieChart accounts={displayAccounts} privacyMode={privacyMode} formatBalance={formatBalance} liabilityTypes={liabilityTypes} />

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

          {/* Accounts List (Assets vs Liabilities) */}
          {loading ? (
            <div className="text-center text-muted-foreground py-12">กำลังโหลด...</div>
          ) : displayAccounts.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">ยังไม่มีบัญชี กดปุ่มด้านบนเพื่อสร้าง</div>
          ) : (
            <div className="space-y-8">
              {/* Assets Section */}
              {assetAccounts.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-medium text-accent uppercase tracking-wider flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent" />
                    สินทรัพย์ (Assets)
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {assetAccounts.map(renderAccountCard)}
                  </div>
                </div>
              )}

              {/* Liabilities Section */}
              {liabilityAccounts.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-medium text-destructive uppercase tracking-wider flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-destructive" />
                    หนี้สิน (Liabilities)
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {liabilityAccounts.map(renderAccountCard)}
                  </div>
                </div>
              )}
            </div>
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
