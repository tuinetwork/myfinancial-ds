import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAvailableMonths } from "@/hooks/useBudgetData";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  LogOut, User, Mail, Shield, ChevronRight, ChevronDown,
  Pencil, Check, X, Wallet, PiggyBank,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

// ─── Sub-menu tabs ───
type SettingsTab = "budget" | "user";

// ─── Budget tree types ───
interface BudgetTreeData {
  income_estimates: Record<string, Record<string, number>>;
  expense_budgets: Record<string, Record<string, number>>;
  carry_over: number;
  period: string;
}

// ─── Editable cell ───
const EditableAmount = ({
  value,
  onSave,
}: {
  value: number;
  onSave: (v: number) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  if (!editing) {
    return (
      <button
        className="flex items-center gap-1 text-sm tabular-nums hover:text-primary transition-colors group"
        onClick={() => { setDraft(String(value)); setEditing(true); }}
      >
        <span>{value.toLocaleString("th-TH")}</span>
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="h-7 w-28 text-xs"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") { onSave(Number(draft) || 0); setEditing(false); }
          if (e.key === "Escape") setEditing(false);
        }}
      />
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { onSave(Number(draft) || 0); setEditing(false); }}>
        <Check className="h-3 w-3 text-green-600" />
      </Button>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditing(false)}>
        <X className="h-3 w-3 text-destructive" />
      </Button>
    </div>
  );
};

