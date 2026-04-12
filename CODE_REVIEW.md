# Code Review — myfinancial-ds

**วันที่รีวิว:** 12 เมษายน 2569
**Stack:** React / TypeScript / Vite / Firebase Firestore / shadcn-ui / Tailwind CSS / Recharts

---

## สรุปผลรีวิว

| ระดับ | จำนวน |
|-------|-------|
| CRITICAL | 1 |
| HIGH | 5 |
| MEDIUM | 5 |
| LOW | 5 |

---

## CRITICAL

### 1. `new Function` Arbitrary Code Execution ใน CommandCenter

- **ไฟล์:** `src/pages/CommandCenter.tsx:404`
- **ปัญหา:** `scriptCode` จาก user input ถูก execute ตรงๆ ด้วย `new Function()` พร้อม pass `firestore`, `setDoc`, `deleteDoc`, `writeBatch` เข้าไป — ไม่มี sandbox, ไม่มี audit log ถาวร, สามารถเรียก `fetch`, `window`, หรือ exfiltrate credentials ได้
- **ความเสี่ยง:** แม้จะเป็น dev-only + MFA แต่ถ้ามี XSS ที่ไหนก็ตาม (เช่น broadcast message, report title) ที่เข้าถึง dev session ได้ก็สามารถ inject script ลบข้อมูลทุก user ได้
- **แก้ไข:** ใช้ whitelisted operation model (เลือก operation + parameters) หรือย้ายไป Cloud Function ที่ควบคุม scope ได้ ไม่ควร pass `firestore` เข้า `new Function` โดยตรง

---

## HIGH

### 2. `useMemo` ใช้เรียก Side Effect (ต้องเป็น `useEffect`)

- **ไฟล์:** `src/components/TransactionTable.tsx:288`, `src/components/TransferTable.tsx:205`
- **ปัญหา:** `useMemo(() => { setPage(0); }, [...])` — React ไม่ guarantee ว่า `useMemo` callback จะรันทุก render หาก dependency เปลี่ยน (อาจ skip ได้) ทำให้ page reset ไม่ทำงานบางครั้ง
- **แก้ไข:** เปลี่ยนเป็น `useEffect(() => { setPage(0); }, [...])`

### 3. `search` หายจาก Dependency Array ของ `baseTransactions`

- **ไฟล์:** `src/components/TransactionTable.tsx:181-188`
- **ปัญหา:** `search` ถูกใช้ใน `useMemo` callback แต่ไม่อยู่ใน dependency array ทำให้ search ข้ามเดือนไม่ทำงาน (stale closure bug) — user พิมพ์ search แล้วได้ผลเฉพาะเดือนปัจจุบัน
- **แก้ไข:** เพิ่ม `search` ใน dependency array

### 4. Full Collection Scan ไม่มี Filter — ทุกครั้งที่ Mount

- **ไฟล์:**
  - `src/pages/Transactions.tsx:82`
  - `src/pages/OverviewPage.tsx:661`
  - `src/pages/AccountsPage.tsx:291`
  - `src/pages/GoalsPage.tsx:130`
  - `src/pages/InvestmentsPage.tsx:64`
- **ปัญหา:** `getDocs(collection(firestore, "users", userId, "transactions"))` โดยไม่มี `where`, `limit` หรือ pagination — โหลดทุก transaction ของ user ทุกครั้งที่เปิดหน้า ถ้ามี 2+ ปี อาจเป็นหลายพัน documents
- **แก้ไข:** Share data ผ่าน React Query / context แทน fetch ซ้ำแต่ละหน้า หรือคำนวณ `trueNetWorth` จาก account balance แทน sum ทุก transaction

### 5. Code Duplication — `mapTransaction`, `THAI_MONTHS`, `formatThaiDate`

