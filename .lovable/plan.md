## ปัญหา

หลัง revert โค้ด — โค้ดกลับไปก่อนแก้ logic carry_over แล้ว แต่ค่า `carry_over` ใน Firestore ยังถูกเขียนทับเป็นเวอร์ชันใหม่ (จากตอนที่โค้ดใหม่รันและ auto-sync ไปแล้ว) ทำให้ตัวเลขยกยอดผิดเพี้ยน

โค้ดมี auto-sync อยู่แล้วใน `useBudgetData.ts` (`syncCarryOver`) — เมื่อโหลดข้อมูลเดือนใดก็จะ:

1. อ่าน carry_over ของเดือนก่อน + รายรับ-รายจ่ายของเดือนก่อน
2. คำนวณใหม่ แล้วเขียนทับเดือนปัจจุบันถ้าต่างเกิน 0.01

ดังนั้นปัญหาน่าจะคือเดือนเก่าๆ ยัง "ฝัง" ค่า carry_over ผิดอยู่ ทำให้เดือนถัดมาคำนวณจากฐานที่ผิด → ผิดทบไปทั้งสาย

## เป้าหมาย

สร้างเครื่องมือ "Recalculate Carry-Over" ใน Command Center ที่:

1. **Dry-run (Diff Preview)**: สแกนทุกเดือนของ user คำนวณ carry_over ที่ถูกต้องจากศูนย์ แล้วแสดงตารางเทียบ "ค่าปัจจุบันใน Firestore" vs "ค่าที่ควรจะเป็น" — ยังไม่เขียนอะไร
2. **Apply**: หลังผู้ใช้ตรวจสอบแล้วกดยืนยัน ค่อยเขียนทับ Firestore ทีละเดือน (เฉพาะเดือนของตัวเอง — `userId === auth.uid`)

## วิธีคำนวณที่ถูกต้อง

เรียงเดือนจากเก่าไปใหม่ (`YYYY-MM` sort ได้ตรง):

- เดือนแรกสุด: `carry_over = 0`
- เดือนถัดไป: `carry_over = prev.carry_over + prev.income - prev.expenses` (ตรงนี้ให้นับ transfer  เข้าไปด้วยเพื่อจะได้ตรงกับยอดเงินจริง ๆ ในกระเป๋า)

ทำงานบน client-side เรียก Firestore ผ่าน SDK ปกติ (Firestore rules อนุญาต owner เขียน budgets ของตัวเองอยู่แล้ว — ไม่ต้องแก้ rules)

## การเปลี่ยนแปลง

### 1. ไฟล์ใหม่: `src/lib/carry-over-recalc.ts`

- `computeCorrectCarryOvers(userId)` — return array `[{period, current, correct, diff}]`
- `applyCarryOverFix(userId, rows)` — `setDoc(..., {carry_over}, {merge:true})` เฉพาะแถวที่ `Math.abs(diff) > 0.01`

### 2. แก้ `src/pages/CommandCenter.tsx`

- เพิ่ม Card ใหม่ "🔧 Recalculate Carry-Over (เฉพาะบัญชีคุณ)"
- 2 ปุ่ม: **"คำนวณใหม่ (Preview)"** และ **"Apply"** (disable จนกว่าจะ preview)
- แสดงตารางผลต่าง: เดือน | ปัจจุบัน | ที่ถูกต้อง | ผลต่าง (highlight แดง/เขียว)
- เขียน log เข้า logs panel ที่มีอยู่แล้ว

### 3. (ทางเลือก) ปุ่ม "ลบ carry_over ออกจากทุกเดือน"

เพื่อให้ `syncCarryOver` ของโค้ดเก่าทำงาน fallback "full scan" ใหม่อัตโนมัติเมื่อเปิดแต่ละเดือน — แต่จะช้ากว่าและเดือนที่ไม่ได้เปิดจะไม่ถูก sync จึง**ไม่แนะนำ** ใช้วิธีหลักด้านบนดีกว่า

## ความปลอดภัย

- ทำงานใน Command Center ที่ผ่าน 2FA + idle timeout อยู่แล้ว
- ใช้ `auth.currentUser.uid` เป็นเป้าหมาย → กระทบเฉพาะข้อมูลตัวเอง
- มีขั้น Preview บังคับก่อน Apply
- ไม่แตะ collection อื่นนอกจาก `users/{uid}/budgets/{period}` field `carry_over`

## หลัง Apply

เปิดแต่ละหน้า (Dashboard / Overview) ค่าจะตรงทันทีเพราะ React Query refetch + `syncCarryOver` ที่มีอยู่จะเห็นว่าตรงแล้ว ไม่เขียนซ้ำ