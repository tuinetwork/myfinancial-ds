

## Plan: เพิ่ม Google Login และใช้ UID ดึงข้อมูลจาก Firestore

### สิ่งที่จะทำ

1. **สร้าง Auth Context (`src/contexts/AuthContext.tsx`)**
   - ใช้ Firebase Auth (`getAuth`, `GoogleAuthProvider`, `signInWithPopup`, `onAuthStateChanged`)
   - สร้าง `AuthProvider` ที่ track สถานะ login และเก็บ `user` object (มี `uid`)
   - สร้าง `useAuth()` hook สำหรับเข้าถึง user, uid, signIn, signOut

2. **สร้างหน้า Login (`src/components/GoogleLogin.tsx`)**
   - แสดงปุ่ม "Sign in with Google"
   - เมื่อ login สำเร็จ ตรวจสอบว่า UID ตรงกับ user document ใน Firestore collection `users/{uid}` หรือไม่
   - ถ้าไม่มี document → แสดงข้อความ "ไม่พบข้อมูลผู้ใช้" และ sign out

3. **อัปเดต Firebase config (`src/lib/firebase.ts`)**
   - Export `auth` instance จาก `getAuth(app)`

4. **แก้ไข `src/App.tsx`**
   - ครอบ app ด้วย `AuthProvider`
   - แทนที่ `PinLock` ด้วย `GoogleLogin` เป็นหน้า gate (หรือทำงานร่วมกัน)
   - ถ้ายังไม่ login → แสดงหน้า login
   - ถ้า login แล้ว → แสดง dashboard

5. **แก้ไข `src/hooks/useBudgetData.ts` และ `src/hooks/useYearlyData.ts`**
   - ลบ hardcoded `USER_ID`
   - รับ `userId` จาก `useAuth()` hook
   - ใช้ `userId` ใน path `users/{userId}/budgets` และ `users/{userId}/transactions`

### รายละเอียดทางเทคนิค

- Firebase Auth ใช้ `signInWithPopup` กับ `GoogleAuthProvider`
- หลัง login สำเร็จ จะเช็ค `doc(firestore, "users", uid)` ว่ามีอยู่หรือไม่ เพื่อยืนยันว่าเป็น user ที่มีข้อมูล
- PIN lock ยังคงทำงานได้ถ้าต้องการ (เป็น layer เพิ่ม) หรือจะแทนที่ด้วย Google login อย่างเดียว
- Session จะ persist ผ่าน Firebase Auth persistence (default: local storage)

### ไฟล์ที่จะแก้ไข/สร้าง
- **สร้างใหม่**: `src/contexts/AuthContext.tsx`, `src/components/GoogleLogin.tsx`
- **แก้ไข**: `src/lib/firebase.ts`, `src/App.tsx`, `src/hooks/useBudgetData.ts`, `src/hooks/useYearlyData.ts`