// ─── Tree group component ───
const TreeGroup = ({
  label,
  icon,
  items,
  onUpdate,
}: {
  label: string;
  icon: React.ReactNode;
  items: [string, number][];
  onUpdate: (subLabel: string, newValue: number) => void;
}) => {
  const [open, setOpen] = useState(false);
  const total = items.reduce((s, [, v]) => s + v, 0);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full px-3 py-2 rounded-md hover:bg-muted/50 transition-colors text-sm font-medium">
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        {icon}
        <span className="flex-1 text-left">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{total.toLocaleString("th-TH")} ฿</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-10 border-l border-border pl-3 space-y-1 py-1">
          {items.map(([sub, val]) => (
            <div key={sub} className="flex items-center justify-between py-1 px-2 rounded hover:bg-muted/30 transition-colors">
              <span className="text-sm text-muted-foreground">{sub}</span>
              <EditableAmount value={val} onSave={(v) => onUpdate(sub, v)} />
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground py-2">ไม่มีรายการ</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

// ─── Budget Settings Tab ───
const BudgetSettings = () => {
  const { userId } = useAuth();
  const { data: months } = useAvailableMonths();
  const [selectedYear, setSelectedYear] = useState<string>();
  const [selectedMonth, setSelectedMonth] = useState<string>();
  const [budgetData, setBudgetData] = useState<BudgetTreeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const years = useMemo(() => {
    if (!months) return [];
    return Array.from(new Set(months.map((m) => m.year))).sort().reverse();
  }, [months]);

  const monthsForYear = useMemo(() => {
    if (!months || !selectedYear) return [];
    return months.filter((m) => m.year === selectedYear);
  }, [months, selectedYear]);

  useEffect(() => {
    if (years.length > 0 && !selectedYear) setSelectedYear(years[0]);
  }, [years, selectedYear]);

  useEffect(() => {
    if (monthsForYear.length > 0) setSelectedMonth(monthsForYear[0].month);
  }, [monthsForYear]);

  const period = useMemo(() => {
    if (!selectedYear || !selectedMonth) return undefined;
    return `${selectedYear}-${selectedMonth}`;
  }, [selectedYear, selectedMonth]);

  // Fetch raw budget doc
  useEffect(() => {
    if (!userId || !period) return;
    setLoading(true);
    const docRef = doc(firestore, "users", userId, "budgets", period);
    getDoc(docRef).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setBudgetData({
          income_estimates: (d.income_estimates ?? {}) as Record<string, Record<string, number>>,
          expense_budgets: (d.expense_budgets ?? {}) as Record<string, Record<string, number>>,
          carry_over: (d.carry_over as number) ?? 0,
          period: (d.period as string) ?? period,
        });
      } else {
        setBudgetData(null);
      }
      setLoading(false);
    });
  }, [userId, period]);

  const handleSave = async () => {
    if (!userId || !period || !budgetData) return;
    setSaving(true);
    try {
      const docRef = doc(firestore, "users", userId, "budgets", period);
      await updateDoc(docRef, {
        income_estimates: budgetData.income_estimates,
        expense_budgets: budgetData.expense_budgets,
        carry_over: budgetData.carry_over,
      });
      toast({ title: "บันทึกสำเร็จ", description: `อัปเดตงบประมาณ ${period}` });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const updateIncome = (group: string, label: string, value: number) => {
    if (!budgetData) return;
    setBudgetData({
      ...budgetData,
      income_estimates: {
        ...budgetData.income_estimates,
        [group]: { ...budgetData.income_estimates[group], [label]: value },
      },
    });
  };

  const updateExpense = (mainCat: string, subCat: string, value: number) => {
    if (!budgetData) return;
    setBudgetData({
      ...budgetData,
      expense_budgets: {
        ...budgetData.expense_budgets,
        [mainCat]: { ...budgetData.expense_budgets[mainCat], [subCat]: value },
      },
    });
  };

  const updateCarryOver = (value: number) => {
    if (!budgetData) return;
    setBudgetData({ ...budgetData, carry_over: value });
  };

  const EXPENSE_ICONS: Record<string, React.ReactNode> = {
    "ค่าใช้จ่ายทั่วไป": <Wallet className="h-4 w-4 text-orange-500" />,
    "บิลและสาธารณูปโภค": <Wallet className="h-4 w-4 text-blue-500" />,
    "หนี้สิน": <Wallet className="h-4 w-4 text-red-500" />,
    "ค่าสมาชิกรายเดือน": <Wallet className="h-4 w-4 text-purple-500" />,
    "เงินออมและการลงทุน": <PiggyBank className="h-4 w-4 text-green-500" />,
  };

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        {years.length > 0 && (
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 text-xs">
              <SelectValue placeholder="ปี" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>{String(Number(y) + 543)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {monthsForYear.length > 0 && (
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-32 text-xs">
              <SelectValue placeholder="เดือน" />
            </SelectTrigger>
            <SelectContent>
              {monthsForYear.map((m) => (
                <SelectItem key={m.month} value={m.month}>{m.monthName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : !budgetData ? (
        <p className="text-sm text-muted-foreground">ไม่พบข้อมูลงบประมาณ</p>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">งบประมาณ {budgetData.period}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">

            {/* Income groups */}
            {Object.entries(budgetData.income_estimates).map(([group, subs]) => (
              <TreeGroup
                key={`income-${group}`}
                label={group}
                icon={<Wallet className="h-4 w-4 text-emerald-500" />}
                items={Object.entries(subs)}
                onUpdate={(sub, val) => updateIncome(group, sub, val)}
              />
            ))}

            <Separator className="my-2" />

            {/* Expenses */}
            {Object.entries(budgetData.expense_budgets).map(([mainCat, subs]) => (
              <TreeGroup
                key={mainCat}
                label={mainCat}
                icon={EXPENSE_ICONS[mainCat] ?? <Wallet className="h-4 w-4" />}
                items={Object.entries(subs)}
                onUpdate={(sub, val) => updateExpense(mainCat, sub, val)}
              />
            ))}

            <Separator className="my-2" />

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── User Settings Tab ───
const UserSettings = () => {
  const { user, signOut } = useAuth();
  const displayName = user?.displayName || "ผู้ใช้";
  const email = user?.email || "";
  const photoURL = user?.photoURL || "";
  const uid = user?.uid || "";
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ข้อมูลผู้ใช้</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={photoURL} alt={displayName} />
              <AvatarFallback className="text-lg bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-lg font-semibold">{displayName}</h2>
              <p className="text-sm text-muted-foreground">{email}</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground w-20">ชื่อ</span>
              <span>{displayName}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground w-20">อีเมล</span>
              <span>{email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground w-20">UID</span>
              <span className="font-mono text-xs text-muted-foreground">{uid}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <Button variant="destructive" className="w-full gap-2" onClick={signOut}>
            <LogOut className="h-4 w-4" />
            ออกจากระบบ
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

// ─── Main Settings Page ───
const Settings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as SettingsTab) || "budget";
  const setTab = (t: SettingsTab) => setSearchParams({ tab: t });

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { key: "budget", label: "งบประมาณ", icon: <Wallet className="h-4 w-4" /> },
    { key: "user", label: "ผู้ใช้", icon: <User className="h-4 w-4" /> },
  ];

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <SidebarTrigger />
        </header>

        <main className="flex-1 p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <h1 className="text-2xl font-bold">
              {tab === "budget" ? "ตั้งค่างบประมาณ" : "ตั้งค่าผู้ใช้"}
            </h1>

            {tab === "budget" && <BudgetSettings />}
            {tab === "user" && <UserSettings />}
          </div>
        </main>
      </div>
    </>
  );
};

export default Settings;
