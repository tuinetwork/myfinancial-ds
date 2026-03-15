import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { createAccount, updateAccount } from "@/lib/firestore-services";
import type { Account, AssetClass } from "@/types/finance";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, TrendingUp, TrendingDown, Eye, EyeOff, Percent, Banknote, Pencil } from "lucide-react";
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
];

export default function InvestmentsPage() {
  const { userId } = useAuth();
  const { privacyMode, togglePrivacy } = usePrivacy();
  
  // เปลี่ยนมาใช้ State ของ Accounts แทน Investments แยก
  const [investmentAccounts, setInvestmentAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // State สำหรับแก้ไขรายละเอียดการลงทุนของกระเป๋านั้นๆ
  const [editDialog, setEditDialog] = useState<{ open: boolean; acc: any | null }>({ open: false, acc: null });
  const [editForm, setEditForm] = useState({ symbol: "", asset_class: "stock", total_units: "1", avg_cost: "0", market_price: "0" });
  const [saving, setSaving] = useState(false);

  // 1. ดึงข้อมูลกระเป๋าเงินเฉพาะที่ type === 'investment'
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

  // 2. ดึงข้อมูล Transactions เพื่อหาดอกเบี้ย/ปันผล
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "transactions"), (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [userId]);

  const fmt = (n: number) => privacyMode ? "***" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // 3. คำนวณภาพรวมพอร์ต
  const { totalMarketValue, totalCostBasis, unrealizedPnL, totalYield, netPnL, pnlPct } = useMemo(() => {
    let mv = 0;
    let cost = 0;
    let yieldSum = 0;

    const yieldKeywords = ['ดอกเบี้ย', 'ปันผล', 'กำไร', 'interest', 'dividend'];

    investmentAccounts.forEach(acc => {
      // ดึงค่าที่เคยบันทึกไว้ หรือใช้ค่า Default ถ้าเพิ่งสร้างจากหน้า Accounts
      const units = acc.total_units || 1;
      const costPerUnit = acc.average_cost || Number(acc.balance) || 0;
      const mktPrice = acc.market_price || Number(acc.balance) || 0;
      
      mv += (units * mktPrice);
      cost += (units * costPerUnit);

      // หาดอกเบี้ยอ้างอิงจาก Symbol หรือ ชื่อกระเป๋า
      const searchKey = (acc.symbol || acc.name).toLowerCase();
      const invYield = transactions.filter(t => {
        if (t.type !== 'income' || t.is_deleted) return false;
        const text = `${t.category || ''} ${t.note || ''}`.toLowerCase();
        return yieldKeywords.some(k => text.includes(k)) && text.includes(searchKey);
      }).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      
      yieldSum += invYield;
    });

    const unReal = mv - cost;
    const net = unReal + yieldSum;
    const pct = cost > 0 ? (net / cost) * 100 : 0;

    return { totalMarketValue: mv, totalCostBasis: cost, unrealizedPnL: unReal, totalYield: yieldSum, netPnL: net, pnlPct: pct };
  }, [investmentAccounts, transactions]);

  // เปิด Dialog แก้ไขรายละเอียดและโหลดข้อมูลเดิม
  const handleOpenEdit = (acc: any) => {
    setEditForm({
      symbol: acc.symbol || acc.name, // ใช้ชื่อกระเป๋าเป็น Symbol เริ่มต้น
      asset_class: acc.asset_class || "stock",
      total_units: String(acc.total_units || 1),
      avg_cost: String(acc.average_cost || acc.balance || 0),
      market_price: String(acc.market_price || acc.balance || 0),
    });
    setEditDialog({ open: true, acc });
  };

  // บันทึกการแก้ไข (ผสานข้อมูลเข้ากับ Account เดิม)
  const handleSaveEdit = async () => {
    if (!userId || !editDialog.acc) return;
    setSaving(true);
    try {
      const units = parseFloat(editForm.total_units) || 0;
      const mktPrice = parseFloat(editForm.market_price) || 0;
      const newBalance = units * mktPrice; // ความลับของระบบ: อัปเดต Balance ตามมูลค่าตลาด

      await updateAccount(userId, editDialog.acc.id, {
        symbol: editForm.symbol.trim().toUpperCase(),
        asset_class: editForm.asset_class,
        total_units: units,
        average_cost: parseFloat(editForm.avg_cost) || 0,
        market_price: mktPrice,
        balance: newBalance, // อัปเดตกลับไปที่หน้า Accounts ทันที!
      } as any);

      toast.success("บันทึกรายละเอียดการลงทุนสำเร็จ");
      setEditDialog({ open: false, acc: null });
    } catch (e: any) { 
      toast.error(e.message); 
    } finally { 
      setSaving(false); 
    }
  };

  const getYieldForInv = (symbolOrName: string) => {
    const searchKey = symbolOrName.toLowerCase();
    const yieldKeywords = ['ดอกเบี้ย', 'ปันผล', 'กำไร', 'interest', 'dividend'];
    return transactions.filter(t => {
      if (t.type !== 'income' || t.is_deleted) return false;
      const text = `${t.category || ''} ${t.note || ''}`.toLowerCase();
      return yieldKeywords.some(k => text.includes(k)) && text.includes(searchKey);
    }).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  };

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center border-b border-border px-4 gap-3">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold text-foreground">พอร์ตการลงทุน</h1>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={togglePrivacy}>
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-investment/10 to-investment/5 border-investment/20">
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground">Market Value (มูลค่าพอร์ต)</p>
                <p className="text-lg sm:text-2xl font-bold font-display text-foreground mt-1">฿{fmt(totalMarketValue)}</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground">Unrealized PnL (ส่วนต่างราคา)</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className={cn("text-lg sm:text-2xl font-bold font-display", unrealizedPnL >= 0 ? "text-accent" : "text-destructive")}>
                    {unrealizedPnL >= 0 ? "+" : ""}฿{fmt(unrealizedPnL)}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5"/> Yield (ดอกเบี้ย/ปันผล)</p>
                <p className="text-lg sm:text-2xl font-bold font-display text-green-500 mt-1">
                  +{fmt(totalYield)}
                </p>
              </CardContent>
            </Card>
            <Card className={cn("border-transparent", netPnL >= 0 ? "bg-accent/10 border-accent/20" : "bg-destructive/10 border-destructive/20")}>
              <CardContent className="p-4 sm:p-5">
                <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5"><Percent className="h-3.5 w-3.5"/> Total Net ROI</p>
                <div className="flex items-center gap-2 mt-1">
                  {netPnL >= 0 ? <TrendingUp className="h-4 w-4 text-accent" /> : <TrendingDown className="h-4 w-4 text-destructive" />}
                  <p className={cn("text-lg sm:text-2xl font-bold font-display", netPnL >= 0 ? "text-accent" : "text-destructive")}>
                    {privacyMode ? "***" : `${netPnL >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              รายการทั้งหมดนี้เชื่อมโยงกับกระเป๋าเงินประเภท <b>"การลงทุน"</b> ในหน้า Accounts
            </p>
          </div>

          {/* Edit Details Dialog */}
          <Dialog open={editDialog.open} onOpenChange={(o) => setEditDialog({ open: o, acc: o ? editDialog.acc : null })}>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>ปรับปรุงข้อมูล: {editDialog.acc?.name}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>Symbol / รหัสอ้างอิง</Label><Input value={editForm.symbol} onChange={(e) => setEditForm({ ...editForm, symbol: e.target.value })} placeholder="เช่น PTT, OAK" className="mt-1" /></div>
                <div><Label>ประเภทสินทรัพย์ (Asset Class)</Label>
                  <Select value={editForm.asset_class} onValueChange={(v) => setEditForm({ ...editForm, asset_class: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{assetClasses.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>จำนวนหน่วย</Label><Input type="number" value={editForm.total_units} onChange={(e) => setEditForm({ ...editForm, total_units: e.target.value })} className="mt-1" /></div>
                  <div><Label>ต้นทุนเฉลี่ย/หน่วย</Label><Input type="number" value={editForm.avg_cost} onChange={(e) => setEditForm({ ...editForm, avg_cost: e.target.value })} className="mt-1" /></div>
                </div>
                <div><Label>ราคาตลาดปัจจุบัน/หน่วย</Label><Input type="number" value={editForm.market_price} onChange={(e) => setEditForm({ ...editForm, market_price: e.target.value })} className="mt-1 text-accent" /></div>
                <p className="text-xs text-muted-foreground mt-2">
                  *ระบบจะนำ (จำนวนหน่วย x ราคาตลาด) ไปอัปเดตเป็นยอดเงินคงเหลือในหน้ากระเป๋าเงินให้อัตโนมัติ
                </p>
                <Button onClick={handleSaveEdit} disabled={saving || !editForm.symbol.trim()} className="w-full mt-2">{saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Asset Table */}
          {loading ? (
            <div className="text-center text-muted-foreground py-12">กำลังโหลด...</div>
          ) : investmentAccounts.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">ไม่มีบัญชีการลงทุน (กรุณาสร้างในหน้าบัญชี/กระเป๋าเงิน)</div>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>บัญชี / Symbol</TableHead>
                      <TableHead>Asset Class</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Avg Cost</TableHead>
                      <TableHead className="text-right">Market Price</TableHead>
                      <TableHead className="text-right">Market Value</TableHead>
                      <TableHead className="text-right">Unrealized PnL</TableHead>
                      <TableHead className="text-right text-green-500">Yield (ดอกเบี้ย)</TableHead>
                      <TableHead className="text-right font-bold">Net PnL</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {investmentAccounts.map((acc) => {
                      const units = acc.total_units || 1;
                      const costPerUnit = acc.average_cost || Number(acc.balance) || 0;
                      const mktPrice = acc.market_price || Number(acc.balance) || 0;
                      
                      const mv = units * mktPrice;
                      const cost = units * costPerUnit;
                      const unReal = mv - cost;
                      const invYield = getYieldForInv(acc.symbol || acc.name);
                      const rowNet = unReal + invYield;
                      
                      return (
                        <TableRow key={acc.id}>
                          <TableCell className="font-medium">
                            <p className="text-sm">{acc.symbol || "-"}</p>
                            <p className="text-xs text-muted-foreground">{acc.name}</p>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{assetClasses.find((a) => a.value === acc.asset_class)?.label || "-"}</TableCell>
                          <TableCell className="text-right tabular-nums">{privacyMode ? "***" : units.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">฿{fmt(costPerUnit)}</TableCell>
                          <TableCell className="text-right tabular-nums">฿{fmt(mktPrice)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">฿{fmt(mv)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums", unReal >= 0 ? "text-accent" : "text-destructive")}>
                            {unReal > 0 ? "+" : ""}฿{fmt(unReal)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-green-500 font-medium">
                            +{fmt(invYield)}
                          </TableCell>
                          <TableCell className={cn("text-right tabular-nums font-bold", rowNet >= 0 ? "text-accent" : "text-destructive")}>
                            {rowNet >= 0 ? "+" : ""}฿{fmt(rowNet)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleOpenEdit(acc)} className="h-8 text-muted-foreground hover:text-primary gap-1">
                              <Pencil className="h-3.5 w-3.5" /> ตั้งค่า
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
      </div>
    </>
  );
}
