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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { CalendarDays, ChevronLeft, ChevronRight, Home, GripVertical } from "lucide-react";
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

function formatThaiDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDate();
  const thaiMonth = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][d.getMonth()];
  const buddhistYear = d.getFullYear() + 543;
  return `${day} ${thaiMonth} ${buddhistYear}`;
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
            items.push({
              mainCategory: mainCat,
              subCategory: subCat,
              amount: subVal.amount ?? 0,
              dueDate: subVal.due_date,
            });
          }
        }
      }
    } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
      // V1 flat format: { subCat: { amount, due_date } }
      for (const [subCat, subVal] of Object.entries(val as Record<string, unknown>)) {
        if (typeof subVal === "object" && subVal !== null && "due_date" in subVal) {
          const v = subVal as { amount?: number; due_date?: string | null };
          if (v.due_date) {
            if (!filterMonth || v.due_date.startsWith(filterMonth)) {
              items.push({
                mainCategory: mainCat,
                subCategory: subCat,
                amount: v.amount ?? 0,
                dueDate: v.due_date,
              });
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
  const [modalOpen, setModalOpen] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const period = `${year}-${String(month + 1).padStart(2, "0")}`;

  // Listen to budget doc for the current period
  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const docRef = doc(firestore, "users", userId, "budgets", period);
    
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setExpenseBudgets((data.expense_budgets ?? {}) as Record<string, ExpenseBudgetValue>);
      } else {
        setExpenseBudgets({});
      }
      setLoading(false);
    });

    return () => unsub();
  }, [userId, period]);

  const dueDateItems = useMemo(() => {
    return extractDueDateItems(expenseBudgets, period);
  }, [expenseBudgets, period]);

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

  const days = getDaysInMonth(year, month);
  const startPadding = getStartPadding(year, month);

  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleDateClick = (dateStr: string) => {
    if (itemsByDate[dateStr]?.length) {
      setSelectedDate(dateStr);
      setModalOpen(true);
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
      const updated = {
        ...catData,
        sub_categories: {
          ...catData.sub_categories,
          [subCat]: {
            ...catData.sub_categories[subCat],
            due_date: newDate,
          },
        },
      };
      budgets[mainCat] = updated;
    } else if (typeof catData === "object" && catData !== null) {
      const flat = catData as Record<string, { amount: number; due_date?: string | null }>;
      flat[subCat] = { ...flat[subCat], due_date: newDate };
      budgets[mainCat] = flat as ExpenseBudgetValue;
    }

    await updateDoc(docRef, { expense_budgets: budgets });
    toast({
      title: "อัปเดตวันชำระสำเร็จ",
      description: `${subCat} → ${formatThaiDate(newDate)}`,
    });
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;

    const sourceDate = result.source.droppableId;
    const destDate = result.destination.droppableId;

    if (sourceDate === destDate) return;

    const sourceItems = itemsByDate[sourceDate];
    if (!sourceItems) return;

    const item = sourceItems[result.source.index];
    if (!item) return;

    await updateDueDate(item.mainCategory, item.subCategory, destDate);
    setModalOpen(false);
    setSelectedDate(null);
  };

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

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
          <div className="space-y-4">
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

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                  <CardTitle className="text-lg">
                    {THAI_MONTHS[month]} {year + 543}
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={goToNextMonth}>
                    <ChevronRight className="h-5 w-5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="grid grid-cols-7 gap-1">
                    {[...Array(35)].map((_, i) => (
                      <Skeleton key={i} className="h-20 rounded" />
                    ))}
                  </div>
                ) : (
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <div className="grid grid-cols-7 gap-1">
                      {/* Weekday headers */}
                      {THAI_WEEKDAYS.map((day) => (
                        <div
                          key={day}
                          className="text-center text-xs font-medium text-muted-foreground py-2"
                        >
                          {day}
                        </div>
                      ))}

                      {/* Empty padding cells */}
                      {[...Array(startPadding)].map((_, i) => (
                        <div key={`pad-${i}`} className="h-20" />
                      ))}

                      {/* Day cells */}
                      {days.map((d) => {
                        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        const dayItems = itemsByDate[dateStr] || [];
                        const total = totalByDate[dateStr] || 0;
                        const isToday = dateStr === todayStr;
                        const hasItems = dayItems.length > 0;

                        return (
                          <Droppable droppableId={dateStr} key={dateStr}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                onClick={() => handleDateClick(dateStr)}
                                className={`h-20 p-1 rounded border text-xs transition-colors cursor-pointer
                                  ${isToday ? "border-primary bg-primary/5" : "border-border"}
                                  ${snapshot.isDraggingOver ? "bg-accent/50 border-accent" : ""}
                                  ${hasItems ? "hover:bg-muted/50" : ""}
                                `}
                              >
                                <div className={`font-medium mb-1 ${isToday ? "text-primary" : ""}`}>
                                  {d.getDate()}
                                </div>
                                {total > 0 && (
                                  <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                                    {formatCurrency(total)}
                                  </Badge>
                                )}
                                {dayItems.length > 1 && (
                                  <div className="text-[10px] text-muted-foreground mt-0.5">
                                    {dayItems.length} รายการ
                                  </div>
                                )}
                                {provided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        );
                      })}
                    </div>
                  </DragDropContext>
                )}
              </CardContent>
            </Card>

            {/* Summary */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">รายการในเดือนนี้</CardTitle>
              </CardHeader>
              <CardContent>
                {dueDateItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground">ไม่มีรายการที่ต้องชำระในเดือนนี้</p>
                ) : (
                  <div className="space-y-2">
                    {dueDateItems.map((item, idx) => (
                      <div
                        key={`${item.mainCategory}-${item.subCategory}-${idx}`}
                        className="flex items-center justify-between py-2 border-b border-border last:border-0"
                      >
                        <div>
                          <div className="font-medium text-sm">{item.subCategory}</div>
                          <div className="text-xs text-muted-foreground">{formatThaiDate(item.dueDate)}</div>
                        </div>
                        <div className="font-semibold text-sm">{formatCurrency(item.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
        <AppFooter />
      </div>

      {/* Day Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              รายการวันที่ {selectedDate ? formatThaiDate(selectedDate) : ""}
            </DialogTitle>
          </DialogHeader>
          {selectedDate && itemsByDate[selectedDate] && (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId={selectedDate}>
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {itemsByDate[selectedDate].map((item, index) => (
                      <Draggable
                        key={`${item.mainCategory}-${item.subCategory}`}
                        draggableId={`${item.mainCategory}-${item.subCategory}`}
                        index={index}
                      >
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-3 p-3 rounded-lg border transition-shadow ${
                              snapshot.isDragging ? "shadow-lg bg-card" : "bg-muted/30"
                            }`}
                          >
                            <div {...provided.dragHandleProps} className="cursor-grab">
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1">
                              <div className="font-medium">{item.subCategory}</div>
                              <div className="text-xs text-muted-foreground">{item.mainCategory}</div>
                            </div>
                            <div className="font-semibold">{formatCurrency(item.amount)}</div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
          <p className="text-xs text-muted-foreground mt-2">
            ลากรายการไปวางบนวันอื่นในปฏิทินเพื่อเปลี่ยนวันชำระ
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CalendarPage;
