

## Redesign Add Transaction Modal — Glassmorphism + Two-Step Category Selection

### What Changes

Rewrite `src/components/AddTransactionFAB.tsx` modal interior with:

1. **Glassmorphism styling**: Modal uses `bg-slate-800/60 backdrop-blur-xl border-white/10` instead of solid `bg-card`. All inputs use transparent backgrounds (`bg-white/10 border-white/10`).

2. **Dynamic theme colors**: Active state uses `red-500` for expense, `emerald-500` for income — applied to toggle buttons, amount text, category highlights, and submit button.

3. **Single-screen layout (no scroll on outer modal)**:
   - Header + close button
   - Type toggle (expense/income)
   - Amount input (large, transparent) + Date picker (inline row)
   - Category area (fixed height ~200px, `overflow-y-auto` inside):
     - **Step 1**: 2-column grid of main categories as clickable cards
     - **Step 2**: Animated slide-in list of sub-categories (1 column) with back button
   - Note textarea (compact)
   - Submit button — `disabled` + `opacity-50` until `subCategory` is selected

4. **New state**: `categoryStep: 1 | 2` to manage two-step flow. Reset to step 1 when type changes.

5. **Transition**: Category area uses CSS transition (`transform + opacity`) to slide between steps.

### Files to Edit

- **`src/components/AddTransactionFAB.tsx`** — Full modal UI rewrite (logic/data unchanged)

### Technical Details

- Remove `Select` components for categories, replace with custom grid/list UI
- Add `categoryStep` state, default `1`
- Step 1: `grid grid-cols-2 gap-2`, each main category as a button with border highlight on type color
- Step 2: `flex flex-col gap-1`, each sub-category as a row button; back button at top using `ChevronLeft`
- Category container: `h-[200px] overflow-y-auto relative overflow-hidden` with inner divs positioned via `translate-x` or conditional render with `transition-all duration-200`
- Submit button: `disabled={!subCategory || saving}`
- Amount + Date on same row: amount `flex-1`, date button `w-auto`
- All text in Thai

