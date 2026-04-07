import { useState, useEffect, useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Plus, X, CalendarIcon, ChevronLeft, CircleDot, ArrowRightLeft, Hash } from "lucide-react";
import { collection, doc, getDocs, query, where, orderBy, limit as fbLimit } from "firebase/firestore";
import { getDefaultAccount, getAccounts, createTransactionAtomic } from "@/lib/firestore-services";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getIconByName } from "@/components/IconPicker";
import type { Account } from "@/types/finance";

interface CategoryData {
  label: string;
  main_categories: Record<string, string[]>;
  category_icons?: Record<string, string>;
}

const categoryLabelMap: Record<string, string> = {
  "หนี้สิน": "DEBT",
  "เงินออมและการลงทุน": "SAVINGS",
  "ค่าสมาชิกรายเดือน": "SUBS.",
  "ค่าใช้จ่ายทั่วไป": "GENERAL",
  "ค่าดูแลเด็ก ๆ": "CHILDCARE",
  "บิลและสาธารณูปโภค": "BILLS",
  "รายได้ประจำ": "SALARY",
  "รายได้เสริม": "EXTRA",
  "รายได้จากการลงทุน": "INVEST",
};

const subCategoryLabelMap: Record<string, string> = {
  "ค่าไฟฟ้า": "Electric", "ค่าน้ำประปา": "Water", "ค่าอินเทอร์เน็ต": "Internet",
  "ค่าโทรศัพท์": "Phone", "ค่าเช่าบ้าน": "Rent", "ค่าส่วนกลาง": "Common",
  "ค่าอาหาร/เครื่องดื่ม": "Food/Drink", "ค่าเดินทาง": "Transport", "ค่าน้ำมัน": "Fuel",
  "ค่ารักษาพยาบาล": "Medical", "ค่าเสื้อผ้า": "Clothes", "ค่าของใช้": "Supplies",
  "ค่าบันเทิง": "Fun", "ค่าการศึกษา": "Education", "ค่าทำผม": "Haircut",
  "ผ่อนบ้าน": "Mortgage", "ผ่อนรถ": "Car Loan", "ผ่อนบัตรเครดิต": "Credit Card", "ผ่อนสินเชื่อ": "Loan",
  "เงินออม": "Savings", "กองทุน": "Fund", "หุ้น": "Stock",
  "ประกันชีวิต": "Life Ins.", "ประกันสุขภาพ": "Health Ins.",
  "YouTube Premium": "YouTube",
  "ค่าเทอม": "Tuition", "ค่านม/อาหาร": "Baby Food", "ค่าเสื้อผ้าเด็ก": "Kids Clothes",
  "เงินเดือน": "Salary", "โบนัส": "Bonus", "ค่าล่วงเวลา": "OT",
  "เงินปันผล": "Dividend", "ดอกเบี้ย": "Interest", "ขายของ": "Sales", "ฟรีแลนซ์": "Freelance",
};

