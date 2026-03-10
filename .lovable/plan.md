

## Plan: Monthly Frequency — Day-of-Month Picker (1-31)

### Problem
When frequency is set to "รายเดือน" (monthly), the due date picker still shows a full calendar. It should instead show a simple day-of-month selector (1-31), since for monthly recurrence only the day number matters.

### Changes

**File: `src/pages/Settings.tsx` — `DueDatePicker` component**

Add a new condition for `frequency === "monthly"` (similar to the existing `isWeekly` branch) that renders a grid of day numbers 1-31 instead of the full calendar.

- After the `isWeekly` block (line 263), add a new `isMonthly` block
- Display a grid of buttons numbered 1-31
- When a day is selected, generate a date string using the current year/month with that day number
- Show the selected day as "วันที่ X ของเดือน" in the trigger button
- Preserve the same popover pattern and styling

```text
DueDatePicker logic flow:
  if weekly  → show day-of-week grid (existing)
  if monthly → show 1-31 day grid (NEW)
  else       → show full calendar (existing)
```

### Scope
- 1 file changed: `src/pages/Settings.tsx`
- ~30 lines added to `DueDatePicker` component

