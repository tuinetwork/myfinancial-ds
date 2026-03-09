

## Plan: Allow Budget Settings 1 Month Ahead, Limit Other Pages to Current Month

### Problem
Currently all pages share the same `useAvailableMonths()` hook which shows all existing budget periods plus the current month. The user wants:
- **Settings page (Budget & Savings Goals)**: Allow selecting up to 1 month ahead (next month)
- **Other pages (Dashboard, Transactions, Analysis, Calendar)**: Only show months up to the current month

### Technical Changes

**File: `src/hooks/useBudgetData.ts`**

1. Add a `getNextMonthOption()` helper (similar to `getCurrentMonthOption()` but +1 month)
2. Add a new `ensureUpToNextMonth()` function that ensures both current and next month are in the options
3. Export a new hook `useAvailableMonthsWithNextMonth()` that uses `ensureUpToNextMonth` instead of `ensureCurrentMonth`
4. In the existing `ensureCurrentMonth`, add filtering to exclude future months (months after the current month) — this ensures other pages never see next month even if a budget doc exists for it

**File: `src/pages/Settings.tsx`**

5. In `BudgetSettings` and `SavingsGoalSettings` components, change `useAvailableMonths()` to `useAvailableMonthsWithNextMonth()`

### Key Logic

```text
ensureCurrentMonth (existing, modified):
  - Add current month if missing
  - Filter OUT any months with period > currentPeriod
  
ensureUpToNextMonth (new):
  - Add current month if missing
  - Add next month if missing
  - Keep all months (no future filtering)

useAvailableMonthsWithNextMonth (new hook):
  - Same as useAvailableMonths but uses ensureUpToNextMonth
```

This is a 2-file change affecting `useBudgetData.ts` and `Settings.tsx`.

