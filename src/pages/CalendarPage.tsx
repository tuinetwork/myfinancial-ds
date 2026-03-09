import { useState, useEffect, useMemo } from "react";
import { doc, getDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "@/components/NotificationBell";
import { UserProfilePopover } from "@/components/UserProfilePopover";
import { AppFooter } from "@/components/AppFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  CalendarDays, ChevronLeft, ChevronRight, Home, GripVertical,
  Banknote, Clock, AlertTriangle, CircleDollarSign, Receipt, Landmark, X, Move,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { formatCurrency } from "@/hooks/useBudgetData";

interface DueDateItem {
  mainCategory: string;
  subCategory: string;
  amount: number;
  dueDate: string;
}

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const THAI_WEEKDAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "บิลและสาธารณูปโภค": Receipt,
  "หนี้สิน": Landmark,
  "เงินออมและการลงทุน": CircleDollarSign,
  "ค่าสมาชิกรายเดือน": Banknote,
};

function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const thaiMonth = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][d.getMonth()];
  const buddhistYear = d.getFullYear() + 543;
  return `${day} ${thaiMonth} ${buddhistYear}`;
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function getStartPadding(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

type ExpenseBudgetValue =
  | number
  | { amount: number; due_date?: string | null }
  | { is_due_date_enabled?: boolean; sub_categories: Record<string, { amount: number; due_date?: string | null }> };

function isV2Format(val: unknown): val is { is_due_date_enabled?: boolean; sub_categories: Record<string, { amount: number; due_date?: string | null }> } {
  return typeof val === "object" && val !== null && "sub_categories" in val;
}

function extractDueDateItems(
  expenseBudgets: Record<string, ExpenseBudgetValue>,
  filterMonth?: string
): DueDateItem[] {
  const items: DueDateItem[] = [];

  for (const [mainCat, val] of Object.entries(expenseBudgets)) {
    if (isV2Format(val)) {
      for (const [subCat, subVal] of Object.entries(val.sub_categories)) {
        if (subVal?.due_date) {
          if (!filterMonth || subVal.due_date.startsWith(filterMonth)) {
            items.push({ mainCategory: mainCat, subCategory: subCat, amount: subVal.amount ?? 0, dueDate: subVal.due_date });
          }
        }
      }
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      for (const [subCat, subVal] of Object.entries(val as Record<string, unknown>)) {
        if (typeof subVal === "object" && subVal !== null && "due_date" in subVal) {
          const v = subVal as { amount?: number; due_date?: string | null };
          if (v.due_date) {
            if (!filterMonth || v.due_date.startsWith(filterMonth)) {
              items.push({ mainCategory: mainCat, subCategory: subCat, amount: v.amount ?? 0, dueDate: v.due_date });
            }
          }
        }
      }
    }
  }

  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

const CalendarPage = () => {
  const { userId } = useAuth();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [expenseBudgets, setExpenseBudgets] = useState<Record<string, ExpenseBudgetValue>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const period = `${year}-${String(month + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const docRef = doc(firestore, "users", userId, "budgets", period);
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        setExpenseBudgets((snap.data().expense_budgets ?? {}) as Record<string, ExpenseBudgetValue>);
      } else {
        setExpenseBudgets({});
      }
      setLoading(false);
    });
    return () => unsub();
  }, [userId, period]);

  const dueDateItems = useMemo(() => extractDueDateItems(expenseBudgets, period), [expenseBudgets, period]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, DueDateItem[]> = {};
    for (const item of dueDateItems) {
      if (!map[item.dueDate]) map[item.dueDate] = [];
      map[item.dueDate].push(item);
    }
    return map;
  }, [dueDateItems]);

  const totalByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [date, items] of Object.entries(itemsByDate)) {
      map[date] = items.reduce((sum, i) => sum + i.amount, 0);
    }
    return map;
  }, [itemsByDate]);

  const monthTotal = useMemo(() => dueDateItems.reduce((s, i) => s + i.amount, 0), [dueDateItems]);

  const days = getDaysInMonth(year, month);
  const startPadding = getStartPadding(year, month);

  const goToPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const handleDateClick = (dateStr: string) => {
    if (itemsByDate[dateStr]?.length) {
      setSelectedDate(dateStr === selectedDate ? null : dateStr);
    }
  };

  const updateDueDate = async (mainCat: string, subCat: string, newDate: string) => {
    if (!userId) return;
    const docRef = doc(firestore, "users", userId, "budgets", period);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const budgets = { ...(data.expense_budgets ?? {}) } as Record<string, ExpenseBudgetValue>;
    const catData = budgets[mainCat];

    if (isV2Format(catData)) {
      budgets[mainCat] = {
        ...catData,
        sub_categories: {
          ...catData.sub_categories,
          [subCat]: { ...catData.sub_categories[subCat], due_date: newDate },
        },
      };
    } else if (typeof catData === "object" && catData !== null && !("amount" in catData)) {
      const flat = catData as unknown as Record<string, { amount: number; due_date?: string | null }>;
      budgets[mainCat] = { ...flat, [subCat]: { ...flat[subCat], due_date: newDate } } as unknown as ExpenseBudgetValue;
    }

    await updateDoc(docRef, { expense_budgets: budgets });
    toast({ 
      title: "อัปเดตวันชำระสำเร็จ", 
      description: `${subCat} → ${formatThaiDate(newDate)}`,
    });
  };

  const handleDragStart = () => {
    setIsDragging(true);
  };

  const handleDragEnd = async (result: DropResult) => {
    setIsDragging(false);
    if (!result.destination) return;
    
    const sourceDate = result.source.droppableId;
    const destDate = result.destination.droppableId;
    
    if (sourceDate === destDate) return;
    
    const sourceItems = itemsByDate[sourceDate];
    if (!sourceItems) return;
    
    const item = sourceItems[result.source.index];
    if (!item) return;
    
    await updateDueDate(item.mainCategory, item.subCategory, destDate);
    
    // Keep the panel open but update to show the new date
    if (selectedDate === sourceDate && itemsByDate[sourceDate]?.length === 1) {
      setSelectedDate(null);
    }
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const selectedItems = selectedDate ? itemsByDate[selectedDate] || [] : [];

  return (
    <>
      <AppSidebar />
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">ปฏิทินการเงิน</h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <UserProfilePopover />
          </div>
        </header>

        <main className="flex-1 p-3 sm:p-4 md:p-6 overflow-x-hidden">
          <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="space-y-5">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbPage className="flex items-center gap-1">
                      <Home className="h-4 w-4" />
                      <span>ปฏิทินการเงิน</span>
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/15">
                      <Banknote className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">ยอดชำระเดือนนี้</p>
                      <p className="text-lg font-bold text-foreground">{formatCurrency(monthTotal)}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-accent/10 to-accent/5 border-accent/20">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-accent/15">
                      <CalendarDays className="h-5 w-5 text-accent" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">จำนวนรายการ</p>
                      <p className="text-lg font-bold text-foreground">{dueDateItems.length} <span className="text-sm font-normal text-muted-foreground">รายการ</span></p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20 col-span-2 sm:col-span-1">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-destructive/15">
                      <AlertTriangle className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground font-medium">เลยกำหนด</p>
                      <p className="text-lg font-bold text-foreground">
                        {dueDateItems.filter(i => getDaysUntil(i.dueDate) < 0).length}
                        <span className="text-sm font-normal text-muted-foreground"> รายการ</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Calendar + Side Panel Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Calendar Grid */}
                <Card className="overflow-hidden lg:col-span-2">
                  <CardHeader className="pb-3 bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center justify-between">
                      <Button variant="ghost" size="icon" onClick={goToPrevMonth} className="rounded-full hover:bg-primary/10">
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-primary" />
                        {THAI_MONTHS[month]} {year + 543}
                      </CardTitle>
                      <Button variant="ghost" size="icon" onClick={goToNextMonth} className="rounded-full hover:bg-primary/10">
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-2 sm:p-4">
                    {loading ? (
                      <div className="grid grid-cols-7 gap-1.5">
                        {[...Array(35)].map((_, i) => (
                          <Skeleton key={i} className="h-20 sm:h-24 rounded-lg" />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                        {/* Weekday headers */}
                        {THAI_WEEKDAYS.map((day, i) => (
                          <div
                            key={day}
                            className={`text-center text-[11px] sm:text-xs font-semibold py-2 rounded-md ${
                              i === 0 ? "text-destructive/70" : i === 6 ? "text-primary/70" : "text-muted-foreground"
                            }`}
                          >
                            {day}
                          </div>
                        ))}

                        {/* Empty padding */}
                        {[...Array(startPadding)].map((_, i) => (
                          <div key={`pad-${i}`} className="h-20 sm:h-24" />
                        ))}

                        {/* Day cells - all are Droppable */}
                        {days.map((d) => {
                          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                          const dayItems = itemsByDate[dateStr] || [];
                          const total = totalByDate[dateStr] || 0;
                          const isToday = dateStr === todayStr;
                          const hasItems = dayItems.length > 0;
                          const isOverdue = hasItems && getDaysUntil(dateStr) < 0;
                          const isSunday = d.getDay() === 0;
                          const isSaturday = d.getDay() === 6;
                          const isSelected = dateStr === selectedDate;

                          return (
                            <Droppable droppableId={dateStr} key={dateStr}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.droppableProps}
                                  onClick={() => handleDateClick(dateStr)}
                                  className={`h-20 sm:h-24 p-1 sm:p-1.5 rounded-lg border text-xs transition-all duration-200 relative group
                                    ${isSelected
                                      ? "border-primary ring-2 ring-primary/30 bg-primary/10 shadow-md"
                                      : isToday
                                        ? "border-primary/50 bg-primary/5 shadow-sm"
                                        : hasItems
                                          ? "border-border bg-card hover:shadow-md hover:border-primary/30"
                                          : "border-border/50 bg-card/50 hover:bg-card"
                                    }
                                    ${snapshot.isDraggingOver ? "bg-accent/30 border-accent ring-2 ring-accent/40 scale-[1.03]" : ""}
                                    ${hasItems ? "cursor-pointer" : ""}
                                    ${isDragging && !hasItems ? "border-dashed border-primary/30" : ""}
                                  `}
                                >
                                  {/* Day number */}
                                  <div className="flex items-center justify-between mb-0.5">
                                    <span className={`text-[11px] sm:text-xs font-semibold leading-none
                                      ${isToday ? "bg-primary text-primary-foreground rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center" : ""}
                                      ${!isToday && isSunday ? "text-destructive/80" : ""}
                                      ${!isToday && isSaturday ? "text-primary/80" : ""}
                                    `}>
                                      {d.getDate()}
                                    </span>
                                    {isOverdue && (
                                      <AlertTriangle className="h-3 w-3 text-destructive animate-pulse" />
                                    )}
                                  </div>

                                  {/* Amount badge */}
                                  {total > 0 && (
                                    <div className={`mt-0.5 px-1 py-0.5 rounded text-[9px] sm:text-[10px] font-medium truncate text-center
                                      ${isOverdue
                                        ? "bg-destructive/15 text-destructive"
                                        : "bg-primary/10 text-primary"
                                      }
                                    `}>
                                      {formatCurrency(total)}
                                    </div>
                                  )}

                                  {/* Item count dots */}
                                  {dayItems.length > 0 && (
                                    <div className="flex items-center justify-center gap-0.5 mt-1">
                                      {dayItems.slice(0, 3).map((_, idx) => (
                                        <div key={idx} className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${
                                          isOverdue ? "bg-destructive/60" : "bg-primary/50"
                                        }`} />
                                      ))}
                                      {dayItems.length > 3 && (
                                        <span className="text-[8px] text-muted-foreground ml-0.5">+{dayItems.length - 3}</span>
                                      )}
                                    </div>
                                  )}

                                  {/* Drop indicator when dragging */}
                                  {isDragging && !hasItems && (
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Move className="h-4 w-4 text-primary/40" />
                                    </div>
                                  )}

                                  {provided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Side Panel - Selected Date Items */}
                <Card className={`overflow-hidden transition-all duration-300 ${selectedDate ? "opacity-100" : "opacity-70"}`}>
                  <CardHeader className="pb-2 bg-gradient-to-r from-primary/5 to-transparent">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        {selectedDate ? (
                          <>รายการวันที่ {formatThaiDate(selectedDate)}</>
                        ) : (
                          <>เลือกวันเพื่อดูรายการ</>
                        )}
                      </CardTitle>
                      {selectedDate && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedDate(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {selectedDate && selectedItems.length > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {selectedItems.length} รายการ
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          รวม {formatCurrency(totalByDate[selectedDate] || 0)}
                        </Badge>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-2">
                    {!selectedDate ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm text-center">คลิกที่วันในปฏิทิน<br/>เพื่อดูรายการที่ต้องชำระ</p>
                      </div>
                    ) : selectedItems.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm">ไม่มีรายการในวันนี้</p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[300px] lg:h-[400px]">
                        <Droppable droppableId={selectedDate}>
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 p-1">
                              {selectedItems.map((item, index) => {
                                const IconComponent = CATEGORY_ICON_MAP[item.mainCategory] || Banknote;
                                const daysUntil = getDaysUntil(item.dueDate);
                                const isOverdue = daysUntil < 0;
                                
                                return (
                                  <Draggable
                                    key={`${item.mainCategory}-${item.subCategory}`}
                                    draggableId={`${item.mainCategory}-${item.subCategory}`}
                                    index={index}
                                  >
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        className={`flex items-center gap-2 p-3 rounded-lg border transition-all
                                          ${snapshot.isDragging
                                            ? "shadow-2xl bg-card border-primary ring-2 ring-primary/30 scale-105 z-50"
                                            : isOverdue
                                              ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10"
                                              : "bg-muted/20 border-border/50 hover:bg-muted/40"
                                          }
                                        `}
                                      >
                                        <div 
                                          {...provided.dragHandleProps} 
                                          className="cursor-grab active:cursor-grabbing p-1 -ml-1 rounded hover:bg-muted/50"
                                        >
                                          <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                                        </div>
                                        <div className={`p-1.5 rounded-md shrink-0 ${isOverdue ? "bg-destructive/10" : "bg-primary/10"}`}>
                                          <IconComponent className={`h-4 w-4 ${isOverdue ? "text-destructive" : "text-primary"}`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium text-sm truncate">{item.subCategory}</div>
                                          <div className="text-[10px] text-muted-foreground truncate">{item.mainCategory}</div>
                                        </div>
                                        <div className={`font-bold text-sm tabular-nums shrink-0 ${isOverdue ? "text-destructive" : ""}`}>
                                          {formatCurrency(item.amount)}
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </ScrollArea>
                    )}

                    {selectedDate && selectedItems.length > 0 && (
                      <div className="flex items-center gap-2 mt-3 p-2 rounded-md bg-primary/5 border border-primary/10">
                        <Move className="h-3.5 w-3.5 text-primary" />
                        <p className="text-[11px] text-primary/80">
                          ลากรายการไปวางบนวันอื่นในปฏิทินเพื่อเปลี่ยนวันชำระ
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Items List (Monthly Summary) */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    รายการทั้งหมดในเดือนนี้
                    {dueDateItems.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] ml-1">
                        {dueDateItems.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dueDateItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
                      <p className="text-sm font-medium">ไม่มีรายการที่ต้องชำระในเดือนนี้</p>
                      <p className="text-xs mt-1">กำหนดวันชำระได้ที่หน้าตั้งค่างบประมาณ</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {dueDateItems.map((item, idx) => {
                        const daysUntil = getDaysUntil(item.dueDate);
                        const isOverdue = daysUntil < 0;
                        const isUrgent = daysUntil >= 0 && daysUntil <= 3;
                        const IconComponent = CATEGORY_ICON_MAP[item.mainCategory] || Banknote;

                        return (
                          <div
                            key={`${item.mainCategory}-${item.subCategory}-${idx}`}
                            onClick={() => setSelectedDate(item.dueDate)}
                            className={`flex items-center gap-3 p-3 rounded-lg transition-colors border cursor-pointer
                              ${isOverdue
                                ? "bg-destructive/5 border-destructive/20 hover:bg-destructive/10"
                                : isUrgent
                                  ? "bg-primary/5 border-primary/15 hover:bg-primary/10"
                                  : "bg-card border-border/50 hover:bg-muted/30"
                              }
                            `}
                          >
                            <div className={`p-2 rounded-lg shrink-0 ${
                              isOverdue ? "bg-destructive/10" : "bg-primary/10"
                            }`}>
                              <IconComponent className={`h-4 w-4 ${
                                isOverdue ? "text-destructive" : "text-primary"
                              }`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{item.subCategory}</div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{formatThaiDate(item.dueDate)}</span>
                                {isOverdue && (
                                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                                    เลยกำหนด {Math.abs(daysUntil)} วัน
                                  </Badge>
                                )}
                                {isUrgent && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/40 text-primary">
                                    อีก {daysUntil} วัน
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className={`text-sm font-bold tabular-nums ${
                              isOverdue ? "text-destructive" : "text-foreground"
                            }`}>
                              {formatCurrency(item.amount)}
                            </div>
                          </div>
                        );
                      })}

                      <Separator className="my-2" />
                      <div className="flex items-center justify-between px-3 py-2">
                        <span className="text-sm font-medium text-muted-foreground">รวมทั้งหมด</span>
                        <span className="text-base font-bold">{formatCurrency(monthTotal)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </DragDropContext>
        </main>
        <AppFooter />
      </div>
    </>
  );
};

export default CalendarPage;
