

## Admin Panel Plan

### สิ่งที่ต้องทำ

**1. เพิ่ม `userRole` ใน AuthContext**
- เมื่อผู้ใช้ login สำเร็จและพบใน `users` collection → อ่านฟิลด์ `role` จาก document `/users/{uid}`
- เก็บค่า `userRole` (string เช่น "dev", "admin", "user") ใน context
- Export `userRole` ผ่าน `useAuth()`

**2. สร้างหน้า Admin Panel (`src/pages/AdminPanel.tsx`)**
- ดึงข้อมูลจาก Firestore collection `requester` (ทุก document) แสดงเป็นตาราง
- แต่ละแถวแสดง: display_name, email, created_at, role status
- ปุ่ม **อนุมัติ (Approve)**: สร้าง document ใน `users/{uid}` → ลบออกจาก `requester/{uid}` → trigger initialization
- ปุ่ม **ปฏิเสธ (Reject)**: ลบ document ออกจาก `requester/{uid}`
- มี confirmation dialog ก่อนทำ approve/reject

**3. เพิ่มเมนู Admin Panel ใน Sidebar Footer**
- เพิ่มเมนู "Admin Panel" ใน `SidebarFooter` เหนือเมนูตั้งค่า พร้อมไอคอน `ShieldCheck`
- แสดงเฉพาะเมื่อ `userRole === "dev" || userRole === "admin"`
- Link ไปที่ `/admin`

**4. เพิ่ม Route `/admin` ใน App.tsx**
- เพิ่ม `<Route path="/admin" element={<AdminPanel />} />`

**5. อัปเดต Firestore Rules**
- เพิ่ม rule ให้ผู้ใช้ที่มี role "dev"/"admin" สามารถ read/delete collection `requester` ทั้งหมดได้
- ต้องใช้ custom claim หรือตรวจสอบ role จาก `users/{uid}` document ใน rules

### รายละเอียดทางเทคนิค

- **Role check ใน Firestore Rules**: ใช้ `get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role` เพื่อตรวจ role ฝั่ง server
- **Approve flow**: `setDoc(users/{uid}, { email, display_name, role: "user", ... })` → `deleteDoc(requester/{uid})`
- **Admin route protection**: ตรวจ `userRole` ใน component level — ถ้าไม่ใช่ dev/admin redirect กลับ `/`
- **Firestore rules ใหม่สำหรับ requester**:
```text
match /requester/{requesterId} {
  allow create: if isOwner(requesterId);
  allow read: if isOwner(requesterId);
  // Admin/dev can read all and delete
  allow read, delete: if isAuthenticated() 
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['dev', 'admin'];
  allow update: if false;
}
```

### ไฟล์ที่ต้องแก้ไข
1. `src/contexts/AuthContext.tsx` — เพิ่ม `userRole`
2. `src/pages/AdminPanel.tsx` — สร้างใหม่
3. `src/components/AppSidebar.tsx` — เพิ่มเมนู Admin
4. `src/App.tsx` — เพิ่ม route
5. `firestore.rules` — เพิ่ม admin rules

