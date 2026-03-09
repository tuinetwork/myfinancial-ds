

# แก้ไขปฏิทินให้แสดงสถานะ "ชำระแล้ว" + ขีดฆ่า

## ปัญหา
รายการซ้ำ (recurring) บนปฏิทินไม่แสดงสถานะ "ชำระแล้ว" แม้จะมีธุรกรรมจริงที่ตรงกัน เพราะ `extractDueDateItems` ตรวจสอบเฉพาะ `paid_dates` array สำหรับรายการซ้ำ โดยไม่ดูยอดธุรกรรมจริง (`txActuals`)

## การแก้ไข — 1 ไฟล์: `src/pages/CalendarPage.tsx`

### 1. แก้ `extractDueDateItems` (บรรทัด ~109-125)
สำหรับรายการซ้ำ เพิ่มการตรวจสอบ `txActuals` ด้วย:
- คำนวณจำนวน occurrences ที่ transaction amount ครอบคลุมได้: `coveredByTx = floor(paidAmount / perOccurrence)`
- เรียงตามวันที่ — occurrence แรกๆ ที่ยังไม่มีใน `paid_dates` จะถูก mark เป็น paid จาก transaction
- `isPaid = isPaidByDate || isPaidByTx`

### 2. แก้ Amount badge (บรรทัด ~577-588)
เพิ่ม `line-through` เมื่อ `allPaid`:
```
${allPaid ? "line-through bg-accent/15 text-accent" : ...}
```

### 3. แสดง "ชำระแล้ว" เมื่อบางรายการจ่ายแล้ว (บรรทัด ~590-595)
เพิ่มกรณี `somePaid` (บางรายการจ่ายแล้ว) ให้แสดง "ชำระบางส่วน" ด้วย หรืออย่างน้อยแสดงสถานะจ่ายแล้วเมื่อ `allPaid`

ผลลัพธ์: รายการซ้ำที่มีธุรกรรมจริงตรงกัน จะแสดง ✓ ชำระแล้ว + ขีดฆ่ายอดเงิน บนปฏิทินอัตโนมัติ

