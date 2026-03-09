

## Plan: ระบบจัดการงบประมาณและปฏิทินอัจฉริยะ (Financial Calendar & Enhanced Budget System)

### Overview
อัปเกรดระบบงบประมาณทั้งหมดให้รองรับโครงสร้างข้อมูลใหม่ที่มี `is_due_date_enabled` toggle per main category, สร้างหน้าปฏิทินการเงินใหม่ และเพิ่ม Upcoming Bills widget บน Dashboard

### Data Schema Change

```text
CURRENT:
expense_budgets.บิลและสาธารณูปโภค.ค่าไฟ = { amount: 1000, due_date: "2026-03-15" }

NEW:
expense_budgets.บิลและสาธารณูปโภค = {
  is_due_date_enabled: true,
  sub_categories: {
    ค่าไฟ: { amount: 1000, due_date: "2026-03-15" }
  }
}

UNCHANGED (ค่าใช้จ่ายทั่วไป):
expense_budgets.ค่าใช้จ่ายทั่วไป = {
  is_due_date_enabled: false,
  sub_categories: {
    อาหาร: { amount: 5000, due_date: null }
  }
}
```

### Changes (8 files)

#### 1. Migration Script V2 (`src/scripts/migrateBudgetStructure.ts`)
- อัปเดต `runBudgetMigration()` ให้ migrate จากทั้ง format เก่า (number) และ format ปัจจุบัน ({amount, due_date}) ไปเป็น format ใหม่ที่มี `is_due_date_enabled` + `sub_categories` wrapper
- MAP_CATEGORIES จะได้ `is_due_date_enabled: false` (default off)
- ค่าใช้จ่ายทั่วไป ก็ต้อง migrate เป็นโครงสร้างเดียวกัน (sub_categories wrapper) แต่ `is_due_date_enabled: false`
- Idempotent: ถ้ามี `sub_categories` key อยู่แล้วจะข้าม

#### 2. Admin Panel (`src/pages/AdminPanel.tsx`)
- อัปเดต MigrationCard UI ให้แสดงว่าเป็น V2 migration (เพิ่ม is_due_date_enabled wrapper)
- ไม่มีการเปลี่ยนแปลงโครงสร้างใหญ่ — แค่เรียกฟังก์ชันใหม่

#### 3. Budget Data Hooks (`src/hooks/useBudgetData.ts`)
- อัปเดต `parseBudgetDoc()` ให้รองรับ 3 format: number, {amount, due_date}, และ {is_due_date_enabled, sub_categories}
- เพิ่ม `dueDate` ใน BudgetItem output

#### 4. Yearly Data Hook (`src/hooks/useYearlyData.ts`)
- เช่นเดียวกับ useBudgetData — อัปเดต parsing ให้รองรับ format ใหม่

#### 5. Settings Budget UI (`src/pages/Settings.tsx`)
- **BudgetTreeData type**: อัปเดตให้ expense_budgets value รองรับ `{is_due_date_enabled, sub_categories}` format
- **Toggle Switch**: เพิ่ม Switch component ที่หัวของแต่ละกลุ่มรายจ่ายหลักใน BudgetTable — "เปิดใช้งานการกำหนดวันชำระ"
- เมื่อ ON → แสดง DueDatePicker ท้ายแต่ละ subcategory
- เมื่อ OFF → ซ่อน DueDatePicker + set due_date = null ทั้งกลุ่ม
- อัปเดต `handleSave`, `updateExpense`, `updateExpenseDueDate` ให้ serialize ตาม format ใหม่
- อัปเดต `getAmount()`, `getDueDate()` helpers
- **Category Sync**: อัปเดต CategorySettings.handleSave ให้ init subcategory ใหม่ด้วย format ใหม่
- **New User init** ใน AdminPanel: อัปเดต `initializeNewUser` ให้สร้าง format ใหม่

#### 6. New Calendar Page (`src/pages/CalendarPage.tsx`)
- สร้างหน้าใหม่สำหรับปฏิทินการเงิน
- ดึง budget doc ของเดือนปัจจุบัน → filter เฉพาะ subcategories ที่มี due_date
- **Monthly Calendar Grid**: แสดงตารางปฏิทินรายเดือน พ.ศ.
- **Daily Aggregation**: แสดงยอดรวม amount ของรายการที่ due ในวันเดียวกัน
- **Click → Modal**: คลิกวันที่เปิด Dialog แสดงรายการทั้งหมดของวันนั้น
- **Drag & Drop**: ใช้ `@hello-pangea/dnd` (มีอยู่แล้ว) ให้ลาก item ไปวันอื่นได้ → อัปเดต due_date ใน Firestore real-time + toast
- **Month navigation**: เลื่อนเดือน ← →

#### 7. Sidebar + Routing (`src/components/AppSidebar.tsx`, `src/App.tsx`)
- เพิ่มเมนู "ปฏิทินการเงิน" ใน Sidebar (ไอคอน CalendarDays) ระหว่าง "วิเคราะห์" กับ "รายการธุรกรรม"
- เพิ่ม Route `/calendar` → CalendarPage

#### 8. Dashboard Upcoming Bills (`src/components/UpcomingBills.tsx`)
- Component ใหม่แสดงรายการบิลที่มี due_date ใกล้ที่สุด (5 รายการ)
- เรียงตามวันที่ใกล้สุด → ไกลสุด
- แสดง: ชื่อรายการ, จำนวนเงิน, วันครบกำหนด (พ.ศ.), สถานะ (เลยกำหนด/ใกล้กำหนด)
- เพิ่มใน `src/pages/Index.tsx` monthly view

### Robustness
- ทุก parsing function รองรับ 3 format (number, flat object, wrapped object) ด้วย type guard
- `due_date === null` แสดงเป็น "-"
- `is_due_date_enabled === undefined` ถือเป็น `false`
- ไม่มี breaking change — ข้อมูลเก่ายังอ่านได้

### Files Summary
| File | Action |
|------|--------|
| `src/scripts/migrateBudgetStructure.ts` | Update migration V2 |
| `src/pages/AdminPanel.tsx` | Update initializeNewUser |
| `src/hooks/useBudgetData.ts` | Update parsing for new format |
| `src/hooks/useYearlyData.ts` | Update parsing for new format |
| `src/pages/Settings.tsx` | Add Toggle + update data handling |
| `src/pages/CalendarPage.tsx` | **New** — Financial Calendar |
| `src/components/UpcomingBills.tsx` | **New** — Dashboard widget |
| `src/components/AppSidebar.tsx` | Add calendar menu item |
| `src/App.tsx` | Add /calendar route |
| `src/pages/Index.tsx` | Add UpcomingBills component |

