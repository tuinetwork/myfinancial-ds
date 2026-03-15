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
import { TrendingUp, TrendingDown, Eye, EyeOff, Percent, Banknote, Pencil, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppFooter } from "@/components/AppFooter";

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

  // 1. ดึงข้อมูลกระเป๋าเงิน (Investment Only)
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

  // 2. ดึงข้อมูล Transactions เพื่อคำนวณต้นทุนจากเงินโอน และ Yield
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "transactions"), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [userId]);

  const fmt = (n: number) => privacyMode ? "***" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 3. คำนวณภาพรวมพอร์ต (Full Auto Logic)
  const { totalMarketValue, totalCostBasis, unrealizedPnL, totalYield, netPnL, pnlPct } = useMemo(() => {
    let mv = 0;
    let cost = 0;
    let yieldSum = 0;

    const yieldKeywords = ['ดอกเบี้ย', 'ปันผล', 'กำไร', 'interest', 'dividend'];

    investmentAccounts.forEach(acc => {
      const units = acc.total_units || 1;
      
      // AUTO MARKET VALUE: วิ่งตาม Balance จริงในหน้า Accounts
      const currentMarketValue = Number(acc.balance) || 0;
      mv += currentMarketValue;

      // AUTO COST BASIS: รวมยอดเงินโอนเข้าทั้งหมดจากประวัติธุรกรรม
      const transferInSum = transactions.filter(t => 
        t.type === 'transfer' && 
        t.to_account_id === acc.id && 
        !t.is_deleted
      ).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      // ต้นทุนสะสม = (ต้นทุนเฉลี่ยที่ตั้งไว้ * หน่วย) + ยอดเงินโอนสะสม
      const currentAccCost = ((acc.average_cost || 0) * units) + transferInSum;
      cost += currentAccCost;

      // AUTO YIELD: หาจาก Transactions รายรับ (Income) ที่มี Keyword เกี่ยวกับกำไร
      const searchKey = (acc.symbol || acc.name).toLowerCase();
      const autoYield = transactions.filter(t => {
        if (t.type !== 'income' || t.is_deleted) return false;
        const text = `${t.category || ''} ${t.note || ''}`.toLowerCase();
        return yieldKeywords.some(k => text.includes(k)) && text.includes(searchKey);
      }).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      
      // รวมกับค่าที่เจ้านายกรอกเอง (Manual Yield)
      const manualYield = Number(acc.manual_yield) || 0;
      yieldSum += (autoYield + manualYield);
    });

    const unReal = mv - cost;
    const net = unReal + yieldSum;
    const pct = cost > 0 ? (net / cost) * 100 : 0;

    return { totalMarketValue: mv, totalCostBasis: cost, unrealizedPnL: unReal, totalYield: yieldSum, netPnL: net, pnlPct: pct };
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
      const units = parseFloat(editForm.total_units) || 1;
      const mktPrice = parseFloat(editForm.market_price) || 0;
      
      await updateAccount(userId, editDialog.acc.id, {
        symbol: editForm.symbol.trim().toUpperCase(),
        asset_class: editForm.asset_class,
        total_units: units,
        average_cost: parseFloat(editForm.avg_cost) || 0,
        market_price: mktPrice,
        manual_yield: parseFloat(editForm.manual_yield) || 0,
        // หมายเหตุ: เราไม่อัปเดต balance ที่นี่ เพื่อให้หน้า Accounts เป็นคนคุมยอดโอนจริง
      } as any);

      toast.success("อัปเดตข้อมูลการลงทุนสำเร็จ");
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
        <header className="h-14 flex items-center border-b border-border px-4 gap-3 bg-background/95 backdrop-blur sticky top-0 z-10">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold text-foreground">พอร์ตการลงทุน (Auto-Sync)</h1>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={togglePrivacy}>
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-investment/10 to-investment/5 border-investment/20 shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground">Market Value (ยอดรวมกระเป๋า)</p>
                <p className="text-lg sm:text-2xl font-bold font-display text-foreground mt-1">฿{fmt(totalMarketValue)}</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground">Total Cost (ยอดโอนสะสม)</p>
                <p className="text-lg sm:text-2xl font-bold font-display text-foreground mt-1">฿{fmt(totalCostBasis)}</p>
              </CardContent>
            </Card>
            <Card className="border-border shadow-sm">
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5"/> Yield (ดอกเบี้ย/กำไร)</p>
                <p className="text-lg sm:text-2xl font-bold font-display text-green-500 mt-1">+{fmt(totalYield)}</p>
              </CardContent>
            </Card>
            <Card className={cn("border-transparent shadow-sm", netPnL >= 0 ? "bg-accent/10 border-accent/20" : "bg-destructive/10 border-destructive/20")}>
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5"><Percent className="h-3.5 w-3.5"/> Total ROI</p>
                <div className="flex items-center gap-2 mt-1">
                  {netPnL >= 0 ? <TrendingUp className="h-4 w-4 text-accent" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                  <p className={cn("text-lg sm:text-2xl font-bold font-display", netPnL >= 0 ? "text-accent" : "text-destructive")}>
                    {privacyMode ? "***" : `${netPnL >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Edit Details Dialog */}
          <Dialog open={editDialog.open} onOpenChange={(o) => setEditDialog({ open: o, acc: o ? editDialog.acc : null })}>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>ตั้งค่าการลงทุน: {editDialog.acc?.name}</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div><Label>Symbol / รหัสอ้างอิง</Label><Input value={editForm.symbol} onChange={(e) => setEditForm({ ...editForm, symbol: e.target.value })} placeholder="เช่น SHR-100K" className="mt-1" /></div>
                <div><Label>ประเภทสินทรัพย์</Label>
                  <Select value={editForm.asset_class} onValueChange={(v) => setEditForm({ ...editForm, asset_class: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{assetClasses.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>จำนวนหน่วย (มือ)</Label><Input type="number" value={editForm.total_units} onChange={(e) => setEditForm({ ...editForm, total_units: e.target.value })} className="mt-1" /></div>
                  <div><Label>ราคาตลาด (บันทึกเอง)</Label><Input type="number" value={editForm.market_price} onChange={(e) => setEditForm({ ...editForm, market_price: e.target.value })} className="mt-1" /></div>
                </div>
                
                <div className="pt-2 border-t border-border">
                  <Label className="text-green-500 font-semibold flex items-center gap-1.5"><Banknote className="h-4 w-4" /> ดอกเบี้ย/กำไรสะสม (บันทึกเอง)</Label>
                  <Input type="number" value={editForm.manual_yield} onChange={(e) => setEditForm({ ...editForm, manual_yield: e.target.value })} className="mt-1 border-green-500/30" />
                  <p className="text-[10px] text-muted-foreground mt-1">*ค่านี้จะนำไปรวมกับดอกเบี้ยที่ระบบตรวจเจอจาก Transactions</p>
                </div>

                <Button onClick={handleSaveEdit} disabled={saving} className="w-full">{saving ? "กำลังบันทึก..." : "บันทึกและซิงค์ข้อมูล"}</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Asset Table */}
          {loading ? (
            <div className="text-center text-muted-foreground py-12">กำลังเชื่อมต่อฐานข้อมูล...</div>
          ) : investmentAccounts.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-2xl">
              <Wallet className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">ไม่พบกระเป๋าประเภทการลงทุน</p>
            </div>
          ) : (
            <Card className="overflow-hidden border-border/50">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[200px]">สินทรัพย์</TableHead>
                      <TableHead className="text-right">หน่วย</TableHead>
                      <TableHead className="text-right">ทุนสะสม (โอน)</TableHead>
                      <TableHead className="text-right">มูลค่า (Balance)</TableHead>
                      <TableHead className="text-right text-green-500">Yield (กำไร)</TableHead>
                      <TableHead className="text-right font-bold">Net PnL</TableHead>
                      <TableHead className="w-[100px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {investmentAccounts.map((acc) => {
                      const units = acc.total_units || 1;
                      const mv = Number(acc.balance) || 0;
                      
                      // คำนวณต้นทุนจากยอดโอนเข้า
                      const transferInSum = transactions.filter(t => 
                        t.type === 'transfer' && t.to_account_id === acc.id && !t.is_deleted
                      ).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
                      const costBasis = ((acc.average_cost || 0) * units) + transferInSum;

                      // คำนวณ Yield
                      const autoYield = transactions.filter(t => {
                        if (t.type !== 'income' || t.is_deleted) return false;
                        const text = `${t.category || ''} ${t.note || ''}`.toLowerCase();
                        return ['ดอกเบี้ย', 'ปันผล', 'กำไร'].some(k => text.includes(k)) && text.includes((acc.symbol || acc.name).toLowerCase());
                      }).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
                      const invYield = autoYield + (Number(acc.manual_yield) || 0);

                      const rowNet = (mv - costBasis) + invYield;
                      
                      return (
                        <TableRow key={acc.id} className="hover:bg-muted/30">
                          <TableCell className="font-medium">
                            <div className="flex flex-col">
                              <span>{acc.symbol || acc.name}</span>
                              <Badge variant="outline" className="w-fit text-[9px] h-4 px-1 mt-1 font-normal">
                                {assetClasses.find(a => a.value === acc.asset_class)?.label || "ทั่วไป"}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{privacyMode ? "***" : units}</TableCell>
                          <TableCell className="text-right tabular-nums">฿{fmt(costBasis)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">฿{fmt(mv)}</TableCell>
                          <TableCell className="text-right tabular-nums text-green-500">+{fmt(invYield)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums font-bold", rowNet >= 0 ? "text-accent" : "text-destructive")}>
                            {rowNet >= 0 ? "+" : ""}฿{fmt(rowNet)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(acc)} className="h-8 w-8">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </main>
        <AppFooter />
      </div>
    </>
  );
}
