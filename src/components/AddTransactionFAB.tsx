import { useState, useEffect } from "react";
import { Plus, X, CalendarIcon, ChevronLeft } from "lucide-react";
import { collection, doc, getDocs, setDoc, query, where, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CategoryData {
  label: string;
  main_categories: Record<string, string[]>;
}

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
  const themeColor = isExpense ? "red" : "emerald";

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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-200"
      >
        <Plus className="h-7 w-7" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={handleClose}>
          <div className={cn(
            "absolute inset-0 bg-background/5 backdrop-blur-xl",
            closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
          )} />

          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative z-10 w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl shadow-2xl p-5 space-y-3",
              "bg-slate-800/60 backdrop-blur-xl border border-white/10",
              closing ? "animate-modal-slide-down" : "animate-modal-slide-up"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">เพิ่มรายการใหม่</h2>
              <button
                onClick={handleClose}
                className="h-8 w-8 rounded-full flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => handleTypeChange("expense")}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isExpense
                    ? "bg-red-500 text-white shadow-md shadow-red-500/30"
                    : "bg-white/10 text-white/60 hover:bg-white/15"
                )}
              >
                - รายจ่าย
              </button>
              <button
                onClick={() => handleTypeChange("income")}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  !isExpense
                    ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/30"
                    : "bg-white/10 text-white/60 hover:bg-white/15"
                )}
              >
                + รายรับ
              </button>
            </div>

            {/* Amount + Date row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-white/40">฿</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={cn(
                    "pl-8 text-lg font-semibold h-12 bg-white/10 border-white/10 text-white placeholder:text-white/30 focus-visible:ring-1",
                    isExpense ? "focus-visible:ring-red-500" : "focus-visible:ring-emerald-500"
                  )}
                />
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-12 bg-white/10 border-white/10 text-white/80 hover:bg-white/15 hover:text-white shrink-0"
                  >
                    <CalendarIcon className="mr-1.5 h-4 w-4 text-white/40" />
                    {thaiDate}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[60]" align="end">
                  <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            {/* Category area — fixed height */}
            <div className="h-[200px] relative overflow-hidden rounded-xl bg-white/5 border border-white/10">
              {/* Step 1: Main categories grid */}
              <div className={cn(
                "absolute inset-0 p-2 overflow-y-auto transition-all duration-200",
                categoryStep === 1 ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
              )}>
                {mainCats.length > 0 ? (
                  <div className="grid grid-cols-2 gap-2">
                    {mainCats.map((mc) => (
                      <button
                        key={mc}
                        onClick={() => handleMainCategorySelect(mc)}
                        className={cn(
                          "px-3 py-3 rounded-xl text-sm font-medium text-white/80 text-left transition-all duration-150",
                          "bg-white/5 border hover:bg-white/10",
                          mainCategory === mc
                            ? isExpense ? "border-red-500/60 bg-red-500/10" : "border-emerald-500/60 bg-emerald-500/10"
                            : "border-white/10"
                        )}
                      >
                        {mc}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-white/30 text-sm">
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
                  className="flex items-center gap-1 text-sm text-white/50 hover:text-white/80 mb-2 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>{mainCategory || "กลับ"}</span>
                </button>
                <div className="flex flex-col gap-1">
                  {subCats.map((sc) => (
                    <button
                      key={sc}
                      onClick={() => setSubCategory(sc)}
                      className={cn(
                        "px-3 py-2.5 rounded-lg text-sm text-left text-white/80 transition-all duration-150",
                        "hover:bg-white/10",
                        subCategory === sc
                          ? isExpense ? "bg-red-500/15 border border-red-500/50" : "bg-emerald-500/15 border border-emerald-500/50"
                          : "border border-transparent"
                      )}
                    >
                      {sc}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="relative">
              <Textarea
                placeholder="บันทึกเพิ่มเติม..."
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                className="resize-none bg-white/10 border-white/10 text-white placeholder:text-white/30 min-h-[56px] text-sm"
                maxLength={MAX_NOTE_LENGTH}
              />
              <span className="absolute bottom-1 right-2 text-[10px] text-white/30">
                {note.length}/{MAX_NOTE_LENGTH}
              </span>
            </div>

            {/* Submit */}
            <Button
              onClick={handleSave}
              disabled={!canSubmit}
              className={cn(
                "w-full h-12 text-base font-semibold rounded-xl transition-all duration-200",
                isExpense
                  ? "bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/25"
                  : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/25",
                !canSubmit && "opacity-50 cursor-not-allowed"
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
