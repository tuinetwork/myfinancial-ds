import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronLeft, ChevronRight, GripVertical, X } from "lucide-react";
import { BudgetData } from "@/hooks/useBudgetData";
import { cn } from "@/lib/utils";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";

interface FinancialCalendarProps {
  data: BudgetData;
  onUpdateDueDate?: (category: string, subcategory: string, newDate: string) => void;
}

interface DueDateItem {
  id: string;
  name: string;
  category: string;
  categoryKey: string;
  amount: number;
  dueDate: string;
}

const THAI_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const THAI_DAYS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function formatThaiDateLong(date: Date): string {
  const day = date.getDate();
  const month = THAI_MONTHS[date.getMonth()];
  const buddhistYear = date.getFullYear() + 543;
  return `${day} ${month} ${buddhistYear}`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}

export function FinancialCalendar({ data, onUpdateDueDate }: FinancialCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Collect all items with due dates
  const dueDateItems = useMemo(() => {
    const items: DueDateItem[] = [];
    
    const categoryMap: Record<string, string> = {
      bills: "บิลและสาธารณูปโภค",
      debts: "หนี้สิน",
      subscriptions: "ค่าสมาชิกรายเดือน",
      savings: "เงินออมและการลงทุน",
    };
    
    for (const [key, mainCat] of Object.entries(categoryMap)) {
      const category = data.expenses[key as keyof typeof data.expenses];
      if (!category) continue;
      
      for (const item of category) {
        if (item.dueDate) {
          items.push({
            id: `${key}-${item.label}`,
            name: item.label,
            category: mainCat,
            categoryKey: key,
            amount: item.budget,
            dueDate: item.dueDate,
          });
        }
      }
    }
    
    return items;
  }, [data]);

  // Group items by date
  const itemsByDate = useMemo(() => {
    const map = new Map<string, DueDateItem[]>();
    for (const item of dueDateItems) {
      const dateKey = item.dueDate;
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(item);
    }
    return map;
  }, [dueDateItems]);

  // Get calendar days for current month
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const days: (Date | null)[] = [];
    
    // Add padding days from previous month
    const startPadding = firstDay.getDay();
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    // Add days of current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    
    return days;
  }, [currentMonth]);

  // Get items for selected date
  const selectedDateItems = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;
    return itemsByDate.get(dateKey) ?? [];
  }, [selectedDate, itemsByDate]);

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleDayClick = (date: Date) => {
    setSelectedDate(date);
    setModalOpen(true);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !onUpdateDueDate) return;
    
    const itemId = result.draggableId;
    const newDateKey = result.destination.droppableId;
    
    const item = dueDateItems.find(i => i.id === itemId);
    if (!item) return;
    
    onUpdateDueDate(item.category, item.name, newDateKey);
    setModalOpen(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            ปฏิทินการเงิน
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {THAI_MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear() + 543}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DragDropContext onDragEnd={handleDragEnd}>
          {/* Calendar Header */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {THAI_DAYS.map(day => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }
              
              const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              const dayItems = itemsByDate.get(dateKey) ?? [];
              const totalAmount = dayItems.reduce((sum, item) => sum + item.amount, 0);
              const isToday = isSameDay(date, today);
              const isPast = date < today;
              const hasItems = dayItems.length > 0;
              
              return (
                <Droppable key={dateKey} droppableId={dateKey}>
                  {(provided, snapshot) => (
                    <button
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      onClick={() => hasItems && handleDayClick(date)}
                      className={cn(
                        "aspect-square p-1 rounded-md text-xs flex flex-col items-center justify-start transition-colors relative",
                        isToday && "ring-2 ring-primary",
                        hasItems && "cursor-pointer hover:bg-muted",
                        isPast && hasItems && "bg-destructive/10",
                        !isPast && hasItems && "bg-primary/10",
                        snapshot.isDraggingOver && "bg-primary/20 ring-2 ring-primary",
                        !hasItems && "text-muted-foreground"
                      )}
                    >
                      <span className={cn(
                        "font-medium",
                        isToday && "text-primary"
                      )}>
                        {date.getDate()}
                      </span>
                      {hasItems && (
                        <div className="flex flex-col items-center mt-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <span className="text-[10px] text-primary font-medium mt-0.5 hidden sm:block">
                            {totalAmount >= 1000 ? `${(totalAmount / 1000).toFixed(0)}k` : totalAmount}
                          </span>
                        </div>
                      )}
                      {provided.placeholder}
                    </button>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      </CardContent>

      {/* Day Detail Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedDate && formatThaiDateLong(selectedDate)}</span>
              <span className="text-sm font-normal text-muted-foreground">
                รวม {selectedDateItems.reduce((s, i) => s + i.amount, 0).toLocaleString("th-TH")} ฿
              </span>
            </DialogTitle>
          </DialogHeader>
          
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={selectedDate ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}` : 'modal'}>
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-2 max-h-[300px] overflow-y-auto"
                >
                  {selectedDateItems.map((item, index) => (
                    <Draggable key={item.id} draggableId={item.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg bg-muted/50 transition-colors",
                            snapshot.isDragging && "shadow-lg bg-card ring-2 ring-primary"
                          )}
                        >
                          <div
                            {...provided.dragHandleProps}
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.category}</p>
                          </div>
                          <span className="text-sm font-medium tabular-nums shrink-0">
                            {item.amount.toLocaleString("th-TH")} ฿
                          </span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          
          {selectedDateItems.length === 0 && (
            <p className="text-center text-muted-foreground py-4">
              ไม่มีรายการในวันนี้
            </p>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
