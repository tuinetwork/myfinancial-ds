

## Plan: Auto-sync new subcategories to Budget and Savings Goals

### Problem
When a new subcategory is added in Settings → Categories and saved, it doesn't appear in Settings → Budget or Settings → Savings Goals. Users must manually add entries, which is error-prone.

### Solution
Modify the `CategorySettings.handleSave()` function to, after saving categories, also update **all existing budget documents** to include any new subcategories (with budget amount = 0). This ensures:

1. **Budget tab**: New subcategories appear immediately in the budget table for all periods
2. **Savings Goals tab**: If the new subcategory belongs to "เงินออมและการลงทุน", it also appears in savings goals automatically

### Technical Changes

**File: `src/pages/Settings.tsx` — `CategorySettings.handleSave()`**

After saving categories to the `categories` collection, add a sync step:

1. Fetch all budget documents from `users/{userId}/budgets`
2. For each budget document:
   - Compare `expense_budgets` keys/sub-keys against `expenseGroups`
   - Compare `income_estimates` keys/sub-keys against `incomeGroups`
   - Add any missing subcategories with value `0`
   - Remove subcategories/groups that no longer exist in categories
   - Write back updated budget document
3. This automatically covers savings goals since they read from `expense_budgets["เงินออมและการลงทุน"]`

### Key Logic
```
For each budget doc:
  For each main_category in expenseGroups:
    For each subcategory in that group:
      If subcategory not in budget.expense_budgets[main_category]:
        Add it with value 0
  Same for incomeGroups → income_estimates
  
  Remove entries from budget that no longer exist in categories
```

This is a single-file change to `src/pages/Settings.tsx`, modifying only the `handleSave` function in `CategorySettings`.

