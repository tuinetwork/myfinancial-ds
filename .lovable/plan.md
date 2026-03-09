

# แก้ไขการคำนวณ "คงเหลือ" สำหรับรายการซ้ำที่มี start_date/end_date

## ปัญหา
ปัจจุบัน `remaining = amount - actual` ซึ่งไม่ถูกต้องสำหรับรายการซ้ำ เช่น จ่ายรายสัปดาห์ 580 บาท ตั้งแต่ 7 มี.ค. - 14 มี.ค. (2 ครั้ง) ควรคำนวณเป็น `580 × 2 - actual`

## การแก้ไข — 1 ไฟล์: `src/pages/Settings.tsx`

### แก้ไขใน BudgetTable component

1. Import `expandRecurrence` จาก `src/lib/recurrence.ts`
2. เพิ่มฟังก์ชันคำนวณจำนวน occurrences:
   - ถ้ามี `recurrence` + `startDate` + `endDate` → ใช้ `expandRecurrence` นับจำนวนวันทั้งหมดในช่วง start-end
   - ถ้ามี `recurrence` แต่ไม่มี start/end → ใช้ `expandRecurrence` กับเดือนที่เลือกอยู่
   - ถ้าไม่มี `recurrence` → occurrences = 1
3. เปลี่ยนสูตร: `remaining = (amount × occurrences) - actual`
4. อัปเดต totalBudget ใน footer ให้ใช้สูตรเดียวกัน

### Props ที่ต้องเพิ่มใน BudgetTable
- `selectedPeriod: string` (เช่น "2026-03") เพื่อใช้ในการ expand recurrence สำหรับเดือนปัจจุบัน

