## เป้าหมาย

สร้างเครื่องคิดเลข (Calculator) ที่:

- เปิดด้วย **ปุ่มลอย (Trigger Button)** ที่อยู่มุมขวาล่าง **เหนือปุ่ม FAB เพิ่มรายการเดิม**
- แสดงเป็น **Draggable Floating Window** (ลากย้ายตำแหน่งได้ทั่วหน้าจอ)
- รองรับ **คีย์บอร์ด**: `0-9` `.` `+` `-` `*` `/` `Enter` (=) `Backspace` (DEL) `Escape` (C) `%`
- มีปุ่ม `C`, `DEL`, `/`, `*`, `-`, `+`, `=`, `%`, `0-9`, `.` ตามภาพอ้างอิง

## ไฟล์ที่จะสร้าง / แก้ไข

### 1. สร้างใหม่: `src/components/CalculatorFAB.tsx`

- คอมโพเนนต์เดี่ยวที่จัดการทั้ง 3 ส่วน:
  1. **ปุ่มลอย Trigger** — ตำแหน่ง `fixed bottom-24 right-6 z-40` (อยู่เหนือ AddTransactionFAB ที่ใช้ `bottom-6`) ขนาด 48×48 ทรงกลม ไอคอน `Calculator` จาก lucide-react ใช้ design token (`bg-primary` / `bg-card` border) — ซ่อนอัตโนมัติบนมือถือ (`hidden md:flex`) เพื่อไม่ชนกับ BottomNavbar
  2. **Floating Window** — render เมื่อ `open=true` ด้วย `position: fixed` และ `transform: translate(x, y)`; เริ่มต้นใกล้ปุ่ม trigger
  3. **State**: `display`, `previousValue`, `operator`, `waitingForOperand`, `position {x, y}`, `dragging`

### 2. ตรรกะเครื่องคิดเลข (ใน CalculatorFAB)

- `inputDigit(d)` — ต่อตัวเลข, ถ้า `waitingForOperand` ให้แทนที่
- `inputDot()` — เพิ่ม `.` ครั้งเดียว
- `clear()` — รีเซ็ตทุกอย่าง
- `del()` — ตัดอักขระท้าย (ถ้าเหลือตัวเดียวให้เป็น `0`)
- `percent()` — `display = display / 100`
- `performOperation(nextOp)` — คำนวณ `previousValue [operator] currentValue` ด้วย switch (`+ - * /`); ป้องกันหารด้วย 0 (แสดง `Error`)
- `equals()` — เรียก `performOperation` แล้วเคลียร์ operator
- จัดรูปแบบผลลัพธ์: `Number.toLocaleString('en-US', { maximumFractionDigits: 10 })` ป้องกัน floating point เพี้ยน (ใช้ `Math.round(x * 1e10) / 1e10`)  
  


### 3. รองรับคีย์บอร์ด

- `useEffect` ติดตั้ง `window.addEventListener('keydown', handler)` เฉพาะตอน `open=true`
- Mapping:
  - `0-9` → `inputDigit`
  - `.` → `inputDot`
  - `+ - * /` → `performOperation`
  - `Enter` หรือ `=` → `equals` (preventDefault เพื่อกัน form submit)
  - `Backspace` → `del`
  - `Escape` หรือ `c/C` → `clear`
  - `%` → `percent`
- Cleanup ตอน unmount / ปิด

### 4. Drag & Drop

- ใช้ `onMouseDown` ที่ header bar เท่านั้น (มี cursor-grab)
- เก็บ `dragOffset` ตอนกดเริ่ม
- `useEffect` ติดตั้ง `mousemove` + `mouseup` บน `window` ขณะ `dragging=true`
- จำกัดตำแหน่งไม่ให้หลุดขอบหน้าจอ (`Math.max/min` กับ `window.innerWidth/Height`)
- รองรับ touch event (`touchstart/touchmove/touchend`) สำหรับแท็บเล็ต

### 5. UI/Styling (ตรงกับภาพอ้างอิง + Design System)

- Container: `bg-card border border-border rounded-2xl shadow-2xl w-72`
- Header bar: ชื่อ "เครื่องคิดเลข" + ปุ่มปิด (X) — `cursor-grab` สำหรับลาก
- Display: `bg-foreground text-background` ฟอนต์ `font-mono` (Space Grotesk) ขนาดใหญ่ จัดขวา
- Grid 4 คอลัมน์ของปุ่ม:
  - แถว 1: `C` (destructive/red), `DEL` (muted), `%` (accent), `/` (accent/orange)
  - แถว 2: `7 8 9 *`
  - แถว 3: `4 5 6 -`
  - แถว 4: `1 2 3 +`
  - แถว 5: `0` (col-span-2), `.`, `=` (primary/blue)
- ใช้ design tokens (`bg-primary`, `bg-destructive`, `bg-muted`, `bg-accent`) **ห้ามใส่สี hex ตรง ๆ** ตาม Core memory
- ปุ่มทั้งหมด: `h-12 rounded-lg active:scale-95 transition-transform`

### 6. แก้ไข `src/App.tsx`

- import `CalculatorFAB`
- mount หลัง `AddTransactionFAB` (บรรทัด ~195) เพื่อให้แสดงคู่กัน — ภายใน CalculatorFAB จะจัดการ state `open` ของตัวเองได้ ไม่ต้องส่ง props จาก App
- ตำแหน่งปุ่ม trigger ใช้ `bottom-24 right-6` (FAB เดิม `bottom-6 right-6` สูงประมาณ 56px → เว้น 16px → 24)

## หมายเหตุ

- ไม่กระทบฟีเจอร์อื่น (FAB เพิ่มรายการ, BottomNavbar)
- ซ่อนบนมือถือเพื่อไม่ชน BottomNavbar — หากต้องการให้แสดงบนมือถือด้วยให้บอกในรอบถัดไป
- ภาษาไทยทั้งหมด (header, tooltip, aria-label)