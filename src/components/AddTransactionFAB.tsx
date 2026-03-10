import { useState, useEffect } from "react";
import { Plus, X, CalendarIcon, ChevronLeft } from "lucide-react";
import { collection, doc, getDocs, setDoc, query, where, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getIconByName } from "@/components/IconPicker";

interface CategoryData {
  label: string;
  main_categories: Record<string, string[]>;
  category_icons?: Record<string, string>;
}

// Fallback label map
const categoryLabelMap: Record<string, string> = {
  "หนี้สินและผ่อนชำระ": "DEBT",
  "เงินออมและการลงทุน": "SAVINGS",
  "ค่าสมาชิกรายเดือน": "SUBS.",
  "ค่าใช้จ่ายทั่วไป": "GENERAL",
  "ค่าเลี้ยงดูบุตร": "CHILDCARE",
  "ค่าสาธารณูปโภค": "UTILITIES",
  "รายได้ประจำ": "SALARY",
  "รายได้เสริม": "EXTRA",
  "รายได้จากการลงทุน": "INVEST",
};

const AddTransactionFAB = () => {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date>(new Date());
  const [mainCategory, setMainCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [categoryStep, setCategoryStep] = useState<1 | 2>(1);

  const [categories, setCategories] = useState<Record<string, CategoryData>>({});

  useEffect(() => {
    if (!userId) return;
    const catCol = collection(firestore, "users", userId, "categories");
    const unsubscribe = onSnapshot(catCol, (snap) => {
      const cats: Record<string, CategoryData> = {};
      snap.forEach((d) => {
        cats[d.id] = d.data() as CategoryData;
      });
      setCategories(cats);
    });
    return () => unsubscribe();
  }, [userId]);

  const currentCat = categories[type];
  const mainCats = currentCat?.main_categories ? Object.keys(currentCat.main_categories) : [];
  const subCats = mainCategory && currentCat?.main_categories?.[mainCategory]
    ? currentCat.main_categories[mainCategory]
    : [];

  const isExpense = type === "expense";

  const resetForm = () => {
    setType("expense");
    setAmount("");
    setDate(new Date());
    setMainCategory("");
    setSubCategory("");
    setNote("");
    setCategoryStep(1);
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      resetForm();
    }, 250);
  };

  const handleTypeChange = (newType: "expense" | "income") => {
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

  const handleSave = async () => {
    if (!userId) return;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) { toast.error("กรุณากรอกจำนวนเงิน"); return; }
    if (numAmount > MAX_AMOUNT) { toast.error(`จำนวนเงินต้องไม่เกิน ${MAX_AMOUNT.toLocaleString()} บาท`); return; }
    if (!subCategory) { toast.error("กรุณาเลือกหมวดหมู่"); return; }
    if (!mainCategory) { toast.error("กรุณาเลือกกลุ่มหมวดหมู่"); return; }
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
      await setDoc(doc(firestore, "users", userId, "transactions", newId), {
        type, amount: numAmount, date: dateStr, month_year: monthYear,
        main_category: mainCategory, sub_category: subCategory,
        note: trimmedNote, created_at: Date.now(),
      });
      queryClient.invalidateQueries({ queryKey: ["budget-data"] });
      toast.success("บันทึกรายการสำเร็จ");
      handleClose();
    } catch (e: any) {
      toast.error("เกิดข้อผิดพลาด: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !!amount && !!subCategory && !saving;

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
  const getLabel = (catName: string): string => categoryLabelMap[catName] || catName;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-[0_8px_30px_rgb(0,0,0,0.2)] flex items-center justify-center hover:scale-105 active:scale-95 transition-all duration-300"
      >
        <Plus className="h-6 w-6" strokeWidth={2.5} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={handleClose}>
          <div className={cn(
            "absolute inset-0 bg-background/40 backdrop-blur-sm transition-opacity",
            closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
          )} />

          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative z-10 w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-[2rem] shadow-2xl p-6 space-y-6",
              "bg-card/95 backdrop-blur-xl border border-border/50",
              closing ? "animate-modal-slide-down" : "animate-modal-slide-up"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="w-8" /> {/* Spacer for centering */}
              <h2 className="text-lg font-semibold text-foreground tracking-tight">เพิ่มรายการใหม่</h2>
              <button
                onClick={handleClose}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            {/* Segmented Type Toggle */}
            <div className="flex p-1.5 bg-muted/50 rounded-2xl">
              <button
                onClick={() => handleTypeChange("expense")}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-300",
                  isExpense
                    ? "bg-card text-destructive shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                รายจ่าย
              </button>
              <button
                onClick={() => handleTypeChange("income")}
                className={cn(
                  "flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-300",
                  !isExpense
                    ? "bg-card text-accent shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                รายรับ
              </button>
            </div>

            {/* Big Amount Input */}
            <div className="flex flex-col items-center justify-center py-4">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">จำนวนเงิน</span>
              <div className="flex items-center justify-center w-full">
                <span className={cn(
                  "text-4xl font-bold mr-1",
                  isExpense ? "text-destructive" : "text-accent"
                )}>฿</span>
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={cn(
                    "bg-transparent border-none text-5xl font-bold w-[60%] text-center focus:outline-none focus:ring-0 placeholder:text-muted-foreground/30",
                    isExpense ? "text-destructive" : "text-accent"
                  )}
                />
              </div>
            </div>

            {/* Date Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-12 justify-center bg-muted/30 border-dashed border-border/60 text-foreground hover:bg-muted/50 rounded-xl font-medium"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {thaiDate}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60] rounded-2xl" align="center">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus className="p-3" />
              </PopoverContent>
            </Popover>

            {/* Category Area */}
            <div className="h-[240px] relative overflow-hidden rounded-2xl bg-muted/20 border border-border/50">
              {/* Step 1: Main Categories */}
              <div className={cn(
                "absolute inset-0 p-3 overflow-y-auto custom-scrollbar transition-transform duration-300 ease-in-out",
                categoryStep === 1 ? "translate-x-0" : "-translate-x-full"
              )}>
                {mainCats.length > 0 ? (
                  <div className="grid grid-cols-3 gap-3">
                    {mainCats.map((mc) => {
                      const IconComp = getCategoryIcon(mc);
                      const isSelected = mainCategory === mc;
                      return (
                        <button
                          key={mc}
                          onClick={() => handleMainCategorySelect(mc)}
                          className={cn(
                            "group aspect-square p-2 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all duration-200",
                            isSelected
                              ? isExpense ? "bg-destructive/10 border-destructive/20" : "bg-accent/10 border-accent/20"
                              : "bg-background border border-border/40 hover:border-border hover:shadow-sm"
                          )}
                        >
                          <div className={cn(
                            "p-2 rounded-xl transition-colors",
                            isSelected
                              ? isExpense ? "bg-destructive text-white" : "bg-accent text-white"
                              : "bg-muted text-muted-foreground group-hover:text-foreground"
                          )}>
                            <IconComp className="h-5 w-5" />
                          </div>
                          <span className={cn(
                            "text-[11px] font-medium text-center leading-tight line-clamp-2",
                            isSelected ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                          )}>{getLabel(mc)}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm opacity-60">
                    <div className="p-4 rounded-full bg-muted mb-2"><X className="h-6 w-6" /></div>
                    ไม่พบหมวดหมู่
                  </div>
                )}
              </div>

              {/* Step 2: Sub Categories */}
              <div className={cn(
                "absolute inset-0 p-4 overflow-y-auto custom-scrollbar bg-background/50 backdrop-blur-sm transition-transform duration-300 ease-in-out",
                categoryStep === 2 ? "translate-x-0" : "translate-x-full"
              )}>
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-border/50">
                  <button
                    onClick={handleBackToMainCategories}
                    className="p-1 rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="text-sm font-semibold text-foreground">{getLabel(mainCategory)}</span>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  {subCats.map((sc) => {
                    const SubIcon = getCategoryIcon(sc);
                    const isSelected = subCategory === sc;
                    return (
                      <button
                        key={sc}
                        onClick={() => setSubCategory(sc)}
                        className={cn(
                          "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                          isSelected
                            ? isExpense
                              ? "bg-destructive text-white shadow-md shadow-destructive/20"
                              : "bg-accent text-white shadow-md shadow-accent/20"
                            : "bg-card text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                        )}
                      >
                        <SubIcon className="h-4 w-4 shrink-0" />
                        {sc}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="relative">
              <Textarea
                placeholder="เพิ่มบันทึกช่วยจำ..."
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                className="resize-none bg-muted/20 border-border/50 text-foreground placeholder:text-muted-foreground min-h-[60px] text-sm rounded-xl focus-visible:ring-1 focus-visible:ring-muted-foreground/30"
                maxLength={MAX_NOTE_LENGTH}
              />
              <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/60 font-medium">
                {note.length}/{MAX_NOTE_LENGTH}
              </span>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleSave}
              disabled={!canSubmit}
              className={cn(
                "w-full h-14 text-base font-bold rounded-2xl transition-all duration-300",
                isExpense
                  ? "bg-destructive hover:bg-destructive/90 text-white shadow-lg shadow-destructive/25"
                  : "bg-accent hover:bg-accent/90 text-white shadow-lg shadow-accent/25",
                !canSubmit && "opacity-40 cursor-not-allowed shadow-none"
              )}
            >
              {saving ? "กำลังบันทึก..." : "บันทึกรายการ"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default AddTransactionFAB;
