import { useState, useEffect, useMemo } from "react";
import { collection, doc, onSnapshot, getDocs } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { createGoal, updateGoal, softDeleteGoal, createTransactionAtomic, getDefaultAccount } from "@/lib/firestore-services";
import type { Goal, GoalType, Account } from "@/types/finance";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Target, Eye, EyeOff, MoreHorizontal, Pencil, Trash2, Loader2,
  Shield, TrendingUp, Landmark, CreditCard, Sparkles, Link2, LinkIcon,
  Trophy, Medal, CalendarClock, Repeat, PiggyBank, ArrowRight, BarChart3,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { expandRecurrence, formatFrequencyThai } from "@/lib/recurrence";
import type { BudgetItem, Transaction } from "@/hooks/useBudgetData";

const GOAL_TYPES: { value: GoalType; label: string; icon: typeof Target; color: string }[] = [
  { value: "savings", label: "เก็บออม", icon: Target, color: "text-saving" },
  { value: "emergency", label: "เงินสำรองฉุกเฉิน", icon: Shield, color: "text-amber-500" },
  { value: "investment", label: "ลงทุน", icon: TrendingUp, color: "text-primary" },
  { value: "debt", label: "ปลดหนี้", icon: CreditCard, color: "text-destructive" },
  { value: "other", label: "อื่น ๆ", icon: Sparkles, color: "text-muted-foreground" },
];

function getGoalTypeConfig(type?: GoalType) {
  return GOAL_TYPES.find((t) => t.value === type) || GOAL_TYPES[0];
}

function getProgressColor(pct: number) {
  if (pct >= 100) return "bg-accent";
  if (pct >= 60) return "bg-primary";
  if (pct >= 30) return "bg-debt";
  return "bg-destructive";
}

function getMilestones(pct: number) {
  const milestones: { label: string; reached: boolean }[] = [
    { label: "25%", reached: pct >= 25 },
    { label: "50%", reached: pct >= 50 },
    { label: "75%", reached: pct >= 75 },
    { label: "100%", reached: pct >= 100 },
  ];
  return milestones;
}

function getDaysRemaining(deadline: string) {
  if (!deadline) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(deadline);
  const diff = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

function getMonthlySavingsNeeded(remaining: number, deadline: string) {
  if (!deadline || remaining <= 0) return null;
  const days = getDaysRemaining(deadline);
  if (!days || days <= 0) return null;
  const months = days / 30;
  if (months < 0.5) return remaining; // less than half a month
  return Math.ceil(remaining / months);
}

function countTotalInstallments(item: BudgetItem): number {
  if (!item.recurrence || !item.startDate || !item.endDate) return 0;
  const start = new Date(item.startDate);
  const end = new Date(item.endDate);
  let count = 0;
  let y = start.getFullYear();
  let m = start.getMonth() + 1;
  const endY = end.getFullYear();
  const endM = end.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    count += expandRecurrence(item.dueDate, item.recurrence, y, m, item.startDate, item.endDate).length;
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return count;
}

const THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const GOAL_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(160 60% 45%)",
  "hsl(35 90% 55%)",
  "hsl(280 60% 55%)",
  "hsl(190 70% 50%)",
];

