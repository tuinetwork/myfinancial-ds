

## Plan: สร้างหน้าตั้งค่าแบบ Modal + สวิตช์ยอดยกมา + คำอธิบายตัวเลข

### สรุปสิ่งที่จะทำ

1. **เปลี่ยนหน้าตั้งค่าเป็น Dialog/Modal แบบลอย** พร้อมพื้นหลังเบลอ แทนที่จะเป็นหน้าเต็ม
2. **เพิ่มสวิตช์เปิด-ปิด "รวมยอดยกมา"** ที่บันทึกการตั้งค่าลง Firestore และส่งผลต่อการแสดงผลทั้งมุมมองรายเดือนและรายปี
3. **เพิ่มคำอธิบายตัวเลข (Tooltip/ข้อความ)** บน Summary Cards และ MonthComparison เพื่ออธิบายว่าตัวเลขแต่ละจุดคิดมาจากอะไร
4. **แก้ build error** ใน ThemeContext.tsx

---

### รายละเอียดทางเทคนิค

#### 1. แก้ Build Error — `ThemeContext.tsx`
- บรรทัด 43: `if (theme === "system")` อยู่ภายใน block ที่ `if (theme === "system") return;` ทำให้ TypeScript เห็นว่า theme ไม่มีทางเป็น "system" — แก้โดยลบ early return ที่บรรทัด 39 แล้วใช้เงื่อนไขใน handler แทน หรือเปลี่ยน early return เป็น `if (theme !== "system") return;`

#### 2. เปลี่ยน Settings เป็น Modal
- **`UserProfilePopover.tsx`**: เปลี่ยนปุ่ม "ตั้งค่า" จาก `navigate("/settings")` เป็นเปิด Dialog state
- **สร้าง `src/components/SettingsDialog.tsx`**: คอมโพเนนต์ใหม่ที่ใช้ `Dialog` จาก shadcn/ui พร้อม `backdrop-blur-md` overlay ข้างในจัดเป็นแท็บย่อย (เหมือนเดิม) แต่ย่อลงให้เหมาะกับ modal
- **ลบ route `/settings`** จาก App.tsx (หรือ redirect ไปหน้าหลัก)
- ย้ายเฉพาะ logic ที่จำเป็นจาก Settings.tsx เข้า SettingsDialog (สวิตช์ตั้งค่าทั่วไป + หน้าตั้งค่าหลักยังเปิดได้ถ้าต้องการ)

#### 3. สวิตช์ "รวมยอดยกมา" (Include Carry-Over)
- เก็บค่าตั้งค่าใน Firestore: `users/{uid}/settings/preferences` → `{ include_carry_over: boolean }`
- สร้าง **Context** ใหม่ `src/contexts/SettingsContext.tsx` เพื่อ provide ค่า `includeCarryOver` ทั่วทั้งแอป
- **`SummaryCards.tsx`**: ถ้า `includeCarryOver === false` → การ์ดรายรับแสดงแค่ `actualIncome` (ไม่รวม carryOver), คงเหลือสุทธิ = `actualIncome - actualNonIncome`
- **`YearlyView`**: ใช้ค่าเดียวกันจาก context

#### 4. คำอธิบายตัวเลข
เพิ่ม Tooltip หรือข้อความอธิบายที่ตัวเลขสำคัญ:

- **การ์ดรายรับ**: "↓ 92.8% รวมยกยอด ฿1,357.62" → เพิ่ม tooltip: *"เปอร์เซ็นต์คำนวณจาก ((รายรับจริง + ยอดยกมา) - งบประมาณรายรับ) / งบประมาณรายรับ × 100"*
- **การ์ดรายจ่าย**: "↓ 94.1% งบประมาณ ฿18,754.57" → tooltip: *"เปอร์เซ็นต์คำนวณจาก (รายจ่ายจริง - งบประมาณรายจ่าย) / งบประมาณรายจ่าย × 100"*
- **การ์ดคงเหลือสุทธิ**: tooltip: *"คงเหลือสุทธิ = รายรับจริง + ยอดยกมา - รายจ่ายจริง (ไม่รวมรายการโอน)"*
- **เปรียบเทียบเดือนก่อน**: แต่ละช่อง (รายรับ, รายจ่าย, คงเหลือ) → tooltip: *"เปอร์เซ็นต์เปลี่ยนแปลง = (เดือนนี้ - เดือนก่อน) / เดือนก่อน × 100"*

---

### ไฟล์ที่ต้องแก้ไข/สร้าง

| ไฟล์ | การเปลี่ยนแปลง |
|---|---|
| `src/contexts/ThemeContext.tsx` | แก้ build error บรรทัด 39-43 |
| `src/contexts/SettingsContext.tsx` | **สร้างใหม่** — provide `includeCarryOver` + toggle |
| `src/components/SettingsDialog.tsx` | **สร้างใหม่** — Modal ตั้งค่าพร้อมสวิตช์ |
| `src/components/UserProfilePopover.tsx` | เปลี่ยนปุ่มตั้งค่าเปิด Dialog แทน navigate |
| `src/components/SummaryCards.tsx` | ใช้ `includeCarryOver` + เพิ่ม Tooltip คำอธิบาย |
| `src/components/MonthComparison.tsx` | เพิ่ม Tooltip คำอธิบายสูตรคำนวณ |
| `src/App.tsx` | ห่อด้วย `SettingsProvider` |
| `src/pages/Index.tsx` | ส่ง `includeCarryOver` ไปยัง SummaryCards |

