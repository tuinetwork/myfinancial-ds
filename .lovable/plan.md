

## Problem
The Analysis page (and Dashboard yearly view) displays future months (e.g., April 2026) in charts and tables because budget documents exist for those months (planned ahead). The desired behavior is to only show data up to the current month.

## Root Cause
- `useYearlyData` fetches ALL budget documents for the year, including future months
- `monthlyComparison` in `Analysis.tsx` and `MonthlyTrendChart.tsx` render all months without filtering

## Plan

### 1. Filter `monthlyComparison` in `Analysis.tsx` (line ~94)
Add a filter to exclude months after the current month:
```ts
const now = new Date();
const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
```
Filter `yearlyData.months` to only include months where `month <= currentPeriod` before mapping to chart data.

### 2. Filter `MonthlyTrendChart.tsx` (line ~27)
Apply the same current-month filter to `yearlyData.months` before generating `chartData`, so the Dashboard yearly bar chart also excludes future months.

### 3. Filter `MonthlyHighlights` and `YearlySummaryCard`
Check if these components also iterate over `yearlyData.months` and apply the same filter to keep consistency across all yearly views.

Both files will use the same pattern: compare each month's period string against the current `YYYY-MM` period.

