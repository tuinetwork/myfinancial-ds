import { useState, useEffect } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { createGoal, updateGoal } from "@/lib/firestore-services";
import type { Goal } from "@/types/finance";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Target, Eye, EyeOff, Home } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function GoalsPage() {
  const { userId } = useAuth();
  const { privacyMode, togglePrivacy } = usePrivacy();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", target: "", current: "", deadline: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "goals"), (snap) => {
      setGoals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Goal)).filter((g) => !g.is_deleted));
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  const fmt = (n: number) => privacyMode ? "***" : `฿${n.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`;

  const handleCreate = async () => {
    if (!userId || !form.name.trim() || !form.target) return;
    setSaving(true);
    try {
      await createGoal(userId, {
        name: form.name.trim(),
        target_amount: parseFloat(form.target) || 0,
        current_amount: parseFloat(form.current) || 0,
        deadline: form.deadline || "",
        status: "active",
        is_deleted: false,
      });
      toast.success("สร้างเป้าหมายสำเร็จ");
      setDialogOpen(false);
      setForm({ name: "", target: "", current: "", deadline: "" });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return "bg-accent";
    if (pct >= 60) return "bg-primary";
    if (pct >= 30) return "bg-debt";
    return "bg-destructive";
  };

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-transparent sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div>
              <p className="text-xs text-muted-foreground">
                <Home className="h-3 w-3 inline mr-1" />
                หน้าหลัก / เป้าหมายการออม
              </p>
              <h1 className="text-sm font-semibold text-foreground">เป้าหมายการออม</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={togglePrivacy}>
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-5 overflow-y-auto">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> เพิ่มเป้าหมาย</Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>สร้างเป้าหมายใหม่</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div><Label>ชื่อเป้าหมาย</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="เช่น ซื้อรถ" className="mt-1" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>เป้าหมาย (฿)</Label><Input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className="mt-1" /></div>
                  <div><Label>ยอดปัจจุบัน (฿)</Label><Input type="number" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} className="mt-1" /></div>
                </div>
                <div><Label>กำหนดเป้า</Label><Input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="mt-1" /></div>
                <Button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.target} className="w-full">{saving ? "กำลังสร้าง..." : "สร้างเป้าหมาย"}</Button>
              </div>
            </DialogContent>
          </Dialog>

          {loading ? (
            <div className="text-center text-muted-foreground py-12">กำลังโหลด...</div>
          ) : goals.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">ยังไม่มีเป้าหมาย</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {goals.map((goal) => {
                const pct = goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0;
                const remaining = goal.target_amount - goal.current_amount;
                return (
                  <Card key={goal.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-9 w-9 rounded-lg bg-saving/10 flex items-center justify-center">
                            <Target className="h-4.5 w-4.5 text-saving" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-sm">{goal.name}</p>
                            {goal.deadline && <p className="text-xs text-muted-foreground">กำหนด: {goal.deadline}</p>}
                          </div>
                        </div>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full font-medium",
                          pct >= 100 ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
                        )}>
                          {pct >= 100 ? "สำเร็จ!" : `${pct.toFixed(0)}%`}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all duration-500", getProgressColor(pct))} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{fmt(goal.current_amount)}</span>
                          <span className="text-foreground font-medium">{fmt(goal.target_amount)}</span>
                        </div>
                      </div>

                      {remaining > 0 && (
                        <p className="text-xs text-muted-foreground">เหลืออีก {fmt(remaining)}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </>
  );
}
