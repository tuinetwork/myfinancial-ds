

## Plan: Budget Structure Migration — เพิ่ม due_date ในงบประมาณ

### Overview
เปลี่ยนโครงสร้างข้อมูล `expense_budgets` ของหมวด bills, debts, savings, subscriptions จากตัวเลขเป็น `{amount, due_date}` พร้อม Migration Script และปรับ UI ให้แสดง/แก้ไข due_date ด้วย Date Picker แบบ พ.ศ.

### Data Structure Change

```text
BEFORE (ทุกหมวด):
expense_budgets.บิลและสาธารณูปโภค.ค่าไฟ = 1000

AFTER (bills, debts, savings, subscriptions):
expense_budgets.บิลและสาธารณูปโภค.ค่าไฟ = { amount: 1000, due_date: "2026-03-15" }

UNCHANGED (ค่าใช้จ่ายทั่วไป):
expense_budgets.ค่าใช้จ่ายทั่วไป.อาหาร = 5000
```

### Affected Categories
- **เปลี่ยนเป็น Map**: บิลและสาธารณูปโภค, หนี้สิน, เงินออมและการลงทุน, ค่าสมาชิกรายเดือน
- **คงเดิม (number)**: ค่าใช้จ่ายทั่วไป

### Changes

#### 1. Migration Script (`src/scripts/migrateBudgetStructure.ts`)
- ฟังก์ชัน `runBudgetMigration()` เรียกจาก AdminPanel (ปุ่มสำหรับ dev/admin)
- วนทุก doc ใน `users` collection → วนทุก `budgets` subcollection
- แปลงค่า number → `{amount, due_date: null}` เฉพาะ 4 หมวดข้างต้น
- ข้ามถ้าค่าเป็น object อยู่แล้ว (idempotent)
- แสดง progress count

#### 2. AdminPanel — ปุ่ม Run Migration (`src/pages/AdminPanel.tsx`)
- เพิ่มปุ่ม "Migration โครงสร้างงบประมาณ" สำหรับ dev เท่านั้น
- แสดง progress และผลลัพธ์

#### 3. Type Updates
- **`BudgetTreeData`** ใน Settings: `expense_budgets` value เป็น `Record<string, number | {amount: number, due_date: string | null}>`
- **Helper functions**: `getAmount(val)` และ `getDueDate(val)` สำหรับอ่านค่าทั้ง format เก่าและใหม่

#### 4. Settings Budget UI (`src/pages/Settings.tsx`)
- **BudgetTable**: เพิ่มคอลัมน์ "วันกำหนดชำระ" แสดงเฉพาะหมวดที่ไม่ใช่ ค่าใช้จ่ายทั่วไป และ รายรับ
- **Date Picker**: ใช้ Popover + Calendar, แสดงวันที่เป็นภาษาไทย พ.ศ., บันทึกเป็น YYYY-MM-DD ค.ศ.
- **updateExpense**: รองรับ update ทั้ง amount และ due_date
- **handleSave**: serialize object format ก่อนส่ง Firestore

#### 5. Data Reading Layer (`src/hooks/useBudgetData.ts`, `src/hooks/useYearlyData.ts`)
- `parseBudgetDoc`: ตรวจ typeof value — ถ้าเป็น object ใช้ `.amount`, ถ้าเป็น number ใช้ตรง ๆ
- `BudgetItem` interface เพิ่ม optional `dueDate?: string`

#### 6. Category Sync (`src/pages/Settings.tsx` — CategorySettings.handleSave)
- เมื่อ sync subcategory ใหม่ไปยัง budgets: ใส่ `{amount: 0, due_date: null}` แทน `0` สำหรับ 4 หมวดที่เปลี่ยน

#### 7. Savings Goal Settings
- อ่าน `.amount` จาก object format แทน number ตรง

### Robustness
- ทุกจุดที่อ่านค่าจะเช็ค `typeof val === "number" ? val : val?.amount ?? 0` 
- due_date ที่ไม่มีจะแสดงเป็น "-"
- ไม่มี breaking change — format เก่ายังอ่านได้

### Migration Steps สำหรับผู้ใช้
1. Login เป็น dev/admin
2. ไปหน้า Admin Panel
3. กดปุ่ม "Migration โครงสร้างงบประมาณ"
4. รอจนแสดงผลสำเร็จ
5. ตรวจสอบหน้า Settings → งบประมาณ ว่ามีคอลัมน์ "วันกำหนดชำระ"

### Files to modify
- `src/scripts/migrateBudgetStructure.ts` (new)
- `src/pages/AdminPanel.tsx`
- `src/pages/Settings.tsx`
- `src/hooks/useBudgetData.ts`
- `src/hooks/useYearlyData.ts`

