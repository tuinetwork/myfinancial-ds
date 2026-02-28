

## แผนการปรับปรุง: Sparkline + Sidebar Navigation

### 1. เพิ่ม Sparkline ใน Summary Cards (`src/components/SummaryCards.tsx`)
- สร้าง mini sparkline SVG จากข้อมูล transactions รายวัน (group by date → สะสมยอดแต่ละวัน)
- แต่ละการ์ดจะมี sparkline เล็กๆ (ขนาดประมาณ 80x32px) วางที่มุมขวาล่าง ใช้สีขาว opacity ต่ำ
- กราฟแสดงแนวโน้มรายวันของแต่ละหมวด (รายรับ/ค่าใช้จ่าย/หนี้สิน/เงินออม) โดยใช้ recharts `<Sparkline>` หรือ SVG path ตรงๆ เพื่อความเบา

### 2. เพิ่ม Sidebar Navigation
- **สร้างไฟล์ใหม่** `src/components/AppSidebar.tsx` — sidebar ด้านซ้ายที่มีเมนู Dashboard, ตัวเลือกเดือน/ปี, และ view mode toggle (รายเดือน/รายปี)
- **แก้ `src/App.tsx`** — ครอบด้วย `SidebarProvider` + layout flex, เพิ่ม `SidebarTrigger` ใน header
- **แก้ `src/pages/Index.tsx`** — ย้าย month/year selectors และ view mode tabs ไปอยู่ใน sidebar แทน header ด้านบน, ลด padding เล็กน้อย
- Sidebar ใช้ `collapsible="icon"` เพื่อให้ย่อเป็น icon strip ได้
- เมนูหลัก: Dashboard (หน้าแรก), พร้อม section สำหรับเลือกเดือน/ปี

### ไฟล์ที่แก้ไข
1. `src/components/SummaryCards.tsx` — เพิ่ม sparkline component ในแต่ละการ์ด
2. `src/components/AppSidebar.tsx` — **ไฟล์ใหม่** sidebar navigation
3. `src/App.tsx` — ครอบ SidebarProvider + layout
4. `src/pages/Index.tsx` — ย้าย controls ไป sidebar, ปรับ layout

