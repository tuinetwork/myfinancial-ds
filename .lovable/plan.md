## ปัญหา
ภาพแสดงยอดยกมา ฿5,254.8 แต่เงินสดในมือจริงคือ ฿292.03 — ตัวเลขไม่ตรงกัน

## สาเหตุ
แม้รอบที่แล้วได้แก้สูตร `syncCarryOver` ให้คำนวณจากกระเป๋าเงินสดหลักแล้ว แต่ยังใช้แบบ **incremental** คือ
`carryOver = prev_month.carry_over + net_flow(prev_month)`

ปัญหาคือ `prev_month.carry_over` ที่เก็บใน Firestore ถูกคำนวณด้วย **สูตรเก่า** (รวมทุกบัญชี รวมโอนเงินผ่านบัญชีธนาคาร/บัตรเครดิต) จึงปนเปื้อนต่อเนื่องมาทั้ง chain ทำให้ยอดยกมาเดือนปัจจุบันยังเพี้ยน

## การแก้ไข

ปรับ `syncCarryOver` ใน `src/hooks/useBudgetData.ts` ให้ **full scan ทุกครั้ง** ไม่พึ่ง `carry_over` เก่าที่เก็บไว้:

```text
carry_over(period) = Σ net_cash_flow(main_wallet, tx) ของทุก tx ที่ month_year < period
```

โดย `computeMainWalletNet` ที่มีอยู่แล้วจะ:
- income → +amount เมื่อ `to_account_id == mainWalletId` (หรือไม่ระบุบัญชี = legacy cash)
- expense → −amount เมื่อ `from_account_id == mainWalletId` (หรือ legacy cash)
- transfer → ±amount ตามทิศทางต่อกระเป๋าหลัก

## ผลลัพธ์
- ยอดยกมาแต่ละเดือน = ยอดเงินสดในมือ ณ สิ้นเดือนก่อน (ไม่รวมเงินในธนาคาร/เงินออม/บัตรเครดิต)
- เลข chain เก่าที่ปนเปื้อนถูก override ทันทีเมื่อโหลดหน้า dashboard
- ค่าใช้จ่ายผ่านบัตรเครดิต/บัญชีธนาคารจะไม่ลดยอดเงินสดในมืออีกต่อไป

## Trade-off
- เสีย optimization แบบ incremental (อ่าน tx ทุกเดือนก่อนทุกครั้งที่เปลี่ยนเดือน) — ยอมรับได้สำหรับขนาดข้อมูลส่วนตัว และอ่านครั้งเดียวต่อการเปลี่ยน period

## ไฟล์ที่แก้
- `src/hooks/useBudgetData.ts` (เฉพาะฟังก์ชัน `syncCarryOver`, ~28 บรรทัด)
