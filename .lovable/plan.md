

## Plan: เรียงลำดับเดือนใน Dropdown ตามปฏิทิน

### ปัญหา
เดือนใน Dropdown แสดงตามลำดับที่ได้จาก Firebase (ตาม key) ซึ่งอาจไม่ตรงกับลำดับปฏิทิน (มกราคม → ธันวาคม)

### การแก้ไข (`src/pages/Index.tsx`)

เพิ่ม array ลำดับเดือนภาษาไทย และใช้ sort ใน `monthsForYear` memo:

```typescript
const THAI_MONTHS = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"
];
```

แก้ `monthsForYear` ให้ sort ตามลำดับปฏิทิน:
```typescript
const monthsForYear = useMemo(() => {
  if (!months || !selectedYear) return [];
  return months
    .filter((m) => m.year === selectedYear)
    .sort((a, b) => THAI_MONTHS.indexOf(a.month) - THAI_MONTHS.indexOf(b.month));
}, [months, selectedYear]);
```

- ไม่กระทบ logic อื่น (auto-select, path derivation, ส่งข้อมูลไป Sheet)
- เปลี่ยนแค่ลำดับการแสดงผลใน Dropdown เท่านั้น

