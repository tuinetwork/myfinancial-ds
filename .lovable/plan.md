

## แยกเมนูย่อย Dashboard ออกมาแสดงตรงๆ

### ปัญหา
เมนู Dashboard มี 3 รายการย่อย (รายเดือน, รายปี, วิเคราะห์) ซ่อนอยู่ใน Collapsible/Accordion ต้องคลิกกางก่อน ผู้ใช้ต้องการให้แสดงตรงๆ เหมือนกลุ่ม Activity

### แนวทางแก้ไข

**ไฟล์: `src/components/AppSidebar.tsx`**

1. เปลี่ยน `dashboardItems` จากรูปแบบ parent+children เป็น flat list 3 รายการ:
   - รายเดือน → `/?view=monthly` (icon: CalendarDays)
   - รายปี → `/?view=yearly` (icon: BarChart3)
   - วิเคราะห์ → `/analysis` (icon: PieChart)

2. ในส่วน render กลุ่ม DASHBOARD เปลี่ยนจาก `renderCollapsibleItem` เป็น `renderSimpleItem` สำหรับทุกรายการ

3. ปรับ `renderSimpleItem` ให้รองรับ URL ที่มี query param (เช่น `/?view=monthly`) โดยใช้ logic เทียบ active state แบบเดิมจาก `renderChildActive`

4. ลบ state `dashboardOpen` / `setDashboardOpen` และ useEffect ที่เกี่ยวข้องออก (ไม่จำเป็นแล้ว)

### ผลลัพธ์
กลุ่ม DASHBOARD จะแสดง 3 รายการตรงๆ เหมือนกลุ่ม Activity ไม่ต้องกดกาง

