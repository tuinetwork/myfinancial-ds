# สูตรคำนวณทั้งหมด — MyFinancial

## สารบัญ
1. [trueNetWorth (ความมั่งคั่งสุทธิสะสม)](#1-truenetworth)
2. [carry_over (ยอดยกมาต้นเดือน)](#2-carry_over)
3. [trueNetWorth ของเดือน](#3-truenetworth-ของเดือน)
4. [เงินสดในมือ / mainWalletBalance](#4-เงินสดในมือ)
5. [Net Worth (มูลค่าสุทธิ)](#5-net-worth)
6. [สินทรัพย์/หนี้สินเดือนนี้ (cash-flow based)](#6-สินทรัพยหนี้สินเดือนนี้)
7. [ยอดชำระหนี้เดือนนี้](#7-ยอดชำระหนี้เดือนนี้)
8. [รายรับที่แสดง (displayIncome)](#8-รายรับที่แสดง)
9. [รายจ่ายจริง](#9-รายจ่ายจริง)
10. [คาดการณ์สิ้นเดือน](#10-คาดการณ์สิ้นเดือน)
11. [อัตราการออม](#11-อัตราการออม)
12. [ค่าเฉลี่ยรายจ่ายต่อวัน](#12-ค่าเฉลี่ยรายจ่ายต่อวัน)
13. [walletHistory backward reconstruction](#13-wallethistory-backward-reconstruction)
14. [Budget vs Actual](#14-budget-vs-actual)
15. [เป้าหมาย (Goal Progress)](#15-เป้าหมาย)
16. [การลงทุน (Investment P&L)](#16-การลงทุน)
17. [แผนปลดหนี้ (Debt Progress)](#17-แผนปลดหนี้)

---

## ประเภทบัญชีและการจัดกลุ่ม

| กลุ่ม | ประเภท | นับใน liabilities | นับใน เงินสดในมือ |
|---|---|:-:|:-:|
| **สินทรัพย์** | cash, bank, savings, investment, receivable, inventory | ❌ | ✅ (เป็น otherAssets) |
| **หนี้สิน** | credit_card, loan, payable | ✅ | ✅ (บวกกลับ) |
| **หนี้สิน (ตัดจากเงินสด)** | chit (ค่าแชร์) | ✅ | ❌ (ไม่บวกกลับ) |

**กระเป๋าเงินสดหลัก** (ชื่อ "กระเป๋าเงินสดหลัก") = ไม่นับใน otherAssets หรือ liabilities — เป็นค่าที่ถูกคำนวณออกมา

---

## 1. trueNetWorth

ความมั่งคั่งสุทธิสะสมตั้งแต่ต้น — คำนวณจาก transactions ทั้งหมด

```
trueNetWorth = Σ income(ทุกเดือน) − Σ expense(ทุกเดือน)
```

| รายการ | นับ | ไม่นับ |
|---|---|---|
| income | ✅ | |
| expense | ✅ | |
| transfer | | ❌ |
| is_deleted = true | | ❌ |

**ใช้ที่**: AccountsPage, OverviewPage (NetWorthCard, AccountsSummary)
**ใช้ทำ**: reconstruct ยอดกระเป๋าหลัก

---

## 2. carry_over

ยอดยกมาต้นเดือน — สะสม net ของเดือนก่อนๆ

```
carry_over[เดือนแรก] = 0

carry_over[M] = carry_over[M-1] + net[M-1]
net[M] = income[M] − expense[M]
```

**Guard**: ถ้า M-1 = เดือนปัจจุบัน (ยังไม่จบ) → ไม่ rollover net เข้า carry

**ตัวอย่าง**:
```
ม.ค.: carry=0,     income=20000, expense=15000, net=5000
ก.พ.: carry=5000,  income=20000, expense=18000, net=2000
มี.ค.: carry=7000, income=20000, expense=16000, net=4000
เม.ย.: carry=11000 ...
```

**ใช้ที่**: useBudgetData (syncCarryOver), carry-over-recalc

---

## 3. trueNetWorth ของเดือน

Net Worth ณ สิ้นเดือน M (ใช้ใน walletHistory)

```
trueNetWorth[M] = carry_over[M] + income[M] − expense[M]
```

- carry_over มี cumulative จากเดือนก่อนๆ อยู่แล้ว
- ดังนั้น trueNetWorth[M] = Σ income(เดือน 1..M) − Σ expense(เดือน 1..M)

**ใช้ที่**: carry-over-recalc.ts, SummaryCards

---

## 4. เงินสดในมือ

ยอดเงินจริงในกระเป๋าหลัก — **สูตรหลักของแอป**

```
เงินสดในมือ = trueNetWorth − otherAssets + (liabilities − cashExcludedLiab)
```

### ส่วนประกอบ

```
otherAssets = Σ balance ของบัญชี active ที่:
             - ไม่ใช่กระเป๋าหลัก
             - ไม่ใช่หนี้สิน
             เช่น bank=5000, savings=10000, investment=7800
             → otherAssets = 22800

liabilities = Σ |balance| ของบัญชีหนี้สิน active ทุกประเภท
              เช่น loan=8533.18, chit=8700
              → liabilities = 17233.18

cashExcludedLiab = Σ |balance| ของบัญชี chit เท่านั้น
                   เช่น chit=8700
                   → cashExcludedLiab = 8700
```

### ตัวอย่างจริง
```
trueNetWorth      = 14,348.55
− otherAssets     = 22,800.00
+ liabilities     = 17,233.18
− cashExcludedLiab = 8,700.00
─────────────────────────────
= เงินสดในมือ     =    81.73
```

### ทำไมต้องตัด chit?
chit (ค่าแชร์) เป็นหนี้สินที่ไม่ได้ทำให้เงินสดในกระเป๋าเพิ่มขึ้น (เงินแชร์ยังไม่ได้รับ หรือรับมาแล้วใช้ไปแล้ว) ดังนั้นไม่ควรบวกกลับเข้ากระเป๋า

### 2 variant
| Variant | ใช้ balances จาก | ใช้ที่ |
|---|---|---|
| **Current snapshot** | account.balance ปัจจุบัน | AccountsPage, Overview NetWorthCard, AccountsSummary |
| **Historical per-period** | backward reconstruction (ดูสูตร #13) | walletHistory ตารางรายเดือน, Overview tooltip |

**สำคัญ**: ทั้ง 2 variant ใช้สูตรเดียวกัน (centralized ใน `wallet-balance.ts`)

---

## 5. Net Worth

มูลค่าสุทธิ — ใช้แสดงในการ์ด "มูลค่าสุทธิ (Net Worth)"

```
Net Worth = totalAssets − totalLiabilities
```

```
totalAssets = Σ balance ของบัญชีสินทรัพย์ active
             (กระเป๋าหลัก ใช้ค่า mainWalletBalance ที่คำนวณแล้ว)

totalLiabilities = Σ |balance| ของบัญชีหนี้สิน active
                   (credit_card, loan, payable, chit — ทุกประเภท)
```

**หมายเหตุ**: Net Worth นับ chit เป็นหนี้สินปกติ (ต่างจากเงินสดในมือที่ตัดออก)

---

## 6. สินทรัพย์/หนี้สินเดือนนี้

Cash-flow based — แสดงในการ์ด Dashboard (มุมมองรายเดือน)

```
cashFlowAssets = Σ amount ของ tx ที่:
                (1) โอนจากกระเป๋าหลัก → บัญชี savings/investment
                (2) expense type "เงินออม/การลงทุน"

cashFlowLiab   = Σ amount ของ tx ที่:
                โอนจากบัญชี loan/payable/chit → กระเป๋าหลัก
                (= หนี้ใหม่ที่ก่อขึ้นจริงเดือนนี้เท่านั้น)

cashFlowNetWorth = cashFlowAssets − cashFlowLiab
```

**หมายเหตุ**: สูตรนี้ต่างจาก Net Worth (#5) ตรงที่นับเฉพาะ "การเคลื่อนไหว" ของเดือนนี้ ไม่ใช่ยอดคงค้าง

---

## 7. ยอดชำระหนี้เดือนนี้

```
debtPaidMonthly = Σ amount ของ tx ที่:
                 (1) โอนจากกระเป๋าหลัก → บัญชี loan/payable/chit
                 (2) expense type "หนี้สิน"
```

**แสดงที่**: การ์ด "หนี้สิน" subtitle "ชำระแล้ว ฿X"

---

## 8. รายรับที่แสดง

```
displayIncome = actualIncome + withdrawFromSavings + effectiveCarryOver
```

```
actualIncome        = Σ amount ของ tx type "รายรับ" เดือนนี้

withdrawFromSavings = Σ amount ของ tx โอนจาก savings/investment → กระเป๋าหลัก
                      (ถอนจากบัญชีออม/ลงทุนกลับมาใช้)

effectiveCarryOver  = includeCarryOver ? carry_over : 0
                      (ผู้ใช้เลือกได้ว่าจะรวมยอดยกมาในรายรับหรือไม่)
```

---

## 9. รายจ่ายจริง

```
actualExpense = Σ amount ของ tx ที่:
               type ≠ "รายรับ" AND ไม่ใช่ transfer
```

Transfer ไม่นับเป็นรายจ่าย (เป็นแค่ย้ายเงินระหว่างบัญชี)

---

## 10. คาดการณ์สิ้นเดือน

```
totalDays    = จำนวนวันในเดือน (28-31)
elapsedDays  = วันที่ปัจจุบัน (1-31)
remainingDays = totalDays − elapsedDays

dailyBurnRate = actualExpense / elapsedDays

budgetedIncome = Σ budget ของ income items + effectiveCarryOver
projectedIncome = max(actualIncome, budgetedIncome)

projectedAdditionalExpense = remainingDays × dailyBurnRate
projectedBalance = projectedIncome − (actualExpense + projectedAdditionalExpense)
```

### ตัวอย่าง
```
วันที่ 24 ของเดือน (31 วัน):
  actualExpense = 9,906, elapsedDays = 24
  dailyBurnRate = 9,906 / 24 = 412.75
  remainingDays = 31 − 24 = 7
  projectedAdditional = 7 × 412.75 = 2,889.25
  projectedIncome = max(19,000+5,254, 21,600+5,254) = 26,854
  projectedBalance = 26,854 − (9,906 + 2,889.25) = 14,058.75
```

### Confidence level
```
elapsedDays ≥ 15 → "high"    (ข้อมูลเพียงพอ)
elapsedDays ≥ 7  → "medium"  (พอใช้ได้)
elapsedDays < 7  → "low"     (ยังน้อยเกินไป)
```

---

## 11. อัตราการออม

```
savingsRate = (income − expense) / income × 100
```

- คำนวณ per-month
- ใช้ใน OverviewPage trend chart (6 เดือน)

---

## 12. ค่าเฉลี่ยรายจ่ายต่อวัน

```
avgDailyExpense = actualExpense / elapsedDays

elapsedDays = วันที่ปัจจุบัน (ถ้าเป็นเดือนนี้) หรือ จำนวนวันในเดือน (ถ้าเป็นเดือนที่ผ่านแล้ว)
```

ใช้ `elapsedDays` เหมือนกับ `dailyBurnRate` ใน forecast (#10) เพราะวันที่ "ไม่ใช้เงินเลย"
ก็ควรถูกนับมาถัวเฉลี่ยเพื่อให้เห็นพฤติกรรมจริง

---

## 13. walletHistory backward reconstruction

คำนวณ mainWalletBalance ย้อนหลังทุกเดือน โดยไม่ต้องเก็บ snapshot

### หลักการ
```
balance ของบัญชี ณ สิ้นเดือน M = currentBalance − Σ(effects ของ tx หลังเดือน M)
```

### Effects ของ transaction ต่อ account balance
```
income:   to_account_id   += amount
expense:  from_account_id -= amount
transfer: from_account_id -= amount, to_account_id += amount
```

### ขั้นตอน (ไล่จากเดือนล่าสุดถอยหลัง)
```
afterDelta = {} // สะสม effects ของ tx "หลังจาก" เดือนปัจจุบัน

สำหรับแต่ละเดือน M (จากใหม่ → เก่า):
  สำหรับแต่ละ account A (ที่ไม่ใช่กระเป๋าหลัก):
    hist[A] = currentBalance[A] − afterDelta[A]

  จัดกลุ่ม:
    otherAssets[M]      = Σ hist ของ A ที่ไม่ใช่หนี้สิน
    liabilities[M]      = Σ |hist| ของ A ที่เป็นหนี้สิน
    cashExcludedLiab[M] = Σ |hist| ของ A ที่เป็น chit

  mainWalletBalance[M] = trueNetWorth[M] − otherAssets[M]
                        + (liabilities[M] − cashExcludedLiab[M])

  // เพิ่ม effects ของเดือน M เข้า afterDelta (สำหรับเดือนก่อนหน้า)
  afterDelta += effects ของ tx ในเดือน M
```

### ตัวอย่าง
```
ปัจจุบัน: savings.balance = 10,000
tx หลังจาก มี.ค.: โอนเข้า savings +2,000 (เม.ย.), +1,000 (พ.ค.)
afterDelta[savings] = +3,000
hist[savings] ณ สิ้น มี.ค. = 10,000 − 3,000 = 7,000
```

---

## 14. Budget vs Actual

### Budget items ที่มี recurrence
```
expandedBudget = budget × จำนวน occurrences ในเดือน

occurrences = expandRecurrence(startDate, rrule, year, month, rangeStart, rangeEnd)

RRULE รองรับ:
  FREQ=DAILY   → ทุกวันในเดือน
  FREQ=WEEKLY;BYDAY=XX → ทุกสัปดาห์วัน XX (SU,MO,TU,...)
  FREQ=MONTHLY → เดือนละ 1 ครั้ง (ตามวัน due_date)
```

### จับคู่ tx กับ occurrence (paid detection)
```
matchTxToOccurrences(txList, occurrenceDates, perOccurrence):
  สำหรับแต่ละ occurrenceDate (เรียงจากเก่า→ใหม่):
    หา tx ที่ |txDate − occurrenceDate| ≤ 3 วัน
    ถ้า matched amount ≥ perOccurrence → isPaid = true
    tx ที่ใช้แล้ว จะไม่ถูกใช้ซ้ำกับ occurrence อื่น
```

---

## 15. เป้าหมาย

```
progress% = (current_amount / target_amount) × 100
```

### Auto-sync
```
ถ้า linked_account_id มีค่า:
  current_amount = account.balance ของบัญชีที่ link

ถ้า budget item ชื่อตรงกับ goal.name และมี recurrence:
  target_amount = budget × จำนวน installments ทั้งหมด (ตั้งแต่ start_date ถึง end_date)
```

---

## 16. การลงทุน

```
marketValue   = total_units × current_market_price
costBasis     = total_units × average_cost_per_unit
unrealizedPL  = marketValue − costBasis
plPercent     = (unrealizedPL / costBasis) × 100
```

### Portfolio allocation
```
allocation% = marketValue[asset] / Σ marketValue[ทั้งหมด] × 100
```

---

## 17. แผนปลดหนี้

```
progress%  = (initial_balance − current_balance) / initial_balance × 100
paid       = initial_balance − current_balance
remaining  = current_balance
```

- initial_balance = ยอดหนี้ตั้งต้น (ระบุตอนสร้างบัญชี)
- current_balance = ยอดคงค้างปัจจุบัน (อัปเดตจาก transaction atomic)

---

## ⚠️ จุดที่ต้องระวัง / ควรปรับปรุง

### 1. Soft-deleted accounts ทำให้ mainWalletBalance เพี้ยน
- trueNetWorth นับ tx ของทุก account (รวม deleted)
- otherAssets / liabilities นับเฉพาะ active accounts
- **แก้**: ควร zero-out balance ก่อน soft-delete หรือ filter tx ตาม active accounts

### 2. ~~dailyBurnRate vs avgDailyExpense ไม่ consistent~~ ✅ แก้แล้ว
- ทั้ง dailyBurnRate (forecast) และ avgDailyExpense (Overview) ใช้ `elapsedDays` เหมือนกันแล้ว

### 3. "หนี้สิน" vs "ชำระแล้ว" ไม่สัมพันธ์กัน
- หนี้สิน = หนี้ใหม่เดือนนี้ (อาจ 2,500)
- ชำระแล้ว = ชำระหนี้ทั้งเก่าและใหม่ (อาจ 7,000+)
- **แก้**: เปลี่ยน label หรือ แยกแสดง "หนี้ใหม่" กับ "หนี้เก่าที่ชำระ"

### 4. Net Worth 2 ที่ คำนวณต่างกัน
- NetWorthCard = จาก account balances (ยอดรวมคงค้าง)
- การ์ดสรุปเดือนนี้ = จาก cash flow เดือนนี้ (สินทรัพย์ที่เพิ่ม − หนี้ที่ก่อ)
- **แก้**: เปลี่ยน label ให้ชัด "Net Worth รวม" vs "สินทรัพย์สุทธิเดือนนี้"

### 5. walletHistory ไม่มี drift detection
- สมมติว่าทุก balance change ผ่าน transaction
- ถ้า manual adjust balance → ประวัติย้อนหลังเพี้ยน
- **แก้**: เก็บ monthly balance snapshot หรือ ตรวจจับ drift แล้วแจ้งเตือน
