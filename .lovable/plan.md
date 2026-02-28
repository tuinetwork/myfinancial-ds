

## Plan: ใช้ Custom Document ID แบบ sequential สำหรับ transactions

### แนวทาง
แทนที่จะใช้ `addDoc` (สร้าง ID อัตโนมัติ) → ใช้ `setDoc` กับ `doc()` ที่ระบุ ID เอง โดย query transactions ที่มี `month_year` ตรงกัน หา ID ล่าสุดแล้ว +1

### ขั้นตอน

1. **แก้ `AddTransactionFAB.tsx`** - เพิ่มฟังก์ชัน `getNextTransactionId`:
   - Query transactions collection กรอง `month_year` ตรงกับเดือนที่เลือก
   - หา document ID ที่ขึ้นต้นด้วย `YYYY-MM-tx-` แล้วดึงเลขลำดับสูงสุด
   - สร้าง ID ถัดไป เช่น `2026-02-tx-085` (pad 3 หลัก)

2. **เปลี่ยน `addDoc` → `setDoc`** พร้อมใช้ `doc(collection, customId)`
   - Import `setDoc`, `doc`, `query`, `where` เพิ่ม
   - ใช้ ID ที่ generate ได้เป็น document ID

### รูปแบบ ID
`{YYYY}-{MM}-tx-{NNN}` เช่น `2026-02-tx-085`, `2026-03-tx-001`

