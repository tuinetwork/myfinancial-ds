import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { createInvestment, updateInvestment } from "@/lib/firestore-services";
import type { Investment, AssetClass } from "@/types/finance";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, TrendingUp, TrendingDown, RefreshCw, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const assetClasses: { value: AssetClass; label: string }[] = [
  { value: "stock", label: "หุ้น" },
  { value: "mutual_fund", label: "กองทุน" },
  { value: "crypto", label: "คริปโต" },
  { value: "bond", label: "พันธบัตร" },
  { value: "loan", label: "สินเชื่อ" },
  { value: "business", label: "ธุรกิจ" },
  { value: "inventory", label: "สินค้าคงคลัง" },
];

export default function InvestmentsPage() {
  const { userId } = useAuth();
  const { privacyMode, togglePrivacy } = usePrivacy();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [priceDialog, setPriceDialog] = useState<{ open: boolean; inv: Investment | null }>({ open: false, inv: null });
  const [newPrice, setNewPrice] = useState("");
  const [form, setForm] = useState({ symbol: "", asset_class: "stock" as AssetClass, total_units: "", avg_cost: "", market_price: "", account_id: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "investments"), (snap) => {
      setInvestments(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Investment)).filter((i) => !i.is_deleted));
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  const totalMarketValue = investments.reduce((s, i) => s + i.total_units * i.current_market_price, 0);
  const totalCostBasis = investments.reduce((s, i) => s + i.total_units * i.average_cost_per_unit, 0);
  const unrealizedPnL = totalMarketValue - totalCostBasis;
  const pnlPct = totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0;

  const fmt = (n: number) => privacyMode ? "***" : n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleCreate = async () => {
    if (!userId || !form.symbol.trim()) return;
    setSaving(true);
    try {
      await createInvestment(userId, {
        account_id: form.account_id || "",
        symbol: form.symbol.trim().toUpperCase(),
        asset_class: form.asset_class,
        total_units: parseFloat(form.total_units) || 0,
        average_cost_per_unit: parseFloat(form.avg_cost) || 0,
        current_market_price: parseFloat(form.market_price) || 0,
        is_deleted: false,
        last_updated: Date.now(),
      });
      toast.success("เพิ่มสินทรัพย์สำเร็จ");
      setDialogOpen(false);
      setForm({ symbol: "", asset_class: "stock", total_units: "", avg_cost: "", market_price: "", account_id: "" });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleUpdatePrice = async () => {
    if (!userId || !priceDialog.inv || !newPrice) return;
    try {
      await updateInvestment(userId, priceDialog.inv.id, { current_market_price: parseFloat(newPrice) });
      toast.success("อัปเดตราคาสำเร็จ");
      setPriceDialog({ open: false, inv: null });
      setNewPrice("");
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center border-b border-border px-4 gap-3">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold text-foreground">การลงทุน</h1>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={togglePrivacy}>
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="bg-gradient-to-br from-investment/10 to-investment/5 border-investment/20">
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Total Portfolio Value</p>
                <p className="text-2xl font-bold font-display text-foreground">฿{fmt(totalMarketValue)}</p>
              </CardContent>
            </Card>
            <Card className={cn("border-transparent", unrealizedPnL >= 0 ? "bg-accent/10 border-accent/20" : "bg-destructive/10 border-destructive/20")}>
              <CardContent className="p-5">
                <p className="text-sm text-muted-foreground">Unrealized PnL</p>
                <div className="flex items-center gap-2">
                  {unrealizedPnL >= 0 ? <TrendingUp className="h-5 w-5 text-accent" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
                  <p className={cn("text-2xl font-bold font-display", unrealizedPnL >= 0 ? "text-accent" : "text-destructive")}>
                    {unrealizedPnL >= 0 ? "+" : ""}฿{fmt(unrealizedPnL)} ({pnlPct.toFixed(2)}%)
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* New Asset */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> เพิ่มสินทรัพย์</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>เพิ่มสินทรัพย์ใหม่</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>Symbol</Label><Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="e.g. BTC, KBANK" className="mt-1" /></div>
                <div><Label>Asset Class</Label>
                  <Select value={form.asset_class} onValueChange={(v) => setForm({ ...form, asset_class: v as AssetClass })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{assetClasses.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>จำนวนหน่วย</Label><Input type="number" value={form.total_units} onChange={(e) => setForm({ ...form, total_units: e.target.value })} className="mt-1" /></div>
                  <div><Label>ต้นทุนเฉลี่ย</Label><Input type="number" value={form.avg_cost} onChange={(e) => setForm({ ...form, avg_cost: e.target.value })} className="mt-1" /></div>
                </div>
                <div><Label>ราคาตลาดปัจจุบัน</Label><Input type="number" value={form.market_price} onChange={(e) => setForm({ ...form, market_price: e.target.value })} className="mt-1" /></div>
                <Button onClick={handleCreate} disabled={saving || !form.symbol.trim()} className="w-full">{saving ? "กำลังบันทึก..." : "เพิ่มสินทรัพย์"}</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Update Price Dialog */}
          <Dialog open={priceDialog.open} onOpenChange={(o) => setPriceDialog({ open: o, inv: o ? priceDialog.inv : null })}>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>อัปเดตราคา {priceDialog.inv?.symbol}</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>ราคาตลาดใหม่</Label><Input type="number" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} className="mt-1" /></div>
                <Button onClick={handleUpdatePrice} className="w-full">อัปเดต</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Asset Table */}
          {loading ? (
            <div className="text-center text-muted-foreground py-12">กำลังโหลด...</div>
          ) : investments.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">ยังไม่มีสินทรัพย์</div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Symbol</TableHead>
                      <TableHead>Asset Class</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Avg Cost</TableHead>
                      <TableHead className="text-right">Market Price</TableHead>
                      <TableHead className="text-right">Market Value</TableHead>
                      <TableHead className="text-right">PnL</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {investments.map((inv) => {
                      const mv = inv.total_units * inv.current_market_price;
                      const cost = inv.total_units * inv.average_cost_per_unit;
                      const pnl = mv - cost;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.symbol}</TableCell>
                          <TableCell className="text-muted-foreground">{assetClasses.find((a) => a.value === inv.asset_class)?.label || inv.asset_class}</TableCell>
                          <TableCell className="text-right tabular-nums">{privacyMode ? "***" : inv.total_units.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">฿{fmt(inv.average_cost_per_unit)}</TableCell>
                          <TableCell className="text-right tabular-nums">฿{fmt(inv.current_market_price)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">฿{fmt(mv)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums font-medium", pnl >= 0 ? "text-accent" : "text-destructive")}>
                            {pnl >= 0 ? "+" : ""}฿{fmt(pnl)}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => { setPriceDialog({ open: true, inv }); setNewPrice(String(inv.current_market_price)); }}>
                              <RefreshCw className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </>
  );
}
