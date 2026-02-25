

## Plan: ยกยอดข้ามปี (ธันวาคม → มกราคมปีถัดไป)

### สิ่งที่เปลี่ยน

#### `src/pages/Index.tsx` — แก้ logic `previousPath`

ปัจจุบัน เดือนมกราคม (index 0) จะ return `undefined` ทันที ไม่มียกยอด

แก้เป็น:
- ถ้าเป็นมกราคม → หา path ของ **ธันวาคมปีก่อนหน้า** (`history/{year-1}/ธันวาคม`) จาก `months` data
- ยังคงเช็คว่าเดือนก่อนหน้าต้องจบแล้ว (ธันวาคมปีก่อนจะจบแล้วเสมอถ้าปีปัจจุบันเริ่มแล้ว) — ใช้ logic เดิมที่เช็ค `prevMonthIdx >= realMonthIdx`
- ถ้าไม่มีข้อมูลธันวาคมปีก่อนใน Firebase → return `undefined` ตามปกติ

### โค้ดที่เปลี่ยน (บรรทัด ~90-95)

```text
เดิม:
  if (currentIdx <= 0) return undefined;

ใหม่:
  if (currentIdx === 0) {
    // ม.ค. → หายอดจาก ธ.ค. ปีก่อน
    const prevYear = String(Number(selectedYear) - 1);
    const found = months.find(m => m.year === prevYear && m.month === "ธันวาคม");
    // ธ.ค. ปีก่อนจบแล้วแน่นอนถ้าเราอยู่ปีถัดไป ไม่ต้องเช็คเพิ่ม
    return found?.path;
  }
```

ไม่มีไฟล์อื่นที่ต้องแก้ การคำนวณ carryOver ใช้ `prevData` อยู่แล้ว

