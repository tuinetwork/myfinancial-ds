

## Plan: Use `onSnapshot` for real-time category updates in AddTransactionFAB

The `AddTransactionFAB` already fetches categories from Firestore and displays them in dropdowns. The only change needed is to replace the one-time `getDocs` fetch with a real-time `onSnapshot` listener, so when categories are added/edited in Settings, the dropdown updates automatically.

### Changes

**`src/components/AddTransactionFAB.tsx`**:
1. Replace `getDocs` import with `onSnapshot`
2. Change the `useEffect` to use `onSnapshot` instead of `getDocs`, returning the unsubscribe function for cleanup
3. Re-fetch categories each time the modal opens (by adding `open` to the dependency or relying on the real-time listener)

This is a minimal change — roughly 5 lines modified in the existing useEffect block.

