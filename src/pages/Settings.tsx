import { useState, useEffect, useMemo, useCallback } from "react";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { AppFooter } from "@/components/AppFooter";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { collection, doc, getDoc, getDocs, updateDoc, setDoc, query, where } from "firebase/firestore";
import { cn } from "@/lib/utils";
import { firestore } from "@/lib/firebase";
import { useAvailableMonths, createBudgetFromLatest } from "@/hooks/useBudgetData";
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
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  LogOut, User, Mail, Shield, ChevronRight, ChevronDown,
  Pencil, Check, X, Wallet, PiggyBank, Plus, Trash2, Tag, FolderTree, Home, Save, Loader2, Target, GripVertical,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

// ─── Sub-menu tabs ───
type SettingsTab = "budget" | "categories" | "savings" | "user";

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

// ─── Budget Table for a category group ───
const BudgetTable = ({
  title,
  titleColor,
  categories,
  allCategories,
  selectedCategory,
  onCategoryChange,
  onAmountChange,
  actuals,
}: {
  title: string;
  titleColor: string;
  categories: Record<string, Record<string, number>>;
  allCategories: string[];
  selectedCategory: string;
  onCategoryChange: (cat: string) => void;
  onAmountChange: (group: string, sub: string, value: number) => void;
  actuals: Record<string, number>;
}) => {
  const currentGroup = categories[selectedCategory] ?? {};
  const entries = Object.entries(currentGroup);
  const totalBudget = entries.reduce((s, [, v]) => s + v, 0);
  const totalActual = entries.reduce((s, [sub]) => s + (actuals[sub] ?? 0), 0);
  const totalRemaining = totalBudget - totalActual;

  const fmt = (v: number) => v.toLocaleString("th-TH", { minimumFractionDigits: 2 });

  const remainingColor = (budget: number, actual: number) => {
    const diff = budget - actual;
    if (actual === 0) return "text-muted-foreground";
    if (diff < 0) return "text-destructive font-medium";
    if (diff < budget * 0.2) return "text-orange-500 font-medium";
    return "text-emerald-600";
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className={`text-base font-bold text-center ${titleColor}`}>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-4 pb-2">
          <Select value={selectedCategory} onValueChange={onCategoryChange}>
            <SelectTrigger className="w-full text-sm">
              <SelectValue placeholder="เลือกหมวดหมู่" />
            </SelectTrigger>
            <SelectContent>
              {allCategories.map((cat) => (
                <SelectItem key={cat} value={cat} className="text-sm">{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border-t border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-3 py-2.5 font-medium">หมวดหมู่</th>
                <th className="text-right px-3 py-2.5 font-medium">งบประมาณ</th>
                <th className="text-right px-3 py-2.5 font-medium">จ่ายแล้ว</th>
                <th className="text-right px-3 py-2.5 font-medium">คงเหลือ</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([sub, amount]) => {
                const actual = actuals[sub] ?? 0;
                const remaining = amount - actual;
                return (
                  <tr key={sub} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 text-muted-foreground">{sub}</td>
                    <td className="px-3 py-2.5 text-right">
                      <Input
                        type="number"
                        value={amount}
                        onChange={(e) => onAmountChange(selectedCategory, sub, Number(e.target.value) || 0)}
                        className="h-8 w-28 text-sm text-right ml-auto"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {actual > 0 ? fmt(actual) : "-"}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${remainingColor(amount, actual)}`}>
                      {actual > 0 ? fmt(remaining) : "-"}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">ไม่มีรายการ</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-muted/50 font-medium">
                <td className="px-3 py-2.5">รวม</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totalBudget)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totalActual)}</td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${remainingColor(totalBudget, totalActual)}`}>{fmt(totalRemaining)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
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
  const [selectedExpenseCat, setSelectedExpenseCat] = useState<string>("");
  const [selectedIncomeCat, setSelectedIncomeCat] = useState<string>("");
  const [txActuals, setTxActuals] = useState<Record<string, number>>({});

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

  useEffect(() => {
    if (!userId || !period) return;
    setLoading(true);
    const docRef = doc(firestore, "users", userId, "budgets", period);
    getDoc(docRef).then(async (snap) => {
      if (!snap.exists()) {
        // Auto-create budget from latest
        const created = await createBudgetFromLatest(userId, period);
        if (created) {
          const newSnap = await getDoc(docRef);
          if (newSnap.exists()) {
            snap = newSnap;
          } else {
            setBudgetData(null);
            setLoading(false);
            return;
          }
        } else {
          setBudgetData(null);
          setLoading(false);
          return;
        }
      }
      const d = snap.data()!;
      const data: BudgetTreeData = {
        income_estimates: (d.income_estimates ?? {}) as Record<string, Record<string, number>>,
        expense_budgets: (d.expense_budgets ?? {}) as Record<string, Record<string, number>>,
        carry_over: (d.carry_over as number) ?? 0,
        period: (d.period as string) ?? period,
      };
      setBudgetData(data);
      const expKeys = Object.keys(data.expense_budgets);
      if (expKeys.length > 0 && !selectedExpenseCat) setSelectedExpenseCat(expKeys[0]);
      const incKeys = Object.keys(data.income_estimates);
      if (incKeys.length > 0 && !selectedIncomeCat) setSelectedIncomeCat(incKeys[0]);
      setLoading(false);
    });

    // Fetch transactions for actuals
    const txCol = collection(firestore, "users", userId, "transactions");
    const txQ = query(txCol, where("month_year", "==", period));
    getDocs(txQ).then((txSnap) => {
      const map: Record<string, number> = {};
      txSnap.forEach((d) => {
        const data = d.data();
        const subCat = (data.sub_category as string) ?? "";
        const amount = (data.amount as number) ?? 0;
        if (subCat) map[subCat] = (map[subCat] || 0) + amount;
      });
      setTxActuals(map);
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

  const updateIncome = (group: string, sub: string, value: number) => {
    if (!budgetData) return;
    setBudgetData({
      ...budgetData,
      income_estimates: {
        ...budgetData.income_estimates,
        [group]: { ...budgetData.income_estimates[group], [sub]: value },
      },
    });
  };

  const expenseCategories = budgetData ? Object.keys(budgetData.expense_budgets) : [];
  const incomeCategories = budgetData ? Object.keys(budgetData.income_estimates) : [];

  return (
    <div className="space-y-4">
      {/* Period selector + Save button */}
      <div className="flex flex-wrap items-center gap-3">
        {years.length > 0 && (
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 text-sm">
              <SelectValue placeholder="ปี" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y} className="text-sm">{String(Number(y) + 543)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {monthsForYear.length > 0 && (
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-32 text-sm">
              <SelectValue placeholder="เดือน" />
            </SelectTrigger>
            <SelectContent>
              {monthsForYear.map((m) => (
                <SelectItem key={m.month} value={m.month} className="text-sm">{m.monthName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button onClick={handleSave} disabled={saving || !budgetData} size="sm" className="ml-auto gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : !budgetData ? (
        <p className="text-sm text-muted-foreground">ไม่พบข้อมูลงบประมาณ</p>
      ) : (
        <>
          {/* Two-column layout: Expenses left, Income right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BudgetTable
              title="รายจ่าย"
              titleColor="text-destructive"
              categories={budgetData.expense_budgets}
              allCategories={expenseCategories}
              selectedCategory={selectedExpenseCat}
              onCategoryChange={setSelectedExpenseCat}
              onAmountChange={updateExpense}
              actuals={txActuals}
            />
            <BudgetTable
              title="รายรับ"
              titleColor="text-emerald-600"
              categories={budgetData.income_estimates}
              allCategories={incomeCategories}
              selectedCategory={selectedIncomeCat}
              onCategoryChange={setSelectedIncomeCat}
              onAmountChange={updateIncome}
              actuals={txActuals}
            />
          </div>
        </>
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

// ─── Category Settings Tab ───
const CategorySettings = () => {
  const { userId } = useAuth();
  const [incomeGroups, setIncomeGroups] = useState<Record<string, string[]>>({});
  const [expenseGroups, setExpenseGroups] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [addingTo, setAddingTo] = useState<{ type: "income" | "expense"; group: string } | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroupType, setAddingGroupType] = useState<"income" | "expense" | null>(null);

  // Fetch from categories collection
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      getDoc(doc(firestore, "users", userId, "categories", "expense")),
      getDoc(doc(firestore, "users", userId, "categories", "income")),
    ]).then(([expSnap, incSnap]) => {
      const toGroups = (raw: Record<string, any>): Record<string, string[]> => {
        const mc = raw?.main_categories ?? raw;
        const result: Record<string, string[]> = {};
        for (const [key, val] of Object.entries(mc)) {
          result[key] = Array.isArray(val) ? val : [];
        }
        return result;
      };
      if (expSnap.exists()) {
        setExpenseGroups(toGroups(expSnap.data()));
      }
      if (incSnap.exists()) {
        setIncomeGroups(toGroups(incSnap.data()));
      }
      setLoading(false);
    });
  }, [userId]);

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await Promise.all([
        setDoc(doc(firestore, "users", userId, "categories", "expense"), {
          label: "รายจ่าย",
          type: "expense",
          main_categories: expenseGroups,
        }),
        setDoc(doc(firestore, "users", userId, "categories", "income"), {
          label: "รายรับ",
          type: "income",
          main_categories: incomeGroups,
        }),
      ]);
      toast({ title: "บันทึกสำเร็จ", description: "อัปเดตหมวดหมู่เรียบร้อย" });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const addSubCategory = (type: "income" | "expense", group: string, name: string) => {
    if (!name.trim()) return;
    if (type === "income") {
      setIncomeGroups((prev) => ({
        ...prev,
        [group]: [...(prev[group] || []), name.trim()],
      }));
    } else {
      setExpenseGroups((prev) => ({
        ...prev,
        [group]: [...(prev[group] || []), name.trim()],
      }));
    }
    setNewSubName("");
    setAddingTo(null);
  };

  const removeSubCategory = (type: "income" | "expense", group: string, sub: string) => {
    if (type === "income") {
      setIncomeGroups((prev) => ({
        ...prev,
        [group]: prev[group].filter((s) => s !== sub),
      }));
    } else {
      setExpenseGroups((prev) => ({
        ...prev,
        [group]: prev[group].filter((s) => s !== sub),
      }));
    }
  };

  const addGroup = (type: "income" | "expense", name: string) => {
    if (!name.trim()) return;
    if (type === "income") {
      setIncomeGroups((prev) => ({ ...prev, [name.trim()]: [] }));
    } else {
      setExpenseGroups((prev) => ({ ...prev, [name.trim()]: [] }));
    }
    setNewGroupName("");
    setAddingGroupType(null);
  };

  const removeGroup = (type: "income" | "expense", group: string) => {
    if (type === "income") {
      setIncomeGroups((prev) => {
        const copy = { ...prev };
        delete copy[group];
        return copy;
      });
    } else {
      setExpenseGroups((prev) => {
        const copy = { ...prev };
        delete copy[group];
        return copy;
      });
    }
  };

  const renameGroup = (type: "income" | "expense", oldName: string, newName: string) => {
    if (!newName.trim() || newName.trim() === oldName) return;
    const setter = type === "income" ? setIncomeGroups : setExpenseGroups;
    setter((prev) => {
      const entries = Object.entries(prev).map(([k, v]) =>
        k === oldName ? [newName.trim(), v] : [k, v]
      );
      return Object.fromEntries(entries);
    });
  };

  const renameSubCategory = (type: "income" | "expense", group: string, oldSub: string, newSub: string) => {
    if (!newSub.trim() || newSub.trim() === oldSub) return;
    const setter = type === "income" ? setIncomeGroups : setExpenseGroups;
    setter((prev) => ({
      ...prev,
      [group]: prev[group].map((s) => (s === oldSub ? newSub.trim() : s)),
    }));
  };

  // Reorder helpers
  const reorderGroups = useCallback((type: "income" | "expense", fromIndex: number, toIndex: number) => {
    const setter = type === "income" ? setIncomeGroups : setExpenseGroups;
    setter((prev) => {
      const entries = Object.entries(prev);
      const [moved] = entries.splice(fromIndex, 1);
      entries.splice(toIndex, 0, moved);
      return Object.fromEntries(entries);
    });
  }, []);

  const reorderSubs = useCallback((type: "income" | "expense", group: string, fromIndex: number, toIndex: number) => {
    const setter = type === "income" ? setIncomeGroups : setExpenseGroups;
    setter((prev) => {
      const subs = [...prev[group]];
      const [moved] = subs.splice(fromIndex, 1);
      subs.splice(toIndex, 0, moved);
      return { ...prev, [group]: subs };
    });
  }, []);

  const moveSubCrossGroup = useCallback((type: "income" | "expense", fromGroup: string, toGroup: string, fromIndex: number, toIndex: number) => {
    const setter = type === "income" ? setIncomeGroups : setExpenseGroups;
    setter((prev) => {
      const srcSubs = [...prev[fromGroup]];
      const dstSubs = [...prev[toGroup]];
      const [moved] = srcSubs.splice(fromIndex, 1);
      dstSubs.splice(toIndex, 0, moved);
      return { ...prev, [fromGroup]: srcSubs, [toGroup]: dstSubs };
    });
  }, []);

  const handleDragEnd = useCallback((type: "income" | "expense") => (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, type: dragType } = result;
    if (dragType === "group") {
      if (source.index !== destination.index) {
        reorderGroups(type, source.index, destination.index);
      }
    } else {
      // droppableId is like "subs-expense-groupName"
      const prefix = `subs-${type}-`;
      const fromGroup = source.droppableId.replace(prefix, "");
      const toGroup = destination.droppableId.replace(prefix, "");
      if (fromGroup === toGroup) {
        if (source.index !== destination.index) {
          reorderSubs(type, fromGroup, source.index, destination.index);
        }
      } else {
        moveSubCrossGroup(type, fromGroup, toGroup, source.index, destination.index);
      }
    }
  }, [reorderGroups, reorderSubs, moveSubCrossGroup]);

  const CategoryGroup = ({
    type,
    groupName,
    subs,
    dragHandleProps,
  }: {
    type: "income" | "expense";
    groupName: string;
    subs: string[];
    dragHandleProps?: any;
  }) => {
    const [open, setOpen] = useState(true);
    const [editingGroup, setEditingGroup] = useState(false);
    const [groupDraft, setGroupDraft] = useState(groupName);
    const [editingSub, setEditingSub] = useState<string | null>(null);
    const [subDraft, setSubDraft] = useState("");

    return (
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1">
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
            <GripVertical className="h-4 w-4" />
          </div>
          {editingGroup ? (
            <div className="flex items-center gap-1 flex-1 px-1 py-1">
              <Input
                value={groupDraft}
                onChange={(e) => setGroupDraft(e.target.value)}
                className="h-8 text-sm flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") { renameGroup(type, groupName, groupDraft); setEditingGroup(false); }
                  if (e.key === "Escape") { setEditingGroup(false); setGroupDraft(groupName); }
                }}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { renameGroup(type, groupName, groupDraft); setEditingGroup(false); }}>
                <Check className="h-3 w-3 text-green-600" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingGroup(false); setGroupDraft(groupName); }}>
                <X className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ) : (
            <CollapsibleTrigger className="flex items-center gap-2 flex-1 px-2 py-2 rounded-md hover:bg-muted/50 transition-colors text-sm font-medium">
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <FolderTree className="h-4 w-4 text-primary" />
              <span>{groupName}</span>
              <span className="text-sm text-muted-foreground ml-auto mr-2">{subs.length} รายการ</span>
            </CollapsibleTrigger>
          )}
          {!editingGroup && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary shrink-0"
              onClick={() => { setGroupDraft(groupName); setEditingGroup(true); }}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
            onClick={() => removeGroup(type, groupName)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <CollapsibleContent>
          <Droppable droppableId={`subs-${type}-${groupName}`} type="subs">
            {(provided, snapshot) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className={cn(
                "ml-10 border-l-2 pl-3 space-y-1 py-1 rounded-r-md transition-all duration-200",
                snapshot.isDraggingOver
                  ? "border-primary/60 bg-primary/5"
                  : "border-border"
              )}>
                {subs.map((sub, subIdx) => (
                  <Draggable key={sub} draggableId={`${type}-${groupName}-${sub}`} index={subIdx}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={{
                          ...provided.draggableProps.style,
                          transition: snapshot.isDropAnimating
                            ? "all 0.25s cubic-bezier(0.2, 0, 0, 1)"
                            : provided.draggableProps.style?.transition,
                        }}
                        className={cn(
                          "flex items-center justify-between py-1 px-2 rounded transition-all duration-200 group",
                          snapshot.isDragging
                            ? "bg-primary/10 shadow-md scale-[1.02] ring-1 ring-primary/20"
                            : "hover:bg-muted/30"
                        )}
                      >
                        {editingSub === sub ? (
                          <div className="flex items-center gap-1 flex-1">
                            <Input value={subDraft} onChange={(e) => setSubDraft(e.target.value)}
                              className="h-7 text-sm flex-1" autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") { renameSubCategory(type, groupName, sub, subDraft); setEditingSub(null); }
                                if (e.key === "Escape") setEditingSub(null);
                              }}
                            />
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { renameSubCategory(type, groupName, sub, subDraft); setEditingSub(null); }}>
                              <Check className="h-3 w-3 text-green-600" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingSub(null)}>
                              <X className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
                                <GripVertical className="h-3 w-3" />
                              </div>
                              <Tag className="h-3 w-3" />
                              {sub}
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Button variant="ghost" size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary"
                                onClick={() => { setSubDraft(sub); setEditingSub(sub); }}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                                onClick={() => removeSubCategory(type, groupName, sub)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}

                {addingTo?.type === type && addingTo?.group === groupName ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <Input value={newSubName} onChange={(e) => setNewSubName(e.target.value)}
                      placeholder="ชื่อหมวดหมู่ย่อย" className="h-8 text-sm flex-1" autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addSubCategory(type, groupName, newSubName);
                        if (e.key === "Escape") { setAddingTo(null); setNewSubName(""); }
                      }}
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => addSubCategory(type, groupName, newSubName)}>
                      <Check className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setAddingTo(null); setNewSubName(""); }}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <button className="flex items-center gap-2 px-2 py-1 text-sm text-primary hover:text-primary/80 transition-colors"
                    onClick={() => { setAddingTo({ type, group: groupName }); setNewSubName(""); }}>
                    <Plus className="h-3 w-3" />
                    เพิ่มหมวดหมู่ย่อย
                  </button>
                )}
              </div>
            )}
          </Droppable>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <div className="space-y-4">
      {/* Save button */}
      <div className="flex items-center">
        <Button onClick={handleSave} disabled={saving} size="sm" className="ml-auto gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Expense categories - left */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-orange-500" />
                  หมวดหมู่รายจ่าย
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
              <DragDropContext onDragEnd={handleDragEnd("expense")}>
                <Droppable droppableId="expense-groups" type="group">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                      {Object.entries(expenseGroups).map(([group, subs], idx) => (
                        <Draggable key={`exp-${group}`} draggableId={`exp-${group}`} index={idx}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps}
                              style={{
                                ...provided.draggableProps.style,
                                transition: snapshot.isDropAnimating
                                  ? "all 0.25s cubic-bezier(0.2, 0, 0, 1)"
                                  : provided.draggableProps.style?.transition,
                              }}
                              className={cn(
                                "rounded-md transition-all duration-200",
                                snapshot.isDragging ? "bg-primary/5 shadow-lg scale-[1.01] ring-1 ring-primary/20" : ""
                              )}>
                              <CategoryGroup type="expense" groupName={group} subs={subs} dragHandleProps={provided.dragHandleProps} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

                {addingGroupType === "expense" ? (
                  <div className="flex items-center gap-1 px-3 py-2">
                    <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="ชื่อกลุ่มรายจ่าย" className="h-8 text-sm flex-1" autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addGroup("expense", newGroupName);
                        if (e.key === "Escape") { setAddingGroupType(null); setNewGroupName(""); }
                      }}
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => addGroup("expense", newGroupName)}>
                      <Check className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setAddingGroupType(null); setNewGroupName(""); }}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    onClick={() => { setAddingGroupType("expense"); setNewGroupName(""); }}>
                    <Plus className="h-4 w-4" />
                    เพิ่มกลุ่มรายจ่าย
                  </button>
                )}
              </CardContent>
            </Card>

            {/* Income categories - right */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-emerald-500" />
                  หมวดหมู่รายรับ
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
              <DragDropContext onDragEnd={handleDragEnd("income")}>
                <Droppable droppableId="income-groups" type="group">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                      {Object.entries(incomeGroups).map(([group, subs], idx) => (
                        <Draggable key={`inc-${group}`} draggableId={`inc-${group}`} index={idx}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps}
                              style={{
                                ...provided.draggableProps.style,
                                transition: snapshot.isDropAnimating
                                  ? "all 0.25s cubic-bezier(0.2, 0, 0, 1)"
                                  : provided.draggableProps.style?.transition,
                              }}
                              className={cn(
                                "rounded-md transition-all duration-200",
                                snapshot.isDragging ? "bg-primary/5 shadow-lg scale-[1.01] ring-1 ring-primary/20" : ""
                              )}>
                              <CategoryGroup type="income" groupName={group} subs={subs} dragHandleProps={provided.dragHandleProps} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

                {addingGroupType === "income" ? (
                  <div className="flex items-center gap-1 px-3 py-2">
                    <Input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="ชื่อกลุ่มรายรับ" className="h-8 text-sm flex-1" autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addGroup("income", newGroupName);
                        if (e.key === "Escape") { setAddingGroupType(null); setNewGroupName(""); }
                      }}
                    />
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => addGroup("income", newGroupName)}>
                      <Check className="h-3 w-3 text-green-600" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setAddingGroupType(null); setNewGroupName(""); }}>
                      <X className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <button className="flex items-center gap-2 px-3 py-2 text-sm text-primary hover:text-primary/80 transition-colors"
                    onClick={() => { setAddingGroupType("income"); setNewGroupName(""); }}>
                    <Plus className="h-4 w-4" />
                    เพิ่มกลุ่มรายรับ
                  </button>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Savings Goal Settings Tab ───
const SavingsGoalSettings = () => {
  const { userId } = useAuth();
  const { data: months } = useAvailableMonths();
  const [selectedYear, setSelectedYear] = useState<string>();
  const [selectedMonth, setSelectedMonth] = useState<string>();
  const [savingsTargets, setSavingsTargets] = useState<Record<string, number>>({});
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

  useEffect(() => {
    if (!userId || !period) return;
    setLoading(true);
    const docRef = doc(firestore, "users", userId, "budgets", period);
    getDoc(docRef).then(async (snap) => {
      if (!snap.exists()) {
        const created = await createBudgetFromLatest(userId, period);
        if (created) {
          const newSnap = await getDoc(docRef);
          if (newSnap.exists()) snap = newSnap;
          else { setLoading(false); return; }
        } else { setLoading(false); return; }
      }
      const d = snap.data()!;
      const expBudgets = (d.expense_budgets ?? {}) as Record<string, Record<string, number>>;
      // Find savings group (เงินออมและการลงทุน)
      const savingsGroup = expBudgets["เงินออมและการลงทุน"] ?? {};
      setSavingsTargets({ ...savingsGroup });
      setLoading(false);
    });
  }, [userId, period]);

  const handleSave = async () => {
    if (!userId || !period) return;
    setSaving(true);
    try {
      const docRef = doc(firestore, "users", userId, "budgets", period);
      const snap = await getDoc(docRef);
      if (!snap.exists()) throw new Error("ไม่พบเอกสาร");
      const d = snap.data();
      const expBudgets = { ...(d.expense_budgets ?? {}) } as Record<string, Record<string, number>>;
      expBudgets["เงินออมและการลงทุน"] = { ...savingsTargets };
      await updateDoc(docRef, { expense_budgets: expBudgets });
      toast({ title: "บันทึกสำเร็จ", description: `อัปเดตเป้าหมายการออม ${period}` });
    } catch (err: any) {
      toast({ title: "เกิดข้อผิดพลาด", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const totalTarget = Object.values(savingsTargets).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-4">
      {/* Period selector + Save */}
      <div className="flex flex-wrap items-center gap-3">
        {years.length > 0 && (
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-28 text-sm">
              <SelectValue placeholder="ปี" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y} className="text-sm">{String(Number(y) + 543)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {monthsForYear.length > 0 && (
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-32 text-sm">
              <SelectValue placeholder="เดือน" />
            </SelectTrigger>
            <SelectContent>
              {monthsForYear.map((m) => (
                <SelectItem key={m.month} value={m.month} className="text-sm">{m.monthName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button onClick={handleSave} disabled={saving || loading} size="sm" className="ml-auto gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-primary" />
              ตั้งเป้าหมายการออมรายเดือน
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              กำหนดยอดเป้าหมายสำหรับแต่ละหมวดการออม/การลงทุน เพื่อติดตามความคืบหน้าในแดชบอร์ด
            </p>
          </CardHeader>
          <CardContent>
            <div className="border-t border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-3 py-2.5 font-medium">หมวดการออม</th>
                    <th className="text-right px-3 py-2.5 font-medium">เป้าหมาย (บาท)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(savingsTargets).map(([label, amount]) => (
                    <tr key={label} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Target className="h-3.5 w-3.5 text-muted-foreground" />
                          {label}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Input
                          type="number"
                          value={amount}
                          onChange={(e) =>
                            setSavingsTargets((prev) => ({
                              ...prev,
                              [label]: Number(e.target.value) || 0,
                            }))
                          }
                          className="h-8 w-32 text-sm text-right ml-auto"
                        />
                      </td>
                    </tr>
                  ))}
                  {Object.keys(savingsTargets).length === 0 && (
                    <tr>
                      <td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">
                        ยังไม่มีหมวดการออม — เพิ่มได้ในตั้งค่าหมวดหมู่
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-medium">
                    <td className="px-3 py-2.5">รวมเป้าหมาย</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-display">
                      {totalTarget.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── Main Settings Page ───
const Settings = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get("tab") as SettingsTab) || "budget";
  const setTab = (t: SettingsTab) => setSearchParams({ tab: t });

  const titleMap: Record<SettingsTab, string> = {
    budget: "ตั้งค่างบประมาณ",
    categories: "ตั้งค่าหมวดหมู่",
    savings: "เป้าหมายการออม",
    user: "ตั้งค่าผู้ใช้",
  };

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <SidebarTrigger />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <div className="space-y-6">
            {/* Breadcrumb */}
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/" className="flex items-center gap-1">
                    <Home className="h-4 w-4" />
                    <span className="hidden sm:inline">หน้าหลัก</span>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="/settings?tab=budget" className="cursor-pointer">
                    ตั้งค่า
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{titleMap[tab]}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            <h1 className="text-2xl font-bold">{titleMap[tab]}</h1>

            {tab === "budget" && <BudgetSettings />}
            {tab === "categories" && <CategorySettings />}
            {tab === "savings" && <SavingsGoalSettings />}
            {tab === "user" && <UserSettings />}
          </div>
        </main>
        <AppFooter />
      </div>
    </>
  );
};

export default Settings;
