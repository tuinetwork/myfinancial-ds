

# แผนอัปเกรดระบบงบประมาณ — เพิ่ม `paid_dates`, `start_date`, `end_date`

## สรุปภาพรวม

ขยาย Data Schema จาก `{ amount, due_date, recurrence }` เป็น `{ amount, due_date, recurrence, start_date, end_date, paid_dates }` พร้อมอัปเดต UI ทุกจุดให้รองรับการ Mark as Paid แบบรายวัน, กำหนดช่วงเวลาของรายการซ้ำ, และ Migration script ใหม่

## 1. Data Schema ใหม่

```text
"ค่าแชร์": {
  "amount": 1740,
  "due_date": "2026-03-14",
  "recurrence": "FREQ=WEEKLY;BYDAY=SA",
  "start_date": "2026-01-01" | null,
  "end_date": "2026-12-31" | null,
  "paid_dates": ["2026-03-07", "2026-03-14"]
}
```

## 2. ไฟล์ที่ต้องแก้ไข (7 ไฟล์)

### 2.1 `src/pages/Settings.tsx`
- ขยาย `BudgetValue` type เพิ่ม `start_date`, `end_date`, `paid_dates`
- เพิ่ม helper functions: `getStartDate()`, `getEndDate()`, `getPaidDates()`
- เพิ่ม UI ในตาราง BudgetTable เมื่อ dueDateEnabled:
  - คอลัมน์ "วันเริ่ม" (DueDatePicker) และ "วันสิ้นสุด" (DueDatePicker + ปุ่ม "ไม่มีกำหนด")
  - แสดงเฉพาะเมื่อเลือกความถี่ที่ไม่ใช่ "จ่ายครั้งเดียว"
- อัปเดต `updateExpense`, `updateExpenseDueDate`, `updateExpenseRecurrence` ให้เก็บฟิลด์ใหม่
- เพิ่ม handlers: `updateStartDate()`, `updateEndDate()`
- อัปเดต `handleToggleDueDate` ให้ reset `start_date`, `end_date`, `paid_dates` เป็น null/[] เมื่อปิด

### 2.2 `src/pages/CalendarPage.tsx`
- ขยาย `DueDateItem` เพิ่ม `paidDates: string[]`
- อัปเดต `extractDueDateItems`: ตรวจสอบ `start_date`/`end_date` ก่อน expand — ไม่แสดงรายการนอกช่วง
- ตรวจสอบ `isPaid` per occurrence: `paidDates.includes(expandedDate)`
- เพิ่มปุ่ม "Mark as Paid" ใน side panel สำหรับแต่ละรายการ
  - เมื่อคลิก → เพิ่มวันที่ลง `paid_dates` array ใน Firestore (arrayUnion)
  - รายการที่จ่ายแล้ว → ขีดฆ่า + สีเทา + CheckCircle สีเขียว
- เพิ่มปุ่ม "Undo" เพื่อลบวันที่ออกจาก `paid_dates` (arrayRemove)

### 2.3 `src/components/UpcomingBills.tsx`
- อ่าน `paid_dates` จาก BudgetItem (ผ่าน useBudgetData)
- ตรวจสอบ `isPaid` per occurrence: ถ้าวันที่อยู่ใน `paid_dates` → ถือว่าจ่ายแล้ว
- ซ่อน/ย้ายรายการที่อยู่ใน `paid_dates` ไปด้านล่าง

### 2.4 `src/hooks/useBudgetData.ts`
- เพิ่มฟิลด์ใน `BudgetItem`: `startDate`, `endDate`, `paidDates`
- อัปเดต parsing logic ใน expense categories ให้อ่านฟิลด์ใหม่

### 2.5 `src/hooks/useYearlyData.ts`
- อัปเดต parsing ให้รองรับฟิลด์ `start_date`, `end_date`, `paid_dates`

### 2.6 `src/lib/recurrence.ts`
- อัปเดต `expandRecurrence` ให้รับ optional `startDate`/`endDate` parameter
- กรองผลลัพธ์ให้อยู่ในช่วง start_date - end_date เท่านั้น

### 2.7 `src/scripts/migrateBudgetStructure.ts`
- อัปเดต migration ให้เพิ่ม `start_date: null`, `end_date: null`, `paid_dates: []` สำหรับรายการที่ยังไม่มี

### 2.8 `src/pages/AdminPanel.tsx`
- อัปเดตคำอธิบาย MigrationCard ให้สะท้อนฟิลด์ใหม่ทั้งหมด

### 2.9 `src/pages/AdminPanel.tsx` — `initializeNewUser()`
- อัปเดต deep reset ให้สร้างโครงสร้าง Map พร้อม `paid_dates: []`, `is_due_date_enabled: false` ตั้งแต่เริ่มต้น

## 3. ลำดับการทำงาน

1. อัปเดต `src/lib/recurrence.ts` (เพิ่ม date range filtering)
2. อัปเดต `src/scripts/migrateBudgetStructure.ts` (เพิ่มฟิลด์ใหม่)
3. อัปเดต `src/hooks/useBudgetData.ts` + `useYearlyData.ts` (types + parsing)
4. อัปเดต `src/pages/Settings.tsx` (UI: start/end date, paid_dates handling)
5. อัปเดต `src/pages/CalendarPage.tsx` (Mark as Paid, date range filter, strikethrough)
6. อัปเดต `src/components/UpcomingBills.tsx` (paid_dates-based isPaid)
7. อัปเดต `src/pages/AdminPanel.tsx` (migration description + initializeNewUser)

## 4. Backward Compatibility

- ฟิลด์ใหม่ทั้งหมดเป็น optional: `start_date ?? null`, `end_date ?? null`, `paid_dates ?? []`
- ข้อมูลเก่าทำงานปกติ — ไม่มี breaking change
- รายการที่ไม่มี `end_date` ถือเป็น infinite (ไม่มีวันสิ้นสุด)

