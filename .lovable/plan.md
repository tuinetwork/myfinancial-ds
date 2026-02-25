

## Plan: เพิ่มหน้า PIN Lock พร้อมเช็ค pinSetup จาก Firebase

### โครงสร้าง Firebase ที่ใช้
```text
config/
  pinSetup: true/false
  pinKey: "102508"
```

### รายละเอียดการเปลี่ยนแปลง

#### 1. สร้าง `src/components/PinLock.tsx`
- แสดง UI เต็มจอพร้อมไอคอนกุญแจ ให้กรอก PIN 6 หลักด้วย `InputOTP`
- ดึง `config/pinSetup` และ `config/pinKey` จาก Firebase Realtime Database
- **ถ้า `pinSetup` เป็น `false`** → เรียก `onUnlock` ทันทีโดยไม่ต้องแสดงหน้ากรอก PIN
- **ถ้า `pinSetup` เป็น `true`** → แสดงหน้ากรอก PIN แล้วเปรียบเทียบกับ `pinKey`
- ถ้ากรอกถูก → เรียก `onUnlock` และบันทึกใน `sessionStorage`
- ถ้ากรอกผิด → แสดง "PIN ไม่ถูกต้อง" พร้อมล้างช่องกรอก
- ระหว่างโหลดข้อมูลจาก Firebase แสดง loading spinner

#### 2. แก้ไข `src/App.tsx`
- เพิ่ม state `isUnlocked` ตรวจสอบจาก `sessionStorage` key `"finance-dashboard-unlocked"`
- ถ้ายังไม่ unlock → แสดง `PinLock`
- เมื่อ unlock สำเร็จ → set `sessionStorage` และแสดงหน้าปกติ

### ด้านเทคนิค
- ใช้ `ref(db, "config/pinSetup")` และ `ref(db, "config/pinKey")` กับ `get()` จาก Firebase
- ใช้ `InputOTP` component ที่มีอยู่แล้ว
- Session storage key: `"finance-dashboard-unlocked"` เพื่อไม่ต้องกรอกซ้ำใน session เดียวกัน

