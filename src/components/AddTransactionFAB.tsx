import { useState, useEffect } from "react";
import { Plus, X, CalendarIcon } from "lucide-react";
import { collection, doc, getDocs, addDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { th } from "date-fns/locale";
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

  const [categories, setCategories] = useState<Record<string, CategoryData>>({});

  // Fetch categories
  useEffect(() => {
    if (!userId) return;
    const fetchCategories = async () => {
      const catCol = collection(firestore, "users", userId, "categories");
      const snap = await getDocs(catCol);
      const cats: Record<string, CategoryData> = {};
      snap.forEach((d) => {
        cats[d.id] = d.data() as CategoryData;
      });
      setCategories(cats);
    };
    fetchCategories();
  }, [userId]);

  const currentCat = categories[type];
  const mainCats = currentCat?.main_categories
    ? Object.keys(currentCat.main_categories)
    : [];
  const subCats =
    mainCategory && currentCat?.main_categories?.[mainCategory]
      ? currentCat.main_categories[mainCategory]
      : [];

  const resetForm = () => {
    setType("expense");
    setAmount("");
    setDate(new Date());
    setMainCategory("");
    setSubCategory("");
    setNote("");
  };

  const handleClose = () => {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
      resetForm();
    }, 250);
  };

  const handleSave = async () => {
    if (!userId) return;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error("กรุณากรอกจำนวนเงิน");
      return;
    }
    if (!subCategory) {
      toast.error("กรุณาเลือกหมวดหมู่");
      return;
    }

    setSaving(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      const monthYear = format(date, "yyyy-MM");

      await addDoc(collection(firestore, "users", userId, "transactions"), {
        type,
        amount: numAmount,
        date: dateStr,
        month_year: monthYear,
        main_category: mainCategory,
        sub_category: subCategory,
        note: note.trim(),
        created_at: Date.now(),
      });

      // Invalidate queries so data refreshes
      queryClient.invalidateQueries({ queryKey: ["budget-data"] });
      toast.success("บันทึกรายการสำเร็จ");
      handleClose();
    } catch (e: any) {
      toast.error("เกิดข้อผิดพลาด: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-200"
      >
        <Plus className="h-7 w-7" />
      </button>

      {/* Backdrop + Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          onClick={handleClose}
        >
          {/* Blur backdrop */}
          <div className={cn(
            "absolute inset-0 bg-background/80 backdrop-blur-xl",
            closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
          )} />

          {/* Modal */}
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative z-10 w-full max-w-md mx-4 mb-4 sm:mb-0 bg-card rounded-2xl shadow-2xl border border-border p-5 space-y-4",
              closing ? "animate-modal-slide-down" : "animate-modal-slide-up"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-card-foreground">เพิ่มรายการใหม่</h2>
              <button
                onClick={handleClose}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setType("expense");
                  setMainCategory("");
                  setSubCategory("");
                }}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  type === "expense"
                    ? "bg-destructive text-destructive-foreground shadow-md"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                - รายจ่าย
              </button>
              <button
                onClick={() => {
                  setType("income");
                  setMainCategory("");
                  setSubCategory("");
                }}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  type === "income"
                    ? "bg-accent text-accent-foreground shadow-md"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                )}
              >
                + รายรับ
              </button>
            </div>

            {/* Amount */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">฿</span>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(
                  "pl-8 text-lg font-semibold h-12 border-border",
                  type === "expense" ? "text-destructive" : "text-accent"
                )}
              />
            </div>

            {/* Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left font-normal h-12 border-border"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {format(date, "dd MMM yyyy", { locale: th })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60]" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => d && setDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Main Category */}
            {mainCats.length > 0 && (
              <Select
                value={mainCategory}
                onValueChange={(v) => {
                  setMainCategory(v);
                  setSubCategory("");
                }}
              >
                <SelectTrigger className="h-12 border-border">
                  <SelectValue placeholder="เลือกกลุ่มหมวดหมู่" />
                </SelectTrigger>
                <SelectContent className="z-[60]">
                  {mainCats.map((mc) => (
                    <SelectItem key={mc} value={mc}>{mc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Sub Category */}
            {subCats.length > 0 && (
              <Select value={subCategory} onValueChange={setSubCategory}>
                <SelectTrigger className="h-12 border-border">
                  <SelectValue placeholder="เลือกหมวดหมู่ย่อย" />
                </SelectTrigger>
                <SelectContent className="z-[60]">
                  {subCats.map((sc) => (
                    <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Note */}
            <Textarea
              placeholder="บันทึกเพิ่มเติม..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="resize-none border-border min-h-[72px]"
            />

            {/* Submit */}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full h-12 text-base font-semibold rounded-xl bg-primary text-primary-foreground hover:bg-primary/90"
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
