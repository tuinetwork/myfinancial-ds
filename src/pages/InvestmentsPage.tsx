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

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "transactions"), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [userId]);

  const fmt = (n: number) => privacyMode ? "***" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 3. Hybrid Logic: Auto สำหรับ Share, Manual สำหรับอย่างอื่น
  const { totalMarketValue, totalCostBasis, totalYield, netPnL, pnlPct } = useMemo(() => {
    let mv = 0;
    let cost = 0;
    let yieldSum = 0;

    investmentAccounts.forEach(acc => {
      const units = acc.total_units || 1;
      const isShare = acc.asset_class === 'share';

      // --- Calculation for Market Value ---
      const accMV = isShare ? (Number(acc.balance) || 0) : (units * (acc.market_price || 0));
      mv += accMV;

      // --- Calculation for Cost ---
      const transferInSum = transactions.filter(t => 
        t.type === 'transfer' && t.to_account_id === acc.id && !t.is_deleted
      ).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const accCost = isShare 
        ? (((acc.average_cost || 0) * units) + transferInSum)
        : (units * (acc.average_cost || 0));
      cost += accCost;

      // --- Yield Calculation ---
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
      asset_class: acc.asset_class || "stock",
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
      const isShare = editForm.asset_class === 'share';
      const updateData: any = {
        symbol: editForm.symbol.trim().toUpperCase(),
        asset_class: editForm.asset_class,
        total_units: parseFloat(editForm.total_units) || 1,
        average_cost: parseFloat(editForm.avg_cost) || 0,
        manual_yield: parseFloat(editForm.manual_yield) || 0,
      };

      // ถ้าไม่ใช่แชร์ ให้บันทึกราคาตลาดและอัปเดต Balance ตามสูตร units * price
      if (!isShare) {
        updateData.market_price = parseFloat(editForm.market_price) || 0;
        updateData.balance = updateData.total_units * updateData.market_price;
      }

      await updateAccount(userId, editDialog.acc.id, updateData);
      toast.success("บันทึกข้อมูลสำเร็จ");
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
      <div className="flex-1 flex flex-col min-h-screen bg-muted/5">
        <header className="h-14 flex items-center border-b border-border px-4 gap-3 bg-background sticky top-0 z-20">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold">พอร์ตการลงทุน</h1>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={togglePrivacy}>
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Market Value</p>
                <p className="text-xl sm:text-2xl font-bold font-display mt-1">฿{fmt(totalMarketValue)}</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-semibold">Total Cost</p>
                <p className="text-xl sm:text-2xl font-bold font-display mt-1">฿{fmt(totalCostBasis)}</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm text-green-500">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground uppercase font-semibold flex items-center gap-1"><Banknote className="h-3 w-3"/> Yield</p>
                <p className="text-xl sm:text-2xl font-bold font-display mt-1">+{fmt(totalYield)}</p>
              </CardContent>
            </Card>
            <Card className={cn("border-none shadow-sm", netPnL >= 0 ? "bg-accent/10 text-accent" : "bg-destructive/10 text-destructive")}>
              <CardContent className="p-5">
                <p className="text-xs uppercase font-semibold flex items-center gap-1 opacity-80"><Percent className="h-3 w-3"/> Total ROI</p>
                <p className="text-xl sm:text-2xl font-bold font-display mt-1">{privacyMode ? "***" : `${pnlPct.toFixed(2)}%`}</p>
              </CardContent>
            </Card>
          </div>

          {/* Investment Table */}
          <Card className="overflow-hidden border-border/50 shadow-md">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-[180px]">บัญชี / Symbol</TableHead>
                    <TableHead className="text-right">หน่วย/มือ</TableHead>
                    <TableHead className="text-right">ทุน (Cost)</TableHead>
                    <TableHead className="text-right">ราคาตลาด (Mkt)</TableHead>
                    <TableHead className="text-right">มูลค่ารวม</TableHead>
                    <TableHead className="text-right text-green-500 font-bold">Yield</TableHead>
                    <TableHead className="text-right font-bold">Net PnL</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investmentAccounts.map((acc) => {
                    const units = acc.total_units || 1;
                    const isShare = acc.asset_class === 'share';
                    
                    // Logic คำนวณรายบรรทัด
                    const transferIn = transactions.filter(t => t.type === 'transfer' && t.to_account_id === acc.id && !t.is_deleted).reduce((s, t) => s + (Number(t.amount) || 0), 0);
                    const costBasis = isShare ? (((acc.average_cost || 0) * units) + transferIn) : (units * (acc.average_cost || 0));
                    const mv = isShare ? (Number(acc.balance) || 0) : (units * (acc.market_price || 0));
                    const currentPrice = isShare ? (mv / units) : (acc.market_price || 0);
                    
                    const invYield = Number(acc.manual_yield) || 0;
                    const rowNet = (mv - costBasis) + invYield;
                    
                    return (
                      <TableRow key={acc.id} className="hover:bg-muted/20">
                        <TableCell className="font-medium py-4">
                          <span className="block text-sm">{acc.symbol || acc.name}</span>
                          <Badge variant="secondary" className="text-[9px] h-4 mt-1 font-normal uppercase">
                            {assetClasses.find(a => a.value === acc.asset_class)?.label || "ทั่วไป"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{privacyMode ? "***" : units}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">฿{fmt(costBasis)}</TableCell>
                        <TableCell className="text-right tabular-nums">฿{fmt(currentPrice)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">฿{fmt(mv)}</TableCell>
                        <TableCell className="text-right text-green-500 tabular-nums">+{fmt(invYield)}</TableCell>
                        <TableCell className={cn("text-right font-bold tabular-nums", rowNet >= 0 ? "text-accent" : "text-destructive")}>
                          {rowNet >= 0 ? "+" : ""}฿{fmt(rowNet)}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(acc)} className="h-8 w-8">
                            <Pencil className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </main>

        {/* Edit Dialog */}
        <Dialog open={editDialog.open} onOpenChange={(o) => setEditDialog({ open: o, acc: o ? editDialog.acc : null })}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5 text-primary"/> ตั้งค่าข้อมูลพอร์ต</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Symbol</Label><Input value={editForm.symbol} onChange={(e) => setEditForm({...editForm, symbol: e.target.value})} placeholder="เช่น SHR-1" /></div>
                <div className="space-y-2">
                  <Label>ประเภท</Label>
                  <Select value={editForm.asset_class} onValueChange={(v) => setEditForm({...editForm, asset_class: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{assetClasses.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>จำนวนมือ / หน่วย</Label><Input type="number" value={editForm.total_units} onChange={(e) => setEditForm({...editForm, total_units: e.target.value})} /></div>
                <div className="space-y-2"><Label>ต้นทุนเริ่ม (Avg Cost)</Label><Input type="number" value={editForm.avg_cost} onChange={(e) => setEditForm({...editForm, avg_cost: e.target.value})} /></div>
              </div>

              {editForm.asset_class !== 'share' && (
                <div className="space-y-2"><Label>ราคาตลาดปัจจุบัน</Label><Input type="number" value={editForm.market_price} onChange={(e) => setEditForm({...editForm, market_price: e.target.value})} className="border-primary/30" /></div>
              )}

              <div className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                <Label className="text-green-600 flex items-center gap-1.5 font-semibold"><Banknote className="h-4 w-4"/> ดอกเบี้ย / กำไรที่ได้รับ (Yield)</Label>
                <Input type="number" value={editForm.manual_yield} onChange={(e) => setEditForm({...editForm, manual_yield: e.target.value})} className="mt-2 bg-background border-green-500/30" />
                <p className="text-[10px] text-muted-foreground mt-2">* ใช้สำหรับบันทึกกำไรที่ได้จากวงแชร์หรือปันผล</p>
              </div>

              <Button onClick={handleSaveEdit} disabled={saving} className="w-full h-11 shadow-lg">{saving ? "กำลังประมวลผล..." : "บันทึกข้อมูล"}</Button>
            </div>
          </DialogContent>
        </Dialog>
        <AppFooter />
      </div>
    </>
  );
}
