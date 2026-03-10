

## ปรับ Modal เพิ่มรายการ — ใช้ Theme หลัก + ข้อความสั้น + ไอคอน

### สิ่งที่จะเปลี่ยน

#### 1. เปลี่ยนสีจาก Hardcode เป็น Theme Variables
- Modal background: `bg-slate-800/60` → `bg-card/95 backdrop-blur-xl border-border`
- Input: `bg-white/10 border-white/10 text-white` → `bg-muted/50 border-border text-foreground`
- Text: `text-white`, `text-white/80` → `text-foreground`, `text-muted-foreground`
- Expense สี: ใช้ `bg-destructive` / `text-destructive` (CSS var `--expense`)
- Income สี: ใช้ `bg-accent` / `text-accent` (CSS var `--income`)
- Category cards: `bg-white/5 border-white/10` → `bg-muted/50 border-border`

#### 2. ปรับ Layout ตามรูปอ้างอิง
- **Amount** และ **Date** แยกเป็นคนละแถว (full-width) แทนที่จะอยู่แถวเดียวกัน
- Date แสดงไอคอนปฏิทินด้านซ้าย + วันที่ไทย

#### 3. เพิ่มไอคอนในหมวดหมู่หลัก (Step 1)
- สร้าง mapping `categoryIconMap` ที่ map ชื่อ main_category → Lucide icon
- แสดงไอคอนตรงกลางเหนือข้อความ (layout แบบ `flex-col items-center`)
- ข้อความแสดงเป็นชื่อย่อภาษาอังกฤษ เช่น "DEBT", "SAVINGS", "SUBS.", "GENERAL" ฯลฯ
- ค่าที่ส่งไป Firestore ยังคงเป็นชื่อไทยเดิมไม่เปลี่ยน

#### 4. สร้าง Label Mapping
- สร้าง `categoryLabelMap: Record<string, string>` ที่ map ชื่อหมวดหมู่ไทย → label สั้นภาษาอังกฤษ
- ถ้าไม่มีใน map ให้ fallback แสดงชื่อเดิม
- ใช้กับทั้ง main category (Step 1) และ sub category (Step 2)

### ไฟล์ที่แก้ไข
- **`src/components/AddTransactionFAB.tsx`** — ปรับ styling ทั้งหมดให้ใช้ theme variables, เพิ่ม icon mapping, เปลี่ยน layout amount/date, ปรับ label

### รายละเอียดทางเทคนิค

```text
categoryIconMap = {
  "หนี้สินและผ่อนชำระ": Landmark,
  "เงินออมและการลงทุน": TrendingUp,
  "ค่าสมาชิกรายเดือน": CalendarCheck,
  "ค่าใช้จ่ายทั่วไป": ShoppingBag,
  "ค่าเลี้ยงดูบุตร": Baby,
  "ค่าสาธารณูปโภค": Zap,
  // fallback: CircleDot
}

categoryLabelMap = {
  "หนี้สินและผ่อนชำระ": "DEBT",
  "เงินออมและการลงทุน": "SAVINGS",
  "ค่าสมาชิกรายเดือน": "SUBS.",
  "ค่าใช้จ่ายทั่วไป": "GENERAL",
  "ค่าเลี้ยงดูบุตร": "CHILDCARE",
  "ค่าสาธารณูปโภค": "UTILITIES",
  // fallback: ชื่อเดิม
}
```

- Category card: เปลี่ยนจาก `text-left` → `flex flex-col items-center justify-center` พร้อมไอคอนขนาด 24px
- Sub-category (Step 2): แสดงชื่อเดิม (ไทย) เพราะเป็นรายละเอียด ไม่จำเป็นต้องย่อ
- ข้อมูลที่บันทึก (`main_category`, `sub_category`) ยังคงเป็นค่าเดิมทุกประการ

