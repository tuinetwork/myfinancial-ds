

# เพิ่มระบบ Tolerance ±3 วัน สำหรับจับคู่ธุรกรรมกับวันกำหนดชำระ

## ปัญหา
ปัจจุบันระบบรวมยอดธุรกรรมตาม subcategory ทั้งเดือนแล้วหารด้วยจำนวนเงินต่อครั้ง → ไม่สามารถจับคู่ธุรกรรมเฉพาะวันกับ occurrence เฉพาะวันได้ เช่น กำหนดจ่ายวันเสาร์แต่จ่ายจริงวันพฤหัสบดี (ก่อน 2 วัน) ระบบไม่รู้ว่าจ่ายแล้ว

## แนวทางแก้ไข

เปลี่ยนจากการรวมยอดรวม (`txActuals: Record<string, number>`) เป็นเก็บรายการแยกวัน (`txBySubAndDate: Record<string, {date: string, amount: number}[]>`) แล้วจับคู่แต่ละ occurrence กับธุรกรรมที่อยู่ในช่วง ±3 วัน

## การแก้ไข — 2 ไฟล์

### 1. `src/pages/CalendarPage.tsx`

**เปลี่ยน txActuals state** จาก `Record<string, number>` เป็น `Record<string, {date: string, amount: number}[]>` (รายการธุรกรรมแยกตามวัน)

**แก้ fetch transactions** (บรรทัด ~202-217): เก็บ array ของ `{date, amount}` แทนการรวมยอด

**แก้ `extractDueDateItems`**: เปลี่ยน parameter จาก `txActuals: Record<string, number>` เป็น `txBySubDate: Record<string, {date: string, amount: number}[]>` แล้วใช้ logic ใหม่:
- สำหรับแต่ละ occurrence date → หา transactions ที่ `|txDate - occurrenceDate| <= 3 วัน`
- ถ้ารวมยอดได้ >= amount ของ occurrence → ถือว่า paid
- Transaction ที่ถูกจับคู่แล้วจะไม่ถูกใช้ซ้ำกับ occurrence อื่น

### 2. `src/pages/Settings.tsx`

**เปลี่ยน txActuals state** เป็น `Record<string, {date: string, amount: number}[]>` เช่นเดียวกัน

**แก้ fetch transactions** (บรรทัด ~607-618): เก็บ array แยกวัน

**แก้ BudgetTable**: ส่ง txByDate ลงไป เพื่อคำนวณ actual ตาม tolerance — สำหรับแต่ละ occurrence date ของ recurring item ให้นับ transactions ที่อยู่ในช่วง ±3 วัน

### Logic จับคู่ ±3 วัน (ใช้ร่วมกัน)
```text
function matchTxToOccurrences(
  txList: {date, amount}[],
  occurrenceDates: string[],
  perOccurrence: number
): Map<string, boolean>  // occurrence date → isPaid

สำหรับแต่ละ occurrence (เรียงตามวันที่):
  1. หา tx ที่ |txDate - occDate| <= 3 วัน
  2. ถ้ารวมยอด tx ที่จับคู่ได้ >= perOccurrence → isPaid = true
  3. ลบ tx ที่ใช้แล้วออกจาก pool (ไม่ซ้ำกับ occurrence อื่น)
```

### ผลลัพธ์
- จ่ายก่อนกำหนด 1-3 วัน → แสดง ✓ ชำระแล้ว
- จ่ายเลท 1-3 วัน → แสดง ✓ ชำระแล้ว
- ไม่กระทบ `paid_dates` (manual) ที่มีอยู่เดิม — ยังทำงานเหมือนเดิม