function GoalHistoryChart({ goals, userId, privacyMode }: {
  goals: { name: string; linked_account_id?: string }[];
  userId: string;
  privacyMode: boolean;
}) {
  const [monthlyData, setMonthlyData] = useState<Record<string, Record<string, number>>[]>([]);

  useEffect(() => {
    if (!userId || goals.length === 0) return;
    // Listen to transactions to build monthly savings per goal
    const linkedGoals = goals.filter((g) => g.linked_account_id);
    if (linkedGoals.length === 0) return;

    const accountIds = new Set(linkedGoals.map((g) => g.linked_account_id!));
    const accountToGoal = new Map<string, string>();
    linkedGoals.forEach((g) => accountToGoal.set(g.linked_account_id!, g.name));

    getDocs(collection(firestore, "users", userId, "transactions")).then((snap) => {
      const byMonth: Record<string, Record<string, number>> = {};

      snap.forEach((d) => {
        const t = d.data();
        if (t.is_deleted) return;
        const monthYear = (t.month_year as string) || "";
        if (!monthYear) return;

        // Count transfers TO goal-linked accounts
        const toId = t.to_account_id as string | undefined;
        if (toId && accountIds.has(toId)) {
          const goalName = accountToGoal.get(toId)!;
          if (!byMonth[monthYear]) byMonth[monthYear] = {};
          byMonth[monthYear][goalName] = (byMonth[monthYear][goalName] || 0) + (Number(t.amount) || 0);
        }
      });

      const sorted = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
      const data = sorted.map(([period, goals]) => {
        const [, m] = period.split("-").map(Number);
        return { month: THAI_MONTHS_SHORT[(m || 1) - 1], ...goals };
      });
      setMonthlyData(data as any);
    });
  }, [userId, goals]);

  const goalNames = goals.filter((g) => g.linked_account_id).map((g) => g.name);
  if (monthlyData.length < 2 || goalNames.length === 0) return null;

  return (
    <Card className="border-primary/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          ประวัติการออมรายเดือน
        </CardTitle>
      </CardHeader>
      <CardContent className="h-64 px-2 sm:px-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={(val) => privacyMode ? "***" : `${(val / 1000).toFixed(0)}k`}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              width={45}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                privacyMode ? "***" : `฿${value.toLocaleString("th-TH", { minimumFractionDigits: 2 })}`,
                name,
              ]}
              contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", backgroundColor: "hsl(var(--card))", fontSize: "11px", color: "hsl(var(--foreground))" }}
              itemStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Legend wrapperStyle={{ fontSize: "11px" }} />
            {goalNames.map((name, i) => (
              <Bar key={name} dataKey={name} fill={GOAL_COLORS[i % GOAL_COLORS.length]} radius={[3, 3, 0, 0]} stackId="savings" />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

type FormState = {
  name: string;
  target: string;
  current: string;
  deadline: string;
  goal_type: GoalType;
  linked_account_id: string;
};

const emptyForm: FormState = { name: "", target: "", current: "", deadline: "", goal_type: "savings", linked_account_id: "" };

export default function GoalsPage() {
  const { userId } = useAuth();
  const { privacyMode, togglePrivacy } = usePrivacy();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");

  // Edit state
  const [editGoal, setEditGoal] = useState<Goal | null>(null);
  const [editForm, setEditForm] = useState<FormState>({ ...emptyForm });
  const [editSaving, setEditSaving] = useState(false);

  // Delete state
  const [deleteGoalTarget, setDeleteGoalTarget] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Quick save state
  const [saveGoal, setSaveGoal] = useState<(Goal & { _linkedAccount: Account | null }) | null>(null);
  const [saveAmount, setSaveAmount] = useState("");
  const [saveFromAccountId, setSaveFromAccountId] = useState("");
  const [savingTransfer, setSavingTransfer] = useState(false);

  // Budget savings items (for installment schedule display)
  const [savingsBudgetItems, setSavingsBudgetItems] = useState<BudgetItem[]>([]);

  // Listen to goals
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "goals"), (snap) => {
      setGoals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Goal)).filter((g) => !g.is_deleted));
      setLoading(false);
    });
    return () => unsub();
  }, [userId]);

  // Listen to accounts
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(firestore, "users", userId, "accounts"), (snap) => {
      setAccounts(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Account))
          .filter((a) => !a.is_deleted && a.is_active)
      );
    });
    return () => unsub();
  }, [userId]);

  // Fetch budget savings items from ALL months for installment info
  useEffect(() => {
    if (!userId) return;
    const budgetsCol = collection(firestore, "users", userId, "budgets");
    getDocs(budgetsCol).then((snap) => {
      const merged = new Map<string, BudgetItem>();
      snap.docs.forEach((d) => {
        const data = d.data();
        const savingsCat = (data.expense_budgets as any)?.["เงินออมและการลงทุน"];
        if (!savingsCat || typeof savingsCat !== "object") return;
        Object.entries(savingsCat).forEach(([label, val]: [string, any]) => {
          const item: BudgetItem = {
            label,
            budget: typeof val === "number" ? val : val?.amount ?? 0,
            dueDate: val?.due_date ?? null,
            recurrence: val?.recurrence ?? null,
            startDate: val?.start_date ?? null,
            endDate: val?.end_date ?? null,
            paidDates: val?.paid_dates ?? [],
          };
          // Keep the one with recurrence info (prefer over non-recurrence)
          const existing = merged.get(label);
          if (!existing || (item.recurrence && !existing.recurrence)) {
            merged.set(label, item);
          }
        });
      });
      setSavingsBudgetItems(Array.from(merged.values()));
    });
  }, [userId]);

  // Build account map for linked balances
  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

  // Build budget map for matching goals to installment schedules
  const budgetMap = useMemo(() => {
    const map = new Map<string, BudgetItem & { totalInstallments: number; budgetTotal: number }>();
    savingsBudgetItems.forEach((item) => {
      if (item.recurrence && item.budget > 0) {
        const totalInstallments = countTotalInstallments(item);
        map.set(item.label, { ...item, totalInstallments, budgetTotal: item.budget * totalInstallments });
      }
    });
    return map;
  }, [savingsBudgetItems]);

  // Resolve current_amount and target_amount from linked account/budget
  const resolvedGoals = useMemo(() => {
    return goals.map((g) => {
      let resolved = { ...g, _linkedAccount: null as Account | null };
      // Sync current_amount from linked account balance
      if (g.linked_account_id) {
        const acc = accountMap.get(g.linked_account_id);
        if (acc) {
          resolved = { ...resolved, current_amount: acc.balance, _linkedAccount: acc };
        }
      }
      // Sync target_amount from budget installment total
      const matched = budgetMap.get(g.name);
      if (matched && matched.budgetTotal > 0) {
        resolved.target_amount = matched.budgetTotal;
      }
      return resolved;
    });
  }, [goals, accountMap, budgetMap]);

  // Filter goals
  const filteredGoals = useMemo(() => {
    return resolvedGoals.filter((g) => {
      const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
      if (filter === "active") return pct < 100;
      if (filter === "completed") return pct >= 100;
      return true;
    });
  }, [resolvedGoals, filter]);

  // Summary stats
  const summary = useMemo(() => {
    const total = resolvedGoals.length;
    const completed = resolvedGoals.filter((g) => g.target_amount > 0 && g.current_amount >= g.target_amount).length;
    const totalTarget = resolvedGoals.reduce((s, g) => s + g.target_amount, 0);
    const totalCurrent = resolvedGoals.reduce((s, g) => s + Math.min(g.current_amount, g.target_amount), 0);
    const overallPct = totalTarget > 0 ? Math.min((totalCurrent / totalTarget) * 100, 100) : 0;
    return { total, completed, active: total - completed, totalTarget, totalCurrent, overallPct };
  }, [resolvedGoals]);

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
        goal_type: form.goal_type,
        linked_account_id: form.linked_account_id || undefined,
      });
      toast.success("สร้างเป้าหมายสำเร็จ");
      setDialogOpen(false);
      setForm({ ...emptyForm });
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const openEdit = (goal: Goal) => {
    setEditGoal(goal);
    setEditForm({
      name: goal.name,
      target: String(goal.target_amount),
      current: String(goal.current_amount),
      deadline: goal.deadline || "",
      goal_type: goal.goal_type || "savings",
      linked_account_id: goal.linked_account_id || "",
    });
  };

  const handleEdit = async () => {
    if (!userId || !editGoal || !editForm.name.trim() || !editForm.target) return;
    setEditSaving(true);
    try {
      await updateGoal(userId, editGoal.id, {
        name: editForm.name.trim(),
        target_amount: parseFloat(editForm.target) || 0,
        current_amount: parseFloat(editForm.current) || 0,
        deadline: editForm.deadline || "",
        goal_type: editForm.goal_type,
        linked_account_id: editForm.linked_account_id || undefined,
      });
      toast.success("แก้ไขเป้าหมายสำเร็จ");
      setEditGoal(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!userId || !deleteGoalTarget) return;
    setDeleting(true);
    try {
      await softDeleteGoal(userId, deleteGoalTarget.id);
      toast.success("ลบเป้าหมายสำเร็จ");
      setDeleteGoalTarget(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setDeleting(false); }
  };

  // Quick save: transfer money to linked account
  const openSaveDialog = async (goal: typeof resolvedGoals[0]) => {
    setSaveGoal(goal);
    setSaveAmount("");
    // Auto-select default account as source
    if (userId) {
      const defaultAcc = await getDefaultAccount(userId);
      setSaveFromAccountId(defaultAcc?.id || "");
    }
  };

  const handleQuickSave = async () => {
    if (!userId || !saveGoal || !saveGoal.linked_account_id || !saveFromAccountId) return;
    const amount = parseFloat(saveAmount);
    if (!amount || amount <= 0) return;
    setSavingTransfer(true);
    try {
      const now = new Date();
      const txId = doc(collection(firestore, "users", userId, "transactions")).id;
      const destAccount = accountMap.get(saveGoal.linked_account_id);
      await createTransactionAtomic(userId, txId, {
        amount,
        type: "transfer",
        main_category: "โอนเงิน",
        sub_category: destAccount?.name || saveGoal.name,
        note: `ออมเงินเข้า ${saveGoal.name}`,
        date: now.toISOString().slice(0, 10),
        month_year: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
        from_account_id: saveFromAccountId,
        to_account_id: saveGoal.linked_account_id,
        created_at: Date.now(),
        updated_at: Date.now(),
      }, [
        { accountId: saveFromAccountId, delta: -amount },
        { accountId: saveGoal.linked_account_id, delta: amount },
      ]);
      toast.success(`ออมเงิน ${fmt(amount)} เข้า ${saveGoal.name} สำเร็จ`);
      setSaveGoal(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingTransfer(false); }
  };

  // When linked account changes in create form, auto-fill current amount
  const handleLinkedAccountChange = (accountId: string, isEdit: boolean) => {
    const acc = accountMap.get(accountId);
    if (isEdit) {
      setEditForm((f) => ({
        ...f,
        linked_account_id: accountId,
        current: acc ? String(acc.balance) : f.current,
        name: f.name || acc?.name || "",
      }));
    } else {
      setForm((f) => ({
        ...f,
        linked_account_id: accountId,
        current: acc ? String(acc.balance) : f.current,
        name: f.name || acc?.name || "",
      }));
    }
  };

  const renderGoalForm = (f: FormState, setF: (v: FormState) => void, isEdit: boolean) => (
    <div className="space-y-3 pt-2">
      <div>
        <Label>ชื่อเป้าหมาย</Label>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="เช่น เก็บเงินสำรองฉุกเฉิน" className="mt-1" />
      </div>
      <div>
        <Label>ประเภท</Label>
        <Select value={f.goal_type} onValueChange={(v) => setF({ ...f, goal_type: v as GoalType })}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            {GOAL_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                <span className="flex items-center gap-2">
                  <t.icon className={cn("h-3.5 w-3.5", t.color)} />
                  {t.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>ผูกบัญชี (ยอดจะ sync อัตโนมัติ)</Label>
        <Select value={f.linked_account_id || "_none"} onValueChange={(v) => handleLinkedAccountChange(v === "_none" ? "" : v, isEdit)}>
          <SelectTrigger className="mt-1"><SelectValue placeholder="ไม่ผูกบัญชี" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_none">ไม่ผูกบัญชี</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                <span className="flex items-center gap-2">
                  <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                  {a.name} ({fmt(a.balance)})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>เป้าหมาย (฿)</Label>
          <Input type="number" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label>ยอดปัจจุบัน (฿)</Label>
          <Input
            type="number"
            value={f.current}
            onChange={(e) => setF({ ...f, current: e.target.value })}
            className="mt-1"
            disabled={!!f.linked_account_id}
          />
          {f.linked_account_id && (
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Link2 className="h-3 w-3" /> sync จากบัญชีที่ผูก
            </p>
          )}
        </div>
      </div>
      <div>
        <Label>กำหนดเป้า</Label>
        <Input type="date" value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} className="mt-1" />
      </div>
    </div>
  );

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center border-b border-border px-4 gap-3">
          <SidebarTrigger />
          <h1 className="text-lg font-semibold text-foreground">เป้าหมายการเงิน</h1>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={togglePrivacy}>
              {privacyMode ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 space-y-6 overflow-y-auto pb-20 md:pb-6">
          {/* Summary Card */}
          {!loading && resolvedGoals.length > 0 && (
            <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
              <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-primary" />
                      <span className="font-semibold text-foreground">ภาพรวมเป้าหมาย</span>
                    </div>
                    <div className="flex items-end gap-3">
                      <span className="text-3xl font-bold font-display">{summary.overallPct.toFixed(0)}%</span>
                      <span className="text-sm text-muted-foreground pb-1">
                        {fmt(summary.totalCurrent)} / {fmt(summary.totalTarget)}
                      </span>
                    </div>
                    <div className="relative h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all duration-700", getProgressColor(summary.overallPct))}
                        style={{ width: `${summary.overallPct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold font-display text-foreground">{summary.total}</p>
                      <p className="text-xs text-muted-foreground">ทั้งหมด</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-display text-primary">{summary.active}</p>
                      <p className="text-xs text-muted-foreground">กำลังดำเนินการ</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold font-display text-accent">{summary.completed}</p>
                      <p className="text-xs text-muted-foreground">สำเร็จ</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Goal History Chart */}
          {!loading && userId && resolvedGoals.length > 0 && (
            <GoalHistoryChart goals={resolvedGoals} userId={userId} privacyMode={privacyMode} />
          )}

          {/* Actions Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> เพิ่มเป้าหมาย</Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border sm:max-w-md">
                <DialogHeader><DialogTitle>สร้างเป้าหมายใหม่</DialogTitle></DialogHeader>
                {renderGoalForm(form, setForm, false)}
                <DialogFooter>
                  <Button onClick={handleCreate} disabled={saving || !form.name.trim() || !form.target} className="w-full">
                    {saving ? "กำลังสร้าง..." : "สร้างเป้าหมาย"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Filter Buttons */}
            {resolvedGoals.length > 0 && (
              <div className="flex gap-1 ml-auto">
                {([
                  { key: "all", label: "ทั้งหมด" },
                  { key: "active", label: "กำลังดำเนินการ" },
                  { key: "completed", label: "สำเร็จ" },
                ] as const).map((f) => (
                  <Button
                    key={f.key}
                    variant={filter === f.key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter(f.key)}
                    className="text-xs"
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Goals Grid */}
          {loading ? (
            <div className="text-center text-muted-foreground py-12">กำลังโหลด...</div>
          ) : filteredGoals.length === 0 ? (
            <div className="text-center text-muted-foreground py-12">
              {goals.length === 0 ? "ยังไม่มีเป้าหมาย" : "ไม่มีเป้าหมายในหมวดนี้"}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredGoals.map((goal) => {
                const pct = goal.target_amount > 0 ? Math.min((goal.current_amount / goal.target_amount) * 100, 100) : 0;
                const remaining = Math.max(goal.target_amount - goal.current_amount, 0);
                const daysLeft = getDaysRemaining(goal.deadline);
                const monthlyNeeded = getMonthlySavingsNeeded(remaining, goal.deadline);
                const milestones = getMilestones(pct);
                const typeConfig = getGoalTypeConfig(goal.goal_type);
                const TypeIcon = typeConfig.icon;
                const matchedBudget = budgetMap.get(goal.name);
                const paidInstallments = matchedBudget ? Math.floor(goal.current_amount / matchedBudget.budget) : 0;

                return (
                  <Card key={goal.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", "bg-saving/10")}>
                            <TypeIcon className={cn("h-4.5 w-4.5", typeConfig.color)} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground text-sm">{goal.name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={cn("text-[11px]", typeConfig.color)}>{typeConfig.label}</span>
                              {goal._linkedAccount && (
                                <span className="text-[11px] text-muted-foreground flex items-center gap-0.5">
                                  <LinkIcon className="h-2.5 w-2.5" /> {goal._linkedAccount.name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            pct >= 100 ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
                          )}>
                            {pct >= 100 ? "สำเร็จ!" : `${pct.toFixed(0)}%`}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              {goal.linked_account_id && pct < 100 && (
                                <DropdownMenuItem onClick={() => openSaveDialog(goal)} className="gap-2 text-sm text-primary focus:text-primary">
                                  <PiggyBank className="h-3.5 w-3.5" /> ออมเงิน
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openEdit(goal)} className="gap-2 text-sm">
                                <Pencil className="h-3.5 w-3.5" /> แก้ไข
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setDeleteGoalTarget(goal)} className="gap-2 text-sm text-destructive focus:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" /> ลบ
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5">
                        <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all duration-500", getProgressColor(pct))} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{fmt(goal.current_amount)}</span>
                          <span className="text-foreground font-medium">{fmt(goal.target_amount)}</span>
                        </div>
                      </div>

                      {/* Milestones */}
                      <div className="flex items-center gap-1.5">
                        {milestones.map((m) => (
                          <div
                            key={m.label}
                            className={cn(
                              "flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full",
                              m.reached
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {m.reached && <Medal className="h-2.5 w-2.5" />}
                            {m.label}
                          </div>
                        ))}
                      </div>

                      {/* Installment schedule (from budget) */}
                      {matchedBudget && (
                        <div className="rounded-md bg-primary/5 border border-primary/10 p-2.5 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                            <CalendarClock className="h-3 w-3" />
                            แผนผ่อนชำระ
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Repeat className="h-3 w-3" />
                            {formatFrequencyThai(matchedBudget.recurrence)} · {fmt(matchedBudget.budget)}/งวด
                          </div>
                          {matchedBudget.totalInstallments > 0 && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                งวดที่ {paidInstallments} / {matchedBudget.totalInstallments}
                              </span>
                              <span className="text-muted-foreground">
                                เหลือ {matchedBudget.totalInstallments - paidInstallments} งวด
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Info lines */}
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {remaining > 0 && (
                          <p>เหลืออีก {fmt(remaining)}</p>
                        )}
                        {daysLeft !== null && (
                          <p className={cn(daysLeft <= 30 && daysLeft > 0 && "text-amber-500", daysLeft <= 0 && "text-destructive")}>
                            {daysLeft > 0
                              ? `เหลือเวลาอีก ${daysLeft} วัน`
                              : daysLeft === 0
                                ? "ถึงกำหนดวันนี้!"
                                : `เลยกำหนด ${Math.abs(daysLeft)} วัน`}
                          </p>
                        )}
                        {!matchedBudget && monthlyNeeded && monthlyNeeded > 0 && remaining > 0 && (
                          <p>ต้องออมเดือนละ {fmt(monthlyNeeded)}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editGoal} onOpenChange={(o) => !o && setEditGoal(null)}>
        <DialogContent className="bg-card border-border sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4 text-primary" /> แก้ไขเป้าหมาย</DialogTitle></DialogHeader>
          {renderGoalForm(editForm, setEditForm, true)}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditGoal(null)}>ยกเลิก</Button>
            <Button onClick={handleEdit} disabled={editSaving || !editForm.name.trim() || !editForm.target}>
              {editSaving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              บันทึก
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteGoalTarget} onOpenChange={(o) => !o && setDeleteGoalTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              ยืนยันการลบเป้าหมาย
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteGoalTarget && (
                <span className="block">
                  ต้องการลบเป้าหมาย "<span className="font-semibold text-foreground">{deleteGoalTarget.name}</span>" หรือไม่?
                  การกระทำนี้ไม่สามารถย้อนกลับได้
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              ลบเป้าหมาย
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick Save Dialog */}
      <Dialog open={!!saveGoal} onOpenChange={(o) => !o && setSaveGoal(null)}>
        <DialogContent className="bg-card border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-primary" /> ออมเงินเข้า {saveGoal?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <Label>จำนวนเงิน (฿)</Label>
              <Input
                type="number"
                value={saveAmount}
                onChange={(e) => setSaveAmount(e.target.value)}
                placeholder="เช่น 500"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label>โอนจากบัญชี</Label>
              <Select value={saveFromAccountId} onValueChange={setSaveFromAccountId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="เลือกบัญชีต้นทาง" /></SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== saveGoal?.linked_account_id)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name} ({fmt(a.balance)})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {saveGoal && saveFromAccountId && (
              <div className="rounded-lg bg-muted/50 p-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{accounts.find((a) => a.id === saveFromAccountId)?.name}</span>
                <ArrowRight className="h-3 w-3 shrink-0" />
                <span className="truncate">{saveGoal._linkedAccount?.name || saveGoal.name}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveGoal(null)}>ยกเลิก</Button>
            <Button
              onClick={handleQuickSave}
              disabled={savingTransfer || !saveAmount || parseFloat(saveAmount) <= 0 || !saveFromAccountId}
            >
              {savingTransfer && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              ออมเงิน
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
