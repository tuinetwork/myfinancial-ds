

## ปรับชื่อ Sub-category ให้กระชับด้วย Label Map

### สิ่งที่จะทำ

เพิ่ม `subCategoryLabelMap` ใน `AddTransactionFAB.tsx` เพื่อแสดงชื่อย่อภาษาอังกฤษบน badge แทนชื่อไทยยาวๆ โดยค่าที่บันทึกลง Firestore ยังคงเป็นภาษาไทยเดิม

### Label Map ที่จะเพิ่ม

```text
// บิลและสาธารณูปโภค
"ค่าไฟฟ้า" → "Electric"
"ค่าน้ำประปา" → "Water"
"ค่าอินเทอร์เน็ต" → "Internet"
"ค่าโทรศัพท์" → "Phone"
"ค่าเช่าบ้าน" → "Rent"
"ค่าส่วนกลาง" → "Common"

// ค่าใช้จ่ายทั่วไป
"ค่าอาหาร/เครื่องดื่ม" → "Food/Drink"
"ค่าเดินทาง" → "Transport"
"ค่าน้ำมัน" → "Fuel"
"ค่ารักษาพยาบาล" → "Medical"
"ค่าเสื้อผ้า" → "Clothes"
"ค่าของใช้" → "Supplies"
"ค่าบันเทิง" → "Fun"
"ค่าการศึกษา" → "Education"
"ค่าทำผม" → "Haircut"

// หนี้สิน
"ผ่อนบ้าน" → "Mortgage"
"ผ่อนรถ" → "Car Loan"
"ผ่อนบัตรเครดิต" → "Credit Card"
"ผ่อนสินเชื่อ" → "Loan"

// เงินออมและการลงทุน
"เงินออม" → "Savings"
"กองทุน" → "Fund"
"หุ้น" → "Stock"
"ประกันชีวิต" → "Life Ins."
"ประกันสุขภาพ" → "Health Ins."

// ค่าสมาชิกรายเดือน
"Netflix" → "Netflix"
"YouTube Premium" → "YouTube"
"Spotify" → "Spotify"

// ค่าดูแลเด็ก ๆ
"ค่าเทอม" → "Tuition"
"ค่านม/อาหาร" → "Baby Food"
"ค่าเสื้อผ้าเด็ก" → "Kids Clothes"

// รายรับ
"เงินเดือน" → "Salary"
"โบนัส" → "Bonus"
"ค่าล่วงเวลา" → "OT"
"เงินปันผล" → "Dividend"
"ดอกเบี้ย" → "Interest"
"ขายของ" → "Sales"
"ฟรีแลนซ์" → "Freelance"
```

### การแก้ไข

**ไฟล์**: `src/components/AddTransactionFAB.tsx`

1. เพิ่ม `subCategoryLabelMap` object หลัง `categoryLabelMap` (บรรทัด ~34)
2. ปรับ `getLabel` function ให้ค้นหาจากทั้ง `categoryLabelMap` และ `subCategoryLabelMap`
3. ใช้ `getLabel(sc)` แทน `{sc}` ในบรรทัด 345 ที่แสดงชื่อ sub-category บน badge
4. ถ้าไม่มีใน map → fallback แสดงชื่อเดิม (รองรับหมวดหมู่ที่ผู้ใช้สร้างเอง)

