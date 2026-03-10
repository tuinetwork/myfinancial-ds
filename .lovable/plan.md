

# แผน: เพิ่มตารางรายการงวดในหน้าปฏิทิน

## สรุป
เพิ่มตาราง (Table) แสดงรายการที่มีงวด (มี recurrence + start_date + end_date) ในหน้าปฏิทินการเงิน โดยแสดงข้อมูลคล้ายกับในหน้าตั้งค่า เช่น ชื่อรายการ, จำนวนเงิน, วันกำหนดชำระ, ความถี่, วันเริ่ม, วันสิ้นสุด, งวดที่ชำระแล้ว/ทั้งหมด, และยอดรวม

## ไฟล์ที่แก้ไข
**`src/pages/CalendarPage.tsx`**

## รายละเอียดทางเทคนิค

### 1. สร้างข้อมูลรายการงวด
- กรองจาก `dueDateItems` เฉพาะรายการที่มี `isRecurring = true`
- จัดกลุ่มตาม `subCategory` (เพราะรายการซ้ำจะมีหลาย occurrence ในเดือนเดียว)
- คำนวณงวดที่ชำระแล้ว vs งวดทั้งหมด โดยใช้ logic คล้ายกับ `getTotalOccurrences` ใน Settings.tsx
- ดึง `start_date`, `end_date`, `recurrence` จาก `mergedBudgets` เพื่อคำนวณ

### 2. เพิ่มตารางใต้ปฏิทิน (ก่อนตาราง "รายการทั้งหมดในเดือนนี้")
- ใช้ `Table` component จาก UI library
- คอลัมน์: ชื่อรายการ | จำนวนเงิน/งวด | วันกำหนดชำระ | ความถี่ | วันเริ่ม | วันสิ้นสุด | งวด (paid/total) | ยอดรวม
- แสดงเฉพาะเมื่อมีรายการงวด (ไม่แสดง Card ว่างเปล่า)
- งวดที่ชำระแล้วนับจาก `paid_dates` + tx matching ทั้งหมด (ข้ามเดือน)

### 3. ฟังก์ชันช่วย
- `getInstallmentData()` — extract recurring items จาก `mergedBudgets`, คำนวณ total occurrences, paid occurrences (จากทุกเดือน)
- ใช้ `expandRecurrence` + `matchTxToOccurrences` เพื่อนับงวดที่จ่ายแล้วจากทุกเดือน
- ใช้ `formatFrequencyThai` สำหรับแสดงความถี่
- ใช้ `formatThaiDate` สำหรับวันที่

