
## Plan: ระบบการจัดการการเงินครบวงจร — Due Date Tracking + Smart Calendar

### Status: In Progress ✅

---

### Completed Tasks

#### 1. ✅ Migration Script (`src/scripts/migrateBudgetStructure.ts`)
- Updated to support new schema with `is_due_date_enabled` toggle and `sub_categories` wrapper
- Added helper functions: `getSubCategories()`, `isDueDateEnabled()`, `getAmount()`, `getDueDate()`
- Migration converts old format → new format for all users

#### 2. ✅ UpcomingBills Component (`src/components/UpcomingBills.tsx`)
- Dashboard card showing bills sorted by due date
- Urgency indicators: red (overdue/today), amber (1-3 days), green (>3 days)
- Thai localization with พ.ศ. date format

#### 3. ✅ FinancialCalendar Component (`src/components/FinancialCalendar.tsx`)  
- Smart calendar with daily aggregation of due amounts
- Click day → modal shows all items for that day
- Drag & drop support for rescheduling (onUpdateDueDate callback)
- Thai Buddhist Era date display

#### 4. ✅ Dashboard Integration (`src/pages/Index.tsx`)
- Added UpcomingBills to 3-column grid with FinancialHealthCard and SavingsGoalCard
- Added FinancialCalendar in dedicated section

---

### Remaining Tasks

#### 5. ⏳ Settings UI Enhancement
- Add Toggle Switch per category group for "เปิดใช้งานการกำหนดวันชำระ"
- Show/hide Date Picker based on toggle state
- Auto-set `due_date: null` when toggle is OFF

#### 6. ⏳ Data Hooks Update
- Update `useBudgetData.ts` to handle new nested schema
- Update `useYearlyData.ts` for consistency
- Ensure backward compatibility during migration

---

### Technical Notes

- **Real-time**: Uses `onSnapshot` listeners for budget changes
- **Thai Localization**: Date Picker shows พ.ศ., stores ค.ศ. (ISO)
- **Toast Notifications**: All saves show confirmation toast
- **Null-safe**: Helper functions handle both old and new data formats