- **ไฟล์ที่ซ้ำ:**
  - `mapTransaction()` — `useBudgetData.ts:166-191` กับ `useYearlyData.ts:37-57`
  - `THAI_MONTHS` — ซ้ำใน 6+ ไฟล์ (`useBudgetData`, `useYearlyData`, `CalendarPage`, `Settings`, `share-service`, `OverviewPage`)
  - `formatThaiDate()` — ซ้ำใน 5+ ไฟล์ (แต่ละ version ต่างกันเล็กน้อย)
  - `EXPENSE_CATEGORY_MAP`, `MAIN_CATEGORY_TYPE_MAP` — ซ้ำใน 2 ไฟล์
- **ปัญหา:** แก้ที่เดียวไม่ sync กับที่อื่น เช่น เพิ่ม category ใหม่ต้องแก้ 2 ไฟล์
- **แก้ไข:** Extract ไปไฟล์กลาง `src/lib/constants.ts` และ `src/lib/format.ts` แล้ว import ทุกที่

### 6. Race Condition ใน `getNextTransactionId`

- **ไฟล์:** `src/components/AddTransactionFAB.tsx:212-226`, `src/lib/recurring-service.ts:73-86`
- **ปัญหา:** 2 concurrent calls (double-tap mobile, 2 tabs) อ่าน max ID เดียวกัน → สร้าง ID ซ้ำ → `setDoc` overwrite transaction แรกโดยไม่มี error
- **แก้ไข:** ใช้ `addDoc` (auto-ID) แทน manual sequential ID หรือใช้ Firestore transaction เพื่อ atomic increment

---

## MEDIUM

### 7. `isDev()` ใน Firestore Rules อ่าน Document ทุกครั้ง

- **ไฟล์:** `firestore.rules:42-47`
- **ปัญหา:** `isDev()` เรียก `getUserData()` ซึ่งอ่าน `users/{uid}` ทุกครั้งที่ evaluate rule — เพิ่ม Firestore read cost และถ้า document หายจะ throw error แทน deny
- **แก้ไข:** ใช้ Firebase custom claims ใน JWT token แทน document read

### 8. `AuthContext` เรียก `getAuth()` ซ้ำ

- **ไฟล์:** `src/contexts/AuthContext.tsx:6`
- **ปัญหา:** `firebase.ts` export `auth = getAuth(app)` แล้ว แต่ `AuthContext.tsx` เรียก `getAuth()` อีกครั้งโดยไม่ส่ง `app` — สร้าง reference ที่สอง
- **แก้ไข:** Import `auth` จาก `@/lib/firebase` แทน

### 9. `syncCarryOver` Fallback Scan ทุก Transaction ก่อนเดือนปัจจุบัน

- **ไฟล์:** `src/hooks/useBudgetData.ts:254-270`
- **ปัญหา:** `where("month_year", "<", currentPeriod)` โหลดทุก transaction ก่อนเดือนนี้เมื่อไม่มี carry_over — สำหรับ user ใหม่ path นี้ trigger ได้ง่าย
- **แก้ไข:** เขียน `carry_over: 0` ตอนสร้าง user ใหม่ เพื่อไม่ให้ fallback path ถูกเรียก

### 10. `deleteAccountWithTransactions` ไม่ Atomic ข้าม Batch

- **ไฟล์:** `src/lib/firestore-services.ts:84-95`
- **ปัญหา:** ถ้า batch แรก (ลบ account + 499 tx) สำเร็จ แต่ batch ที่สอง fail → account หายไปแต่ transaction เหลือค้าง ไม่มี rollback
- **แก้ไข:** Document ข้อจำกัด หรือใช้ Cloud Function สำหรับ bulk delete

### 11. `AdminPanel.deleteSubcollection` ไม่ใช้ Batch

- **ไฟล์:** `src/pages/AdminPanel.tsx:233-237`
- **ปัญหา:** `Promise.all(snap.docs.map(d => deleteDoc(d.ref)))` — 1000 doc = 1000 parallel RPC → Firestore rate limit → partial failure
- **แก้ไข:** ใช้ `writeBatch` ใน chunks ของ 500

---

## LOW

