

## Plan: ย้ายจาก Realtime Database ไป Firestore

### โครงสร้าง Firestore
```text
users/xgkdmyxxeJVlNiqoahNJWBekqmh2/
├── budgets/{period}  (e.g. "2026-01")
│   ├── period: "2026-01"
│   ├── carry_over: number
│   ├── income_estimates: { "เงินเดือน": 30000, ... }
│   └── expense_budgets: {
│         "ค่าใช้จ่ายทั่วไป": { "อาหาร": 5000, ... },
│         "บิลและสาธารณูปโภค": { ... },
│         "หนี้สิน": { ... },
│         "ค่าสมาชิกรายเดือน": { ... },
│         "เงินออมและการลงทุน": { ... }
│       }
└── transactions/{txId}
    ├── amount, date ("YYYY-MM-DD"), type ("income"/"expense")
    ├── main_category, sub_category, month_year ("2026-01"), note
```

### ไฟล์ที่แก้ไข

**1. `src/lib/firebase.ts`**
- เพิ่ม `import { getFirestore }` และ `export const firestore = getFirestore(app)`

**2. `src/hooks/useBudgetData.ts`** — เขียนใหม่ทั้งหมด
- **useAvailableMonths**: query `budgets` collection → ดึง period ทุก doc, แปลง "2026-01" เป็นชื่อเดือนไทย, เรียงจากล่าสุดไปเก่าสุด, ใช้ `onSnapshot` สำหรับ realtime
- **useBudgetData(period)**: ดึง budget doc + query transactions ที่ `month_year == period`
  - `income_estimates` → flatten เป็น `BudgetItem[]`
  - `expense_budgets` mapping:
    - "ค่าใช้จ่ายทั่วไป" → `expenses.general`
    - "บิลและสาธารณูปโภค" → `expenses.bills`
    - "หนี้สิน" → `expenses.debts`
    - "ค่าสมาชิกรายเดือน" → `expenses.subscriptions`
    - "เงินออมและการลงทุน" → `expenses.savings`
  - Transaction type mapping:
    - `type:"income"` → "รายรับ"
    - `type:"expense"` + main_category ต่างๆ → "ค่าใช้จ่าย" / "หนี้สิน" / "บิล/สาธารณูปโภค" / "ค่าสมาชิกรายเดือน" / "เงินออม/การลงทุน"
  - Transaction: `sub_category` → `category`, `note` → `description`
- **BudgetData interface**: เพิ่ม optional `carryOver?: number` field
- **MonthOption**: ใช้ period เป็น key แทน path

**3. `src/hooks/useYearlyData.ts`** — เปลี่ยนเป็น Firestore
- Query budgets ที่ period ขึ้นต้นด้วยปีที่เลือก + transactions ที่ month_year ตรงกัน
- ใช้ logic เดิมในการ merge months

**4. `src/pages/Index.tsx`** — ปรับ carry-over logic
- ใช้ `carry_over` จาก budget doc โดยตรงแทนการคำนวณจากเดือนก่อน
- ลบ `previousPath` และ `prevData` logic ออก
- ปรับ `selectedPath` → `selectedPeriod` (ใช้ period string เช่น "2026-01")

**5. `src/components/TransactionTable.tsx`**
- รองรับ date format `YYYY-MM-DD`

### Technical Notes
- User ID hardcode เป็น constant: `const USER_ID = "xgkdmyxxeJVlNiqoahNJWBekqmh2"`
- BudgetData interface เดิมยังคงใช้ได้ ไม่กระทบ component อื่น
- Realtime updates ใช้ `onSnapshot` แทน `onValue`

