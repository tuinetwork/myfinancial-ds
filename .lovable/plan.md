

## Plan: ระบบ Requester สำหรับผู้ใช้ใหม่ที่ยังไม่ได้รับอนุญาต

### สิ่งที่จะทำ

เมื่อผู้ใช้ที่ไม่มีข้อมูลใน `users` collection กด Login เข้ามา ระบบจะ:
1. บันทึกข้อมูลลง Firestore collection `requester/{UID}` แทนที่จะแสดง error ทันที
2. แสดงหน้า "รอการพิจารณาอนุมัติ" แทนข้อความ "ไม่พบข้อมูลผู้ใช้ในระบบ"
3. เมื่อ admin อนุมัติผู้ใช้ใหม่ (เพิ่มใน `users` collection) → ระบบจะคัดลอก categories และ budgets เดือนปัจจุบันจาก `user_id_001` ให้ผู้ใช้ใหม่อัตโนมัติ

---

### การเปลี่ยนแปลงทางเทคนิค

#### 1. แก้ไข `src/contexts/AuthContext.tsx`
- เพิ่ม state `pendingApproval` (boolean) เพื่อแยกสถานะ "รอพิจารณา" จาก "ไม่ได้ login"
- ใน `signInWithGoogle`: เมื่อไม่พบ user ใน `users` collection → เขียนข้อมูลลง `requester/{UID}`:
  ```
  { created_at, display_name, email, role: "pending" }
  ```
- ใน `onAuthStateChanged`: เมื่อไม่พบใน `users` → ตรวจ `requester/{UID}` ถ้ามีอยู่แล้วก็ set `pendingApproval = true` (ไม่ sign out)
- เพิ่มฟังก์ชัน `initializeNewUser(userId)` ที่คัดลอก categories และ budgets เดือนปัจจุบันจาก hardcoded source user ID
- เรียก `initializeNewUser` เมื่อผู้ใช้ login แล้วพบว่ามี doc ใน `users` แต่ยังไม่มี categories/budgets (user ใหม่ที่เพิ่งได้รับอนุมัติ)

#### 2. แก้ไข `src/components/GoogleLogin.tsx`
- รับ `pendingApproval` จาก `useAuth()`
- เมื่อ `pendingApproval === true` → แสดง UI "รอการพิจารณาอนุมัติ" พร้อมข้อมูลผู้ใช้ และปุ่มออกจากระบบ แทน error message สีแดง

#### 3. แก้ไข `src/App.tsx`
- เพิ่มเงื่อนไข: ถ้า `pendingApproval` → แสดง `GoogleLogin` ในโหมดรอพิจารณา

#### 4. แก้ไข `firestore.rules`
- เพิ่ม rule สำหรับ `requester/{userId}`:
  - `allow create`: ถ้า `auth.uid == userId` (ผู้ใช้สร้างเฉพาะ doc ของตัวเอง)
  - `allow read`: ถ้า `auth.uid == userId`
  - `allow update, delete`: `false` (admin จัดการผ่าน Firebase Console)

#### 5. ฟังก์ชันคัดลอกข้อมูลจาก source user

สร้างฟังก์ชันใน AuthContext ที่:
- อ่าน `users/{SOURCE_UID}/categories/expense` และ `income` → เขียนลง `users/{newUID}/categories/`
- อ่าน `users/{SOURCE_UID}/budgets/{currentPeriod}` → เขียนลง `users/{newUID}/budgets/{currentPeriod}` (reset `carry_over` เป็น 0)
- Source UID จะ hardcode เป็นค่าคงที่ (ต้องระบุ UID จริงของ user_id_001)

---

### โครงสร้าง Firestore ใหม่

```text
requester/
  └── {UID}/
        ├── created_at: Timestamp
        ├── display_name: string
        ├── email: string
        └── role: "pending"
```

### Flow

```text
ผู้ใช้ใหม่กด Login
  → ไม่พบใน users collection
  → บันทึกลง requester/{UID}
  → แสดง "รอการพิจารณาอนุมัติ"

Admin อนุมัติ (เพิ่ม doc ใน users collection ผ่าน Firebase Console)
  → ผู้ใช้ login อีกครั้ง → พบใน users
  → ตรวจว่ายังไม่มี categories → คัดลอกจาก source user
  → เข้าใช้งานได้ปกติ
```

