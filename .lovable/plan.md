

## Plan: Lock Recurring Items & Show Remaining Installments Across Months

### Problem
1. **No edit protection** — Recurring items with frequency/dates can be accidentally modified. Need a lock button to disable editing.
2. **Future months show wrong data** — When viewing April for an item that started in March with 7 installments, it still shows 7 installments and "-" for remaining. It should show 6 remaining installments and the correct remaining balance.

### Changes

**File: `src/pages/Settings.tsx` — `BudgetTable` component**

#### 1. Disable editing for recurring items
- Items with `recurrence` set will have their inputs (amount, due date, frequency, start/end dates, installments) rendered as **read-only text** instead of editable inputs.
- Add a small lock icon (🔒) next to the category name for recurring items to visually indicate they are locked.
- Users can still edit non-recurring items normally.

#### 2. Calculate remaining installments per viewed month
- Modify `getOccurrences` to compute **remaining occurrences** from the viewed month onward (not total).
- Add a new function `getTotalOccurrences` for total count and `getRemainingOccurrences` for from-viewed-month-onward count.
- The "งวด" column shows remaining installments from the selected period forward.
- The "คงเหลือ" column shows: `remainingInstallments * amount` — already paid in current month.

#### 3. Show remaining balance even when no transactions exist
- Currently shows "-" when `actual === 0`. Change to always show remaining balance for recurring items with start/end dates, since the remaining budget is meaningful even without transactions in that month.

### Logic Detail

```text
totalOccurrences = expandRecurrence(startDate → endDate)  // e.g., 7
pastOccurrences = expandRecurrence(startDate → end of previous month)  // e.g., 1 in March
remainingFromViewedMonth = totalOccurrences - pastOccurrences  // e.g., 6 in April
remainingBalance = remainingFromViewedMonth * amount - actualInCurrentMonth
```

### Scope
- 1 file changed: `src/pages/Settings.tsx`
- ~40 lines modified in `BudgetTable` component

