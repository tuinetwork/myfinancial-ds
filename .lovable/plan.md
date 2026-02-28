

## แปลข้อความภาษาอังกฤษเป็นภาษาไทย

### ไฟล์ที่ต้องแก้ไข

**1. `src/components/AppSidebar.tsx`**
- บรรทัด 35: `"Dashboard"` → `"แดชบอร์ด"`
- บรรทัด 85: `"Navigation"` → `"เมนู"`

**2. `src/components/GoogleLogin.tsx`**
- บรรทัด 37: `"Finance Dashboard"` → `"ระบบจัดการการเงิน"`
- บรรทัด 40: `"Login"` → `"เข้าสู่ระบบ"`

**3. `src/pages/NotFound.tsx`**
- บรรทัด 15: `"Oops! Page not found"` → `"ไม่พบหน้าที่คุณต้องการ"`
- บรรทัด 17: `"Return to Home"` → `"กลับหน้าหลัก"`

**4. `src/components/TransactionTable.tsx`**
- บรรทัด 208: ชื่อ sheet ใน Excel export `"Transactions"` → `"รายการธุรกรรม"`

### รายละเอียด
- แก้ไขเฉพาะข้อความที่แสดงผลให้ผู้ใช้เห็น (UI text)
- ไม่แก้ชื่อตัวแปร, class name, หรือ technical string

