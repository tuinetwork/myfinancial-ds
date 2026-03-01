

## Plan: Refactor Category Settings to use `categories` collection

Currently, the Category Settings tab reads category data from the `budgets` collection (extracting keys from `income_estimates` and `expense_budgets`). The user wants it to read/write from the dedicated `categories` collection instead.

### Firestore Structure (from screenshot)
```text
users/{uid}/categories/
  ├── expense    → { "กลุ่ม1": ["sub1","sub2"], ... }
  ├── income     → { "กลุ่ม1": ["sub1","sub2"], ... }
```

### Changes to `src/pages/Settings.tsx` — `CategorySettings` component

1. **Remove period/month/year selection** — Categories are global, not per-month, so remove the month/year dropdowns and related state/logic.

2. **Change data fetching** — Instead of reading from `budgets/{period}`, read two documents:
   - `users/{uid}/categories/expense` → groups with sub-category arrays
   - `users/{uid}/categories/income` → groups with sub-category arrays

3. **Change save logic** — Write directly to `categories/expense` and `categories/income` documents using `setDoc` (with merge) instead of updating budget documents.

4. **Keep existing UI** — The two-column layout (expense left, income right) with collapsible groups, add/remove sub-categories, add/remove groups remains the same.

5. **Fix existing bug** — The income group "เพิ่มกลุ่มรายจ่าย" button currently calls `addGroup("expense", ...)` instead of `addGroup("income", ...)`. This will be fixed.

### Technical Details

- Import `setDoc` from `firebase/firestore` (already have `updateDoc`, `getDoc`, `doc`)
- Data shape from Firestore: each document field is a group name with value being an array of sub-category strings: `Record<string, string[]>`
- On save: `setDoc(doc(firestore, "users", userId, "categories", "expense"), expenseGroups)` and same for income