interface FABProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const AddTransactionFAB = ({ open: externalOpen, onOpenChange }: FABProps = {}) => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = externalOpen !== undefined;
  const open = controlled ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (controlled) onOpenChange?.(v);
    else setInternalOpen(v);
  };
  const [closing, setClosing] = useState(false);
  const [type, setType] = useState<"expense" | "income" | "transfer">("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [mainCategory, setMainCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [categoryStep, setCategoryStep] = useState<1 | 2>(1);

  // Account selection
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [fromAccountId, setFromAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");

  // Tags
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);

  // Note autocomplete
  const [notesBySubCat, setNotesBySubCat] = useState<Record<string, string[]>>({});

  const [categories, setCategories] = useState<Record<string, CategoryData>>({});

  // Fetch accounts (one-time, refresh when dialog opens)
  useEffect(() => {
    if (!userId || !open) return;
    getAccounts(userId).then(setAccounts);
  }, [userId, open]);

  // Fetch suggested tags + note history from recent transactions
  useEffect(() => {
    if (!userId || !open) return;
    const txQ = query(
      collection(firestore, "users", userId, "transactions"),
      orderBy("date", "desc"),
      fbLimit(200)
    );
    getDocs(txQ).then((snap) => {
      const tagCounts: Record<string, number> = {};
      const noteCounts: Record<string, Map<string, number>> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        // Tags
        if (data.tags && Array.isArray(data.tags)) {
          data.tags.forEach((t: string) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
        }
        // Notes by sub_category
        const note = (data.note as string)?.trim();
        const subCat = (data.sub_category as string) ?? "";
        if (note && subCat) {
          if (!noteCounts[subCat]) noteCounts[subCat] = new Map();
          noteCounts[subCat].set(note, (noteCounts[subCat].get(note) ?? 0) + 1);
        }
      });
      setSuggestedTags(
        Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t)
      );
      const bySubCat: Record<string, string[]> = {};
      Object.entries(noteCounts).forEach(([cat, counts]) => {
        bySubCat[cat] = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([n]) => n);
      });
      setNotesBySubCat(bySubCat);
    });
  }, [userId, open]);

  useEffect(() => {
    if (!userId) return;
    getDocs(collection(firestore, "users", userId, "categories")).then((snap) => {
      const cats: Record<string, CategoryData> = {};
      snap.forEach((d) => {
        cats[d.id] = d.data() as CategoryData;
      });
      setCategories(cats);
    });
  }, [userId]);

  const currentCat = type !== "transfer" ? categories[type] : null;
  const mainCats = currentCat?.main_categories ? Object.keys(currentCat.main_categories) : [];
  const subCats = mainCategory && currentCat?.main_categories?.[mainCategory]
    ? currentCat.main_categories[mainCategory]
    : [];

  const isExpense = type === "expense";
  const isTransfer = type === "transfer";

  const resetForm = () => {
    setType("expense");
    setAmount("");
    setDate(new Date());
    setMainCategory("");
    setSubCategory("");
    setNote("");
    setCategoryStep(1);
    setSelectedAccountId("");
    setFromAccountId("");
    setToAccountId("");
    setTags([]);
    setTagInput("");
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      resetForm();
    }, 250);
  };

  const handleTypeChange = (newType: "expense" | "income" | "transfer") => {
    setType(newType);
    setMainCategory("");
    setSubCategory("");
    setCategoryStep(1);
  };

  const handleMainCategorySelect = (cat: string) => {
    setMainCategory(cat);
    setSubCategory("");
    setCategoryStep(2);
  };

  const handleBackToMainCategories = () => {
    setCategoryStep(1);
    setMainCategory("");
    setSubCategory("");
  };

  const addTag = (tag: string) => {
    const t = tag.trim().replace(/^#/, "").slice(0, MAX_TAG_LENGTH);
    if (t && !tags.includes(t) && tags.length < MAX_TAGS) setTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const getNextTransactionId = async (userId: string, monthYear: string): Promise<string> => {
    const txCol = collection(firestore, "users", userId, "transactions");
    const q = query(txCol, where("month_year", "==", monthYear));
    const snap = await getDocs(q);
    const prefix = `${monthYear}-tx-`;
    let maxNum = 0;
    snap.forEach((d) => {
      const id = d.id;
      if (id.startsWith(prefix)) {
        const num = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
  };

  const MAX_AMOUNT = 9_999_999.99;
  const MAX_NOTE_LENGTH = 500;
  const MAX_TAG_LENGTH = 30;
  const MAX_TAGS = 5;

  const handleSave = async () => {
    if (!userId) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) { toast.error("กรุณากรอกจำนวนเงินที่ถูกต้อง"); return; }
    if (numAmount > MAX_AMOUNT) { toast.error(`จำนวนเงินต้องไม่เกิน ${MAX_AMOUNT.toLocaleString()} บาท`); return; }

    if (isTransfer) {
      if (!fromAccountId || !toAccountId) { toast.error("กรุณาเลือกบัญชีต้นทางและปลายทาง"); return; }
      if (fromAccountId === toAccountId) { toast.error("บัญชีต้นทางและปลายทางต้องไม่เหมือนกัน"); return; }
    } else {
      if (!mainCategory || !currentCat?.main_categories?.[mainCategory]) { toast.error("กรุณาเลือกกลุ่มหมวดหมู่"); return; }
      if (!subCategory || !currentCat.main_categories[mainCategory].includes(subCategory)) { toast.error("กรุณาเลือกหมวดหมู่"); return; }
    }

    const trimmedNote = note.trim();
    if (trimmedNote.length > MAX_NOTE_LENGTH) { toast.error(`บันทึกต้องไม่เกิน ${MAX_NOTE_LENGTH} ตัวอักษร`); return; }
    const now = new Date();
    const fiveYearsAgo = new Date(now.getFullYear() - 5, 0, 1);
    if (date > now) { toast.error("ไม่สามารถเลือกวันที่ในอนาคตได้"); return; }
    if (date < fiveYearsAgo) { toast.error("วันที่ย้อนหลังได้ไม่เกิน 5 ปี"); return; }

    setSaving(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const monthYear = format(date, "yyyy-MM");
      const newId = await getNextTransactionId(userId, monthYear);

      const txData: Record<string, any> = {
        type: isTransfer ? "transfer" : type,
        amount: numAmount,
        date: dateStr,
        month_year: monthYear,
        note: trimmedNote,
        created_at: Date.now(),
      };

      if (tags.length > 0) txData.tags = tags;

      const balanceUpdates: { accountId: string; delta: number }[] = [];

      if (isTransfer) {
        txData.from_account_id = fromAccountId;
        txData.to_account_id = toAccountId;
        txData.main_category = "โอนเงิน";
        const destAccount = accounts.find(a => a.id === toAccountId);
        txData.sub_category = (destAccount?.type === 'investment' || destAccount?.type === 'savings')
          ? destAccount.name
          : "โอนระหว่างบัญชี";

        if (fromAccountId) balanceUpdates.push({ accountId: fromAccountId, delta: -numAmount });
        if (toAccountId) balanceUpdates.push({ accountId: toAccountId, delta: numAmount });
      } else {
        txData.main_category = mainCategory;
        txData.sub_category = subCategory;

        // Auto-attach account
        const accountId = selectedAccountId || null;
        let targetAccount: Account | null = null;

        if (accountId) {
          targetAccount = accounts.find((a) => a.id === accountId) || null;
        } else {
          try {
            targetAccount = await getDefaultAccount(userId);
          } catch { /* skip */ }
        }

        if (targetAccount) {
          if (type === "expense") {
            txData.from_account_id = targetAccount.id;
            balanceUpdates.push({ accountId: targetAccount.id, delta: -numAmount });
          }
          if (type === "income") {
            txData.to_account_id = targetAccount.id;
            balanceUpdates.push({ accountId: targetAccount.id, delta: numAmount });
          }
        }
      }

      // Atomic: write transaction + update balances in single Firestore transaction
      await createTransactionAtomic(userId, newId, txData, balanceUpdates);
      queryClient.invalidateQueries({ queryKey: ["budget-data"] });
      toast.success("บันทึกรายการสำเร็จ");
      handleClose();
    } catch (e: any) {
      toast.error("เกิดข้อผิดพลาด: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !!amount && (isTransfer ? (!!fromAccountId && !!toAccountId) : !!subCategory) && !saving;

  const filteredNoteSuggestions = useMemo(() => {
    const pool = subCategory
      ? (notesBySubCat[subCategory] ?? [])
      : Object.values(notesBySubCat).flat().filter((n, i, a) => a.indexOf(n) === i);
    const q = note.trim().toLowerCase();
    if (!q) return pool.slice(0, 5);
    return pool.filter((n) => n.toLowerCase().includes(q) && n.toLowerCase() !== q).slice(0, 5);
  }, [notesBySubCat, subCategory, note]);

  const thaiDate = (() => {
    const d = date;
    const day = d.getDate();
    const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
    const thaiYear = (d.getFullYear() + 543) % 100;
    return `${day} ${thaiMonths[d.getMonth()]} ${thaiYear}`;
  })();

  const getCategoryIcon = (catName: string) => {
    const iconName = currentCat?.category_icons?.[catName];
    return getIconByName(iconName);
  };
  const getLabel = (catName: string): string => categoryLabelMap[catName] || subCategoryLabelMap[catName] || catName;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-200"
      >
        <Plus className="h-7 w-7" />
      </button>

      {open && (
        <div
          className={cn("fixed inset-0 z-50 flex", isMobile ? "flex-col" : "items-center justify-center")}
          onClick={handleClose}
        >
          {/* Backdrop — desktop */}
          {!isMobile && (
            <div className={cn(
              "absolute inset-0 bg-black/50",
              closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
            )} />
          )}

          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              isMobile
                ? "fixed top-0 left-0 right-0 bottom-16 bg-card flex flex-col"
                : "relative z-10 w-full max-w-md mx-4 rounded-2xl shadow-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto bg-card border border-border",
              closing ? "animate-modal-slide-down" : "animate-modal-slide-up"
            )}
          >
            {/* Header */}
            <div className={cn(
              "flex items-center justify-between",
              isMobile
                ? "px-5 py-4 border-b border-border bg-card sticky top-0 z-10"
                : "mb-1"
            )}>
              <h2 className="text-lg font-semibold text-foreground">เพิ่มรายการใหม่</h2>
              <button
                onClick={handleClose}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable content (mobile) / inline (desktop) */}
            <div className={cn(isMobile ? "flex-1 overflow-y-auto p-5 space-y-4" : "space-y-3 mt-2")}>

            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => handleTypeChange("expense")}
                className={cn(
                  "flex-1 py-3 sm:py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  type === "expense"
                    ? "bg-destructive text-destructive-foreground shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                - Expense
              </button>
              <button
                onClick={() => handleTypeChange("income")}
                className={cn(
                  "flex-1 py-3 sm:py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  type === "income"
                    ? "bg-accent text-accent-foreground shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                + Income
              </button>
              <button
                onClick={() => handleTypeChange("transfer")}
                className={cn(
                  "flex-1 py-3 sm:py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  type === "transfer"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                <ArrowRightLeft className="h-3.5 w-3.5 inline mr-1" />
                Transfer
              </button>
            </div>

            {/* Amount — larger on mobile */}
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl sm:text-lg font-semibold text-muted-foreground">฿</span>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(
                  "pl-10 text-2xl sm:text-lg font-semibold h-16 sm:h-12 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1",
                  type === "expense" ? "focus-visible:ring-destructive" : type === "income" ? "focus-visible:ring-accent" : "focus-visible:ring-primary"
                )}
              />
            </div>

            {/* Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-12 justify-start bg-muted/50 border-border text-foreground hover:bg-muted"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {thaiDate}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60]" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
              </PopoverContent>
            </Popover>

            {/* Transfer: From/To Account */}
            {isTransfer && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">จากบัญชี</label>
                  <Select value={fromAccountId} onValueChange={setFromAccountId}>
                    <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="เลือกบัญชีต้นทาง" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">ไปยังบัญชี</label>
                  <Select value={toAccountId} onValueChange={setToAccountId}>
                    <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="เลือกบัญชีปลายทาง" /></SelectTrigger>
                    <SelectContent>
                      {accounts.filter((a) => a.id !== fromAccountId).map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Income/Expense: Optional Account + Category */}
            {!isTransfer && (
              <>
                {/* Optional Account Selector */}
                {accounts.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">บัญชี / กระเป๋าเงิน (ไม่บังคับ)</label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger className="bg-muted/50 border-border"><SelectValue placeholder="อัตโนมัติ (กระเป๋าหลัก)" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Category area */}
                <div className="h-[200px] relative overflow-hidden rounded-xl bg-muted/30 border border-border">
                  {/* Step 1: Main categories grid */}
                  <div className={cn(
                    "absolute inset-0 p-2 overflow-y-auto transition-all duration-200",
                    categoryStep === 1 ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
                  )}>
                    {mainCats.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {mainCats.map((mc) => {
                          const IconComp = getCategoryIcon(mc);
                          return (
                            <button
                              key={mc}
                              onClick={() => handleMainCategorySelect(mc)}
                              className={cn(
                                "px-2 py-3 rounded-xl text-xs font-medium transition-all duration-150",
                                "flex flex-col items-center justify-center gap-1.5",
                                "bg-muted/50 border hover:bg-muted",
                                mainCategory === mc
                                  ? isExpense ? "border-destructive bg-destructive/10" : "border-accent bg-accent/10"
                                  : "border-border"
                              )}
                            >
                              <IconComp className={cn(
                                "h-6 w-6",
                                mainCategory === mc
                                  ? isExpense ? "text-destructive" : "text-accent"
                                  : "text-muted-foreground"
                              )} />
                              <span className="text-foreground text-center leading-tight">{getLabel(mc)}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                        ไม่พบหมวดหมู่
                      </div>
                    )}
                  </div>

                  {/* Step 2: Sub categories list */}
                  <div className={cn(
                    "absolute inset-0 p-2 overflow-y-auto transition-all duration-200",
                    categoryStep === 2 ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
                  )}>
                    <button
                      onClick={handleBackToMainCategories}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span>{getLabel(mainCategory) || "Back"}</span>
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      {subCats.map((sc) => {
                        const SubIcon = getCategoryIcon(sc);
                        const selected = subCategory === sc;
                        return (
                          <button
                            key={sc}
                            onClick={() => setSubCategory(sc)}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150",
                              selected
                                ? isExpense
                                  ? "bg-destructive text-destructive-foreground shadow-sm"
                                  : "bg-accent text-accent-foreground shadow-sm"
                                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                            )}
                          >
                            <SubIcon className="h-3 w-3 shrink-0" />
                            {getLabel(sc)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Tags */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex-1 flex flex-wrap gap-1 items-center">
                  {tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                      #{t}
                      <button onClick={() => removeTag(t)} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === ",") && tagInput.trim()) {
                        e.preventDefault();
                        addTag(tagInput);
                      }
                    }}
                    placeholder={tags.length === 0 ? "เพิ่ม tag..." : ""}
                    className="bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none flex-1 min-w-[60px] py-1"
                  />
                </div>
              </div>
              {suggestedTags.length > 0 && tags.length < 5 && (
                <div className="flex flex-wrap gap-1">
                  {suggestedTags.filter((t) => !tags.includes(t)).slice(0, 5).map((t) => (
                    <button
                      key={t}
                      onClick={() => addTag(t)}
                      className="px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Note */}
            <div className="space-y-1.5">
              <div className="relative">
                <Textarea
                  placeholder="บันทึกเพิ่มเติม..."
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                  className="resize-none bg-muted/50 border-border text-foreground placeholder:text-muted-foreground min-h-[56px] text-sm"
                  maxLength={MAX_NOTE_LENGTH}
                />
                <span className="absolute bottom-1 right-2 text-[10px] text-muted-foreground">
                  {note.length}/{MAX_NOTE_LENGTH}
                </span>
              </div>
              {filteredNoteSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {filteredNoteSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNote(s)}
                      className="px-2 py-0.5 rounded-full text-[10px] bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors truncate max-w-[180px]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <Button
              onClick={handleSave}
              disabled={!canSubmit}
              className={cn(
                "w-full h-12 text-base font-semibold rounded-xl transition-all duration-200",
                type === "expense"
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg"
                  : type === "income"
                  ? "bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg",
                !canSubmit && "opacity-50 cursor-not-allowed"
              )}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
            </div> {/* end scrollable content */}
          </div>
        </div>
      )}
    </>
  );

};

export default AddTransactionFAB;
