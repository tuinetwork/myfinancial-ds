import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { updateAccount } from "@/lib/firestore-services";
import type { AssetClass } from "@/types/finance";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AppFooter } from "@/components/AppFooter";
import { TrendingUp, TrendingDown, Eye, EyeOff, Percent, Banknote, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const assetClasses: { value: AssetClass | string; label: string }[] = [
  { value: "stock", label: "หุ้น" },
  { value: "mutual_fund", label: "กองทุน" },
  { value: "crypto", label: "คริปโต" },
  { value: "bond", label: "พันธบัตร" },
  { value: "loan", label: "สินเชื่อ/ปล่อยกู้" },
  { value: "business", label: "ธุรกิจ" },
  { value: "inventory", label: "สินค้าคงคลัง" },
  { value: "share", label: "ออมแชร์" },
];

export default function InvestmentsPage() {
  const { userId } = useAuth();
  const { privacyMode, togglePrivacy } = usePrivacy();
  
  const [investmentAccounts, setInvestmentAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [editDialog, setEditDialog] = useState<{ open: boolean; acc: any | null }>({ open: false, acc: null });
  const [editForm, setEditForm] = useState({ 
    symbol: "", 
    asset_class: "stock", 
    total_units: "1", 
    avg_cost: "0", 
    market_price: "0",
    manual_yield: "0" 
  });
  const [saving, setSaving] = useState(false);

  // 1. ดึงข้อมูลกระเป๋าเงินประเภทการลงทุน
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "accounts"), (snap) => {
      const accs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a: any) => !a.is_deleted && a.is_active && a.type === 'investment');
      setInvestmentAccounts(accs);
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  // 2. ดึงข้อมูล Transactions เพื่อใช้คำนวณ Auto-Cost และ Yield
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "transactions"), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [userId]);

  const fmt = (n: number) => privacyMode ? "***" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 3. Logic คำนวณอัตโนมัติ
  const { totalMarketValue, totalCostBasis, totalYield, netPnL, pnlPct } = useMemo(() => {
    let mv = 0;
    let cost = 0;
    let yieldSum = 0;

    investmentAccounts.forEach(acc => {
      const units = acc.total_units || 1;
      
      // มูลค่าตลาด = ดึงจากยอดเงินในกระเป๋าล่าสุด
      const currentMarketValue = Number(acc.balance) || 0;
      mv += currentMarketValue;

      // ต้นทุนสะสม = รวมยอดเงินที่โอน (Transfer) เข้ากระเป๋านี้ทั้งหมด
      const transferInSum = transactions.filter(t => 
        t.type === 'transfer' && t.to_account_id === acc.id && !t.is_deleted
      ).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const currentAccCost = ((acc.average_cost || 0) * units) + transferInSum;
      cost += currentAccCost;

      // ดอกเบี้ยสะสม = ค้นหาจากประวัติรายรับอัตโนมัติ + ยอดที่เจ้านายบันทึกเอง (Manual Yield)
      const searchKey = (acc.symbol || acc.name).toLowerCase();
      const autoYield = transactions.filter(t => {
        if (t.type !== 'income' || t.is_deleted) return false;
        const text = `${t.category || ''} ${t.note || ''}`.toLowerCase();
        return ['ดอกเบี้ย', 'ปันผล', 'กำไร'].some(k => text.includes(k)) && text.includes(searchKey);
      }).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      
      yieldSum += (autoYield + (Number(acc.manual_yield) || 0));
    });

    const net = (mv - cost) + yieldSum;
    const pct = cost > 0 ? (net / cost) * 100 : 0;

    return { totalMarketValue: mv, totalCostBasis: cost, totalYield: yieldSum, netPnL: net, pnlPct: pct };
  }, [investmentAccounts, transactions]);

  const handleOpenEdit = (acc: any) => {
    setEditForm({
      symbol: acc.symbol || acc.name,
      asset_class: acc.asset_class || "share",
      total_units: String(acc.total_units || 1),
      avg_cost: String(acc.average_cost || 0),
      market_price: String(acc.market_price || acc.balance || 0),
      manual_yield: String(acc.manual_yield || 0),
    });
    setEditDialog({ open: true, acc });
  };

  const handleSaveEdit = async () => {
    if (!userId || !editDialog.acc) return;
    setSaving(true);
    try {
      await updateAccount(userId, editDialog.acc.id, {
        symbol: editForm.symbol.trim().toUpperCase(),
        asset_class: editForm.asset_class,
        total_units: parseFloat(editForm.total_units) || 1,
        average_cost: parseFloat(editForm.avg_cost) || 0,
        manual_yield: parseFloat(editForm.manual_yield) || 0,
      } as any);
      toast.success("อัปเดตข้อมูลสำเร็จ");
      setEditDialog({ open: false, acc: null });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center border-b border-border px-4 gap-3 bg-background sticky top-0 z-10">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold">พอร์ตการลงทุน (Full Auto)</h1>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={togglePrivacy}>
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {/* Summary Section */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-muted/30 border-border">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Market Value (รวม)</p>
                <p className="text-xl font-bold font-display mt-1">฿{fmt(totalMarketValue)}</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-border">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground">Total Cost (ทุนโอน)</p>
                <p className="text-xl font-bold font-display mt-1">฿{fmt(totalCostBasis)}</p>
              </CardContent>
            </Card>
            <Card className="bg-muted/30 border-border text-green-500">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3"/> Yield (กำไร)</p>
                <p className="text-xl font-bold font-display mt-1">+{fmt(totalYield)}</p>
              </CardContent>
            </Card>
            <Card className={cn("border-none", netPnL >= 0 ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive")}>
              <CardContent className="p-5">
                <p className="text-xs opacity-70 flex items-center gap-1"><Percent className="h-3 w-3"/> Total ROI</p>
                <p className="text-xl font-bold font-display mt-1">{privacyMode ? "***" : `${pnlPct.toFixed(2)}%`}</p>
              </CardContent>
            </Card>
          </div>

          {/* Asset Table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>สินทรัพย์</TableHead>
                    <TableHead className="text-right">มือ (Units)</TableHead>
                    <TableHead className="text-right">ทุนโอนสะสม</TableHead>
                    <TableHead className="text-right">มูลค่าปัจจุบัน</TableHead>
                    <TableHead className="text-right text-green-500">Yield</TableHead>
                    <TableHead className="text-right font-bold">Net PnL</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investmentAccounts.map((acc) => {
                    const units = acc.total_units || 1;
                    const transferIn = transactions.filter(t => t.type === 'transfer' && t.to_account_id === acc.id && !t.is_deleted).reduce((s, t) => s + (Number(t.amount) || 0), 0);
                    const costBasis = ((acc.average_cost || 0) * units) + transferIn;
                    const mv = Number(acc.balance) || 0;
                    const invYield = (Number(acc.manual_yield) || 0); // หรือดึง autoYield มาเพิ่มตาม Logic ด้านบน
                    const rowNet = (mv - costBasis) + invYield;
                    
                    return (
                      <TableRow key={acc.id}>
                        <TableCell className="font-medium">
                          {acc.symbol || acc.name}
                          <div className="block"><Badge variant="outline" className="text-[9px] h-4 mt-1">{assetClasses.find(a => a.value === acc.asset_class)?.label || "ทั่วไป"}</Badge></div>
                        </TableCell>
                        <TableCell className="text-right">{privacyMode ? "***" : units}</TableCell>
                        <TableCell className="text-right text-muted-foreground">฿{fmt(costBasis)}</TableCell>
                        <TableCell className="text-right font-semibold">฿{fmt(mv)}</TableCell>
                        <TableCell className="text-right text-green-500">+{fmt(invYield)}</TableCell>
                        <TableCell className={cn("text-right font-bold", rowNet >= 0 ? "text-accent" : "text-destructive")}>
                          {rowNet >= 0 ? "+" : ""}฿{fmt(rowNet)}
                        </TableCell>
                        <TableCell><Button variant="ghost" size="icon" onClick={() => handleOpenEdit(acc)}><Pencil className="h-3 w-3" /></Button></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </main>

        <Dialog open={editDialog.open} onOpenChange={(o) => setEditDialog({ open: o, acc: o ? editDialog.acc : null })}>
          <DialogContent className="bg-card">
            <DialogHeader><DialogTitle>ตั้งค่า: {editDialog.acc?.name}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-2">
              <div><Label>Symbol</Label><Input value={editForm.symbol} onChange={(e) => setEditForm({...editForm, symbol: e.target.value})} /></div>
              <div><Label> Asset Class</Label>
                <Select value={editForm.asset_class} onValueChange={(v) => setEditForm({...editForm, asset_class: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{assetClasses.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>จำนวนมือ (Units)</Label><Input type="number" value={editForm.total_units} onChange={(e) => setEditForm({...editForm, total_units: e.target.value})} /></div>
                <div><Label>ดอกเบี้ย/กำไร (Manual Yield)</Label><Input type="number" value={editForm.manual_yield} onChange={(e) => setEditForm({...editForm, manual_yield: e.target.value})} className="border-green-500/30" /></div>
              </div>
              <Button onClick={handleSaveEdit} disabled={saving} className="w-full">{saving ? "กำลังบันทึก..." : "บันทึก"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <AppFooter />
      </div>
    </>
  );
}