### 12. Settings.tsx 2,250 บรรทัด — ควรแยก

- **ไฟล์:** `src/pages/Settings.tsx`
- **ปัญหา:** มี 5 sections อิสระ (budget, categories, recurring, profile, etc.) รวมกันใน 1 ไฟล์ มี 50+ useState, 13 `any` casts, inline sub-components
- **แก้ไข:** แยกแต่ละ tab เป็น component: `BudgetSettingsTab.tsx`, `CategorySettingsTab.tsx` ฯลฯ

### 13. Toast Library 2 ตัวพร้อมกัน

- **ไฟล์:** `src/App.tsx`
- **ปัญหา:** ทั้ง `<Toaster>` (shadcn/Radix) และ `<Sonner>` mount พร้อมกัน — บาง component ใช้ `toast` จาก sonner บาง component ใช้ `useToast` จาก shadcn → toast stack 2 ชุด
- **แก้ไข:** เลือกใช้ตัวเดียว (แนะนำ sonner เพราะ API ง่ายกว่า)

### 14. CommandCenter Default Script Templates ชี้ Collection ผิด

- **ไฟล์:** `src/pages/CommandCenter.tsx:65,82`
- **ปัญหา:** Template ใช้ `collection(db, "wallets")` และ `collection(db, "transactions")` แต่ actual path คือ `users/{uid}/accounts` และ `users/{uid}/transactions`
- **แก้ไข:** อัพเดท template ให้ตรงกับ structure จริง

### 15. `useBudgetAlerts` มี `alerts` ใน useMemo Dependency ที่ไม่จำเป็น

- **ไฟล์:** `src/hooks/useBudgetAlerts.ts:58`
- **ปัญหา:** `useMemo` อ่าน `localStorage` แต่มี `alerts` ใน dep → re-read localStorage ทุกครั้งที่ alerts เปลี่ยน (synchronous blocking)
- **แก้ไข:** ลบ `alerts` ออกจาก dependency array

### 16. Auth Race Condition — `onAuthStateChanged` + `signInWithGoogle`

- **ไฟล์:** `src/contexts/AuthContext.tsx:66-88`
- **ปัญหา:** ทั้ง `onAuthStateChanged` และ `signInWithGoogle` อ่าน user document พร้อมกัน — ถ้า user document ถูกเขียนระหว่าง 2 reads (first-time registration) อาจเห็น stale data
- **แก้ไข:** ให้ `onAuthStateChanged` เป็น single source of truth — `signInWithGoogle` แค่เรียก `signInWithPopup` แล้วให้ listener จัดการ state

---

## ลำดับความสำคัญในการแก้ไข

### ระยะสั้น (แก้ได้เร็ว, กระทบ user จริง)
- [ ] #2 — `useMemo` → `useEffect` (แก้ 2 บรรทัด)
- [ ] #3 — เพิ่ม `search` ใน dependency array (แก้ 1 บรรทัด)
- [ ] #8 — Import `auth` จาก firebase.ts (แก้ 1 บรรทัด)
- [ ] #15 — ลบ `alerts` จาก useMemo dep (แก้ 1 บรรทัด)

### ระยะกลาง (ลด tech debt, ป้องกัน bug)
- [ ] #5 — Extract constants/formatters ไปไฟล์กลาง
- [ ] #6 — เปลี่ยน `getNextTransactionId` ใช้ `addDoc`
- [ ] #12 — แยก Settings.tsx เป็น tab components
- [ ] #13 — เลือก toast library ตัวเดียว

### ระยะยาว (architecture, security)
- [ ] #1 — Sandbox CommandCenter หรือเปลี่ยนเป็น whitelisted operations
- [ ] #4 — Share transaction data ผ่าน React Query / context
- [ ] #7 — เปลี่ยน Firestore rules ใช้ custom claims
- [ ] #9 — เขียน carry_over ตอนสร้าง user ใหม่
- [ ] #10, #11 — ใช้ Cloud Function สำหรับ bulk operations
