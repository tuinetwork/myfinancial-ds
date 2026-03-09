

## Plan: Show Recurring Items Across Months & Disable Drag for Recurring

### Problem
1. **Recurring items only show in their origin month** — If a weekly recurring item starts in April with end_date in October, navigating to May/June shows nothing because the calendar only fetches the budget document for the displayed month.
2. **Recurring items can be dragged** — Dragging a recurring item changes its `due_date`, which breaks the recurrence pattern. Recurring items should not be draggable.

### Changes

**File: `src/pages/CalendarPage.tsx`**

#### 1. Fetch budget documents from surrounding months for recurring items
- Instead of only fetching the single budget document for the current period, also fetch budget documents from **other periods** (e.g., past 12 months) to find recurring items whose `start_date`/`end_date` range overlaps with the currently viewed month.
- Add a second `useEffect` that queries all budget documents for the user, then for each recurring item found, check if its date range covers the current view month.
- Merge these "cross-month recurring items" into the existing `dueDateItems` via `expandRecurrence()` using the viewed month's year/month.

#### 2. Disable drag for recurring items
- On the `<Draggable>` component in the side panel, set `isDragDisabled={item.isRecurring}`.
- Hide the grip handle (`GripVertical`) for recurring items.
- Update the drag hint text at the bottom of the side panel to clarify only non-recurring items can be dragged.

### Implementation Detail

**Cross-month recurring fetch:**
```text
useEffect:
  1. Query collection "users/{userId}/budgets" (all docs)
  2. For each doc, scan expense_budgets for items with recurrence + start_date/end_date
  3. If end_date >= first day of viewed month AND start_date <= last day of viewed month
     → include in a "crossMonthBudgets" state (skip items from current period to avoid duplicates)
  4. In extractDueDateItems, merge cross-month recurring items
```

**Disable drag:**
```text
<Draggable isDragDisabled={item.isRecurring} ...>
  {/* Hide GripVertical when item.isRecurring */}
</Draggable>
```

### Scope
- 1 file changed: `src/pages/CalendarPage.tsx`
- No changes to `recurrence.ts` (expandRecurrence already supports cross-month expansion)

