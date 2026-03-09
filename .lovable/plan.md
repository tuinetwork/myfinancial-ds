

# แผนอัปเกรดระบบรายการซ้ำ (Recurring Payments & RRULE)

## สรุปภาพรวม

เพิ่มระบบ Recurring Payments ลงในระบบงบประมาณที่มีอยู่ โดยขยาย Data Schema เพิ่มฟิลด์ `recurrence` (RRULE string), อัปเดต UI หน้าตั้งค่า, ปฏิทิน, Dashboard Upcoming Bills และ Admin Migration

## 1. Data Schema Update

ขยาย `BudgetValue` type ในทุกไฟล์ที่เกี่ยวข้อง:
```text
"ค่าแชร์": {
  "amount": 1740,
  "due_date": "2026-03-14",
  "recurrence": "FREQ=WEEKLY;BYDAY=SA"  // ← ฟิลด์ใหม่
}
```
- ถ้าไม่มี `recurrence` → ถือเป็น one-time payment (backward compatible, null-safe)

## 2. ไฟล์ที่ต้องแก้ไข

### 2.1 `src/pages/Settings.tsx` — เพิ่ม Frequency Picker
- ขยาย `BudgetValue` type เพิ่ม `recurrence?: string | null`
- เพิ่ม `FrequencyPicker` component (Select dropdown) ข้าง DueDatePicker ในตาราง
  - ตัวเลือก: "จ่ายครั้งเดียว", "รายวัน", "รายสัปดาห์ (จันทร์-อาทิตย์)", "รายเดือน"
  - แปลงเป็น RRULE string: `null`, `FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=SA`, `FREQ=MONTHLY`
  - วันในสัปดาห์ดึงจาก due_date ที่เลือกโดยอัตโนมัติ
- เพิ่มคอลัมน์ "ความถี่" ใน `BudgetTable` (แสดงเมื่อ dueDateEnabled)
- อัปเดต `updateExpense`, `updateExpenseDueDate` ให้เก็บ `recurrence` ด้วย
- อัปเดต `handleSave` ให้บันทึก `recurrence` ลง Firestore

### 2.2 `src/pages/CalendarPage.tsx` — แสดงรายการซ้ำบนปฏิทิน
- สร้าง utility function `expandRecurrence(dueDate, rrule, year, month)` ที่คำนวณวันที่ทั้งหมดในเดือนจาก RRULE
  - `FREQ=WEEKLY;BYDAY=SA` → ทุกวันเสาร์ในเดือน
  - `FREQ=MONTHLY` → วันเดียวกันทุกเดือน
  - `FREQ=DAILY` → ทุกวัน
- ขยาย `DueDateItem` เพิ่ม `isRecurring: boolean`
- อัปเดต `extractDueDateItems` ให้เรียก `expandRecurrence` สำหรับรายการที่มี `recurrence`
- แสดงไอคอน 🔄 (หรือ `RefreshCw` icon) กำกับรายการซ้ำในวันปฏิทินและ side panel
- อัปเดต Summary Cards เพิ่มจำนวนรายการซ้ำ

### 2.3 `src/components/UpcomingBills.tsx` — แสดงรายการซ้ำที่กำลังจะมาถึง
- สร้าง `expandRecurrence` utility (shared) เพื่อคำนวณ upcoming occurrences
- ขยายลูปที่สร้าง `BillItem[]` ให้ expand รายการซ้ำเป็นหลาย occurrences ในเดือนปัจจุบัน
- เพิ่ม `isRecurring` flag ใน `BillItem` interface
- แสดง Badge 🔄 สำหรับรายการซ้ำ
- คำนวณ `isPaid` ต่อ occurrence (หาร actual ด้วยจำนวน occurrences ที่ผ่านมาแล้ว)

### 2.4 `src/hooks/useBudgetData.ts` — ขยาย BudgetItem
- เพิ่ม `recurrence?: string | null` ใน `BudgetItem` interface
- อัปเดต parsing logic ให้อ่าน `recurrence` จาก Firestore data

### 2.5 `src/hooks/useYearlyData.ts` — อัปเดต parsing
- อัปเดต `parseBudgetDocForYear` ให้อ่าน `recurrence` field

### 2.6 `src/lib/recurrence.ts` — Utility ใหม่ (Shared)
- สร้างไฟล์ใหม่สำหรับ RRULE logic:
  - `parseRRule(rrule: string)` → parse RRULE string เป็น object
  - `expandRecurrence(startDate, rrule, year, month)` → คืน array ของวันที่ในเดือน
  - `formatFrequencyThai(rrule)` → แสดงผลภาษาไทย ("ทุกวันเสาร์", "รายเดือน")
  - `buildRRule(freq, dayOfWeek?)` → สร้าง RRULE string
- ไม่ใช้ library ภายนอก — เขียน parser เองสำหรับ subset ที่ใช้ (FREQ, BYDAY)

### 2.7 `src/scripts/migrateBudgetStructure.ts` — เพิ่ม recurrence field
- อัปเดต migration script ให้เพิ่ม `recurrence: null` ใน MAP_CATEGORIES items ที่ยังไม่มี

### 2.8 `src/pages/AdminPanel.tsx` — อัปเดต Migration button
- อัปเดตปุ่ม "Run Data Migration" ที่มีอยู่แล้วให้ครอบคลุม recurrence field
- แสดง status ของ migration (จำนวน users, budgets ที่ migrate แล้ว)

## 3. RRULE Subset ที่รองรับ

```text
FREQ=DAILY                    → ทุกวัน
FREQ=WEEKLY;BYDAY=MO          → ทุกวันจันทร์
FREQ=WEEKLY;BYDAY=SA          → ทุกวันเสาร์
FREQ=MONTHLY                  → ทุกเดือน (วันเดียวกับ due_date)
null / undefined              → จ่ายครั้งเดียว (default)
```

## 4. Null-safe & Backward Compatibility

- ทุกจุดที่อ่าน `recurrence` ใช้ `val?.recurrence ?? null`
- รายการเก่าที่ไม่มี `recurrence` ทำงานปกติเป็น one-time
- ไม่มี breaking change กับข้อมูลที่มีอยู่

## 5. ลำดับการทำงาน

1. สร้าง `src/lib/recurrence.ts` (shared utility)
2. อัปเดต `useBudgetData.ts` + `useYearlyData.ts` (types)
3. อัปเดต `Settings.tsx` (Frequency Picker + save)
4. อัปเดต `CalendarPage.tsx` (expand & display recurring)
5. อัปเดต `UpcomingBills.tsx` (expand recurring)
6. อัปเดต `migrateBudgetStructure.ts` + `AdminPanel.tsx`

