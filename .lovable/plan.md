

## Plan: ระบบการจัดการการเงินครบวงจร — Due Date Tracking + Smart Calendar

### Overview
อัปเกรดระบบงบประมาณให้รองรับการเปิด/ปิดฟีเจอร์ Due Date ในระดับกลุ่มหลัก พร้อมปฏิทินการเงินอัจฉริยะและ Dashboard ที่แสดงบิลที่ใกล้ถึงกำหนดชำระ

---

### 1. Data Structure Changes

**New Schema:**
```json
"expense_budgets": {
  "บิลและสาธารณูปโภค": {
    "is_due_date_enabled": true,
    "sub_categories": {
      "ค่าไฟ": { "amount": 1500, "due_date": "2026-03-15" },
      "ค่าน้ำ": { "amount": 300, "due_date": "2026-03-10" }
    }
  },
  "ค่าใช้จ่ายทั่วไป": {
    "is_due_date_enabled": false,
    "sub_categories": {
      "อาหาร": { "amount": 8000, "due_date": null }
    }
  }
}
```

**Migration Strategy:**
- ปรับ `runBudgetMigration()` ให้แปลงจากโครงสร้างเดิม `{ subcategory: value }` → `{ is_due_date_enabled: false, sub_categories: { subcategory: { amount, due_date } } }`
- ค่าเริ่มต้น: `is_due_date_enabled = false` สำหรับทุกกลุ่ม
- สำหรับผู้ใช้ใหม่: `createBudgetFromLatest()` สร้างโครงสร้างใหม่ตั้งแต่ต้น

---

### 2. Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/scripts/migrateBudgetStructure.ts` | Modify | เพิ่ม `is_due_date_enabled` และ `sub_categories` wrapper |
| `src/pages/Settings.tsx` | Modify | Toggle Switch + conditional Date Picker |
| `src/components/FinancialCalendar.tsx` | **Create** | Smart Calendar component |
| `src/components/UpcomingBills.tsx` | **Create** | Upcoming bills card for Dashboard |
| `src/pages/Index.tsx` | Modify | เพิ่ม UpcomingBills component |
| `src/hooks/useBudgetData.ts` | Modify | รองรับ schema ใหม่ |
| `src/hooks/useYearlyData.ts` | Modify | รองรับ schema ใหม่ |

---

### 3. Settings UI — Toggle + Date Picker

**BudgetTable Component Changes:**
- เพิ่ม `Switch` (Toggle) ที่หัวตารางแต่ละกลุ่ม: "เปิดใช้งานการกำหนดวันชำระ"
- เมื่อ Toggle ON → แสดง Date Picker ท้ายทุกรายการ
- เมื่อ Toggle OFF → ซ่อน Date Picker และ set `due_date: null` อัตโนมัติ
- Date Picker แสดงปี พ.ศ. แต่บันทึกเป็น YYYY-MM-DD (ค.ศ.)

```text
┌─────────────────────────────────────────────────────────┐
│ บิลและสาธารณูปโภค         [✓] เปิดใช้งานวันชำระ        │
├─────────────────────────────────────────────────────────┤
│ หมวดหมู่    │ งบประมาณ │ วันกำหนดชำระ │ จ่ายแล้ว │ คงเหลือ │
│ ค่าไฟ       │ [1,500 ] │ [15 มี.ค. 69] │ 0       │ 1,500   │
│ ค่าน้ำ       │ [300   ] │ [10 มี.ค. 69] │ 0       │ 300     │
└─────────────────────────────────────────────────────────┘
```

---

### 4. Smart Financial Calendar

**Component: `FinancialCalendar.tsx`**

Features:
1. **Daily Aggregation**: รวมยอด amount ของรายการที่ due_date ตรงกัน แสดงในช่องวัน
2. **Visual Indicator**: แสดงจุดสีหรือตัวเลขยอดรวมในวันที่มี due items
3. **Day Click Modal**: คลิกวัน → เปิด Dialog แสดงรายการทั้งหมดของวันนั้น
4. **Drag & Drop**: ลากรายการไปวางวันอื่นเพื่อเปลี่ยน due_date

**Data Flow:**
```
Budget Doc → filter items with due_date → group by date → render on calendar
```

**Modal Content:**
```text
┌────────────────────────────────────┐
│ 15 มีนาคม 2569         รวม ฿5,800 │
├────────────────────────────────────┤
│ [≡] ค่าไฟ (บิล)            ฿1,500  │
│ [≡] ผ่อนรถ (หนี้สิน)       ฿4,300  │
└────────────────────────────────────┘
  ↑ Drag handle to move to another day
```

---

### 5. Dashboard — Upcoming Bills Card

**Component: `UpcomingBills.tsx`**

- ดึงรายการที่มี `due_date` และ `is_due_date_enabled = true`
- เรียงตาม due_date จากใกล้ไปไกล
- แสดง 5 รายการแรก พร้อม countdown (เช่น "อีก 3 วัน", "พรุ่งนี้", "เลยกำหนด")
- สีตาม urgency: แดง (เลยกำหนด/วันนี้), ส้ม (1-3 วัน), เขียว (>3 วัน)

**Layout:**
```text
┌─────────────────────────────────────┐
│ 📅 บิลที่ต้องชำระ                   │
├─────────────────────────────────────┤
│ ค่าไฟ         15 มี.ค. (อีก 6 วัน) │
│ ผ่อนรถ        20 มี.ค. (อีก 11 วัน)│
│ Netflix       25 มี.ค. (อีก 16 วัน)│
└─────────────────────────────────────┘
```

---

### 6. Null-safe & Backward Compatibility

**Helper Functions (ปรับปรุง):**
```typescript
function getSubCategories(group: unknown): Record<string, BudgetValue> {
  if (!group || typeof group !== 'object') return {};
  // New format: { is_due_date_enabled, sub_categories: {...} }
  if ('sub_categories' in group) return group.sub_categories ?? {};
  // Old format: { subcategory: value }
  return group as Record<string, BudgetValue>;
}

function isDueDateEnabled(group: unknown): boolean {
  if (!group || typeof group !== 'object') return false;
  return (group as any).is_due_date_enabled ?? false;
}
```

- ทุกจุดที่อ่าน expense_budgets ใช้ helper functions
- รองรับทั้ง format เก่าและใหม่ในช่วง transition
- ไม่มี crash ถ้า due_date เป็น null/undefined

---

### 7. Implementation Order

1. **Migration Script** — ปรับโครงสร้างข้อมูลทั้งหมด
2. **Data Hooks** — useBudgetData, useYearlyData รองรับ schema ใหม่
3. **Settings UI** — Toggle + conditional Date Picker
4. **UpcomingBills** — Dashboard card
5. **FinancialCalendar** — Smart calendar with modal + drag-drop
6. **Dashboard Integration** — เพิ่ม calendar และ upcoming bills

---

### Technical Notes

- **Real-time**: ใช้ `onSnapshot` listener สำหรับ budget changes
- **Thai Localization**: Date Picker แสดง พ.ศ., เก็บ ค.ศ.
- **Toast Notifications**: ทุกการ save แสดง toast ยืนยัน
- **Calendar Library**: ใช้ `react-day-picker` ที่มีอยู่แล้ว + custom rendering

