import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUpRight, ArrowDownRight, Minus, TrendingUp, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BudgetData } from "@/hooks/useBudgetData";
import type { Account } from "@/types/finance";

interface Props {
  data: BudgetData;
}

const LIABILITY_TYPES = new Set(["credit_card", "loan", "payable"]);

function formatCurrency(n: number) {
  return `฿${Math.abs(n).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getPrevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

type TooltipRow = { label: string; value: string; highlight?: boolean; color?: "green" | "red" };

function ChangeIndicator({ current, previous, label, invertColor = false, signed = false, rows, tooltipTitle }: {
  current: number;
  previous: number;
  label: string;
  invertColor?: boolean;
  signed?: boolean;
  rows: TooltipRow[];
  tooltipTitle: string;
}) {
  const diff = current - previous;
  const pct = previous !== 0 ? Math.round((diff / Math.abs(previous)) * 100) : current !== 0 ? 100 : 0;
  const isUp = diff > 0;
  const isZero = diff === 0;
  const isPositive = invertColor ? !isUp : isUp;

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold font-display">{signed && current < 0 ? "-" : ""}{formatCurrency(current)}</p>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-xs cursor-help">
            {isZero ? (
              <>
                <Minus className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">ไม่เปลี่ยนแปลง</span>
              </>
            ) : (
              <>
                {isUp ? (
                  <ArrowUpRight className={cn("h-3 w-3", isPositive ? "text-accent" : "text-destructive")} />
                ) : (
                  <ArrowDownRight className={cn("h-3 w-3", isPositive ? "text-accent" : "text-destructive")} />
                )}
                <span className={cn(isPositive ? "text-accent" : "text-destructive")}>
                  {isUp ? "+" : ""}{pct}% ({isUp ? "+" : ""}{formatCurrency(diff)})
                </span>
              </>
            )}
            <Info className="h-3 w-3 text-muted-foreground/40" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={16} collisionPadding={20} className="p-0 border-border bg-popover shadow-xl rounded-lg">
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-semibold text-foreground">{tooltipTitle}</p>
          </div>
          <table className="text-xs w-full">
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className={row.highlight ? "bg-muted/50" : ""}>
                  <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{row.label}</td>
                  <td className={`px-3 py-1.5 text-right whitespace-nowrap ${
                    row.color === "green" ? "font-semibold text-emerald-500" :
                    row.color === "red" ? "font-semibold text-red-500" :
                    row.highlight ? "font-semibold text-foreground" : "text-foreground"
                  }`}>{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function MonthComparison({ data }: Props) {
  const { userId } = useAuth();
  const [prevData, setPrevData] = useState<{ income: number; expense: number } | null>(null);
  const [prevCarryOver, setPrevCarryOver] = useState<number>(0);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const prevPeriod = getPrevPeriod(data.period);

  useEffect(() => {
    if (!userId || !data.period) return;

    // ดึง transactions เดือนก่อน
    const txCol = collection(firestore, "users", userId, "transactions");
    const q = query(txCol, where("month_year", "==", prevPeriod));
    getDocs(q).then((snap) => {
      let income = 0;
      let expense = 0;
      snap.forEach((d) => {
        const t = d.data();
        if (t.is_deleted) return;
        if (t.type === "income") income += Number(t.amount) || 0;
        if (t.type === "expense") expense += Number(t.amount) || 0;
      });
      setPrevData({ income, expense });
    });

    // ดึง carry_over เดือนก่อน จาก budget doc
    getDoc(doc(firestore, "users", userId, "budgets", prevPeriod)).then((snap) => {
      setPrevCarryOver(snap.exists() ? (snap.data().carry_over as number) ?? 0 : 0);
    });

    // ดึง accounts (current snapshot สำหรับ backward reconstruction)
    getDocs(collection(firestore, "users", userId, "accounts")).then((snap) => {
      setAccounts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Account)).filter((a) => !a.is_deleted));
    });
  }, [userId, data.period]);

  const currentIncome = data.transactions.filter((t) => t.type === "รายรับ").reduce((s, t) => s + t.amount, 0);
  const currentExpense = data.transactions
    .filter((t) => t.type !== "รายรับ" && t.type !== "โอน" && t.type !== "โอนระหว่างบัญชี" && t.category !== "โอนระหว่างบัญชี")
    .reduce((s, t) => s + t.amount, 0);

  // backward reconstruction 1 ขั้น: ยอดบัญชีสิ้น prevMonth = currentBalance − effect ของ currentMonth tx
  const accountMetrics = useMemo(() => {
    if (!accounts.length) return null;

    const main = accounts.find((a) => a.name === "กระเป๋าเงินสดหลัก")
      ?? accounts.find((a) => a.type === "cash");

    // delta = ผลของ transaction เดือนปัจจุบันต่อยอดแต่ละบัญชี
    const delta = new Map<string, number>();
    for (const t of data.transactions) {
      const amt = t.amount;
      const isTransfer = t.type === "โอน" || t.type === "โอนระหว่างบัญชี" || t.category === "โอนระหว่างบัญชี";
      if (t.type === "รายรับ") {
        if (t.to_account_id) delta.set(t.to_account_id, (delta.get(t.to_account_id) ?? 0) + amt);
      } else if (isTransfer) {
        if (t.from_account_id) delta.set(t.from_account_id, (delta.get(t.from_account_id) ?? 0) - amt);
        if (t.to_account_id) delta.set(t.to_account_id, (delta.get(t.to_account_id) ?? 0) + amt);
      } else {
        if (t.from_account_id) delta.set(t.from_account_id, (delta.get(t.from_account_id) ?? 0) - amt);
      }
    }

    let curOther = 0, curLiab = 0;
    let prevOther = 0, prevLiab = 0;

    for (const a of accounts) {
      if (main && a.id === main.id) continue;
      const curBal = Number(a.balance) || 0;
      const prevBal = curBal - (delta.get(a.id) ?? 0);
      if (LIABILITY_TYPES.has(a.type)) {
        curLiab += Math.abs(curBal);
        prevLiab += Math.abs(prevBal);
      } else {
        curOther += curBal;
        prevOther += prevBal;
      }
    }

    return { curOther, curLiab, prevOther, prevLiab };
  }, [accounts, data.transactions]);

  if (!prevData || (prevData.income === 0 && prevData.expense === 0)) return null;

  const currentNet = currentIncome - currentExpense;
  const prevNet = prevData.income - prevData.expense;
  const incomeDiff = currentIncome - prevData.income;
  const expenseDiff = currentExpense - prevData.expense;
  const netDiff = currentNet - prevNet;

  const currentNetWorth = data.carryOver + currentIncome - currentExpense;
  const prevNetWorth = prevCarryOver + prevData.income - prevData.expense;
  const netWorthDiff = currentNetWorth - prevNetWorth;

  const curOther = accountMetrics?.curOther ?? 0;
  const curLiab = accountMetrics?.curLiab ?? 0;
  const prevOther = accountMetrics?.prevOther ?? 0;
  const prevLiab = accountMetrics?.prevLiab ?? 0;

  const fmt = (n: number) => `฿${Math.abs(n).toLocaleString("th-TH")}`;
  const fmtSigned = (n: number) => `${n < 0 ? "-" : ""}฿${Math.abs(n).toLocaleString("th-TH")}`;

  return (
    <Card className="border-none shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          เปรียบเทียบกับเดือนก่อน
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* แถวที่ 1: รายรับ รายจ่าย คงเหลือ */}
        <div className="grid grid-cols-3 gap-4">
          <ChangeIndicator
            current={currentIncome} previous={prevData.income} label="รายรับ"
            tooltipTitle="รายรับ — เปรียบเทียบ"
            rows={[
              { label: "เดือนนี้", value: fmt(currentIncome), highlight: true },
              { label: "เดือนก่อน", value: fmt(prevData.income) },
              { label: "ผลต่าง", value: `${incomeDiff >= 0 ? "+" : ""}${fmt(incomeDiff)}`, highlight: true, color: incomeDiff >= 0 ? "green" : "red" },
            ]}
          />
          <ChangeIndicator
            current={currentExpense} previous={prevData.expense} label="รายจ่าย" invertColor
            tooltipTitle="รายจ่าย — เปรียบเทียบ"
            rows={[
              { label: "เดือนนี้", value: fmt(currentExpense), highlight: true },
              { label: "เดือนก่อน", value: fmt(prevData.expense) },
              { label: "ผลต่าง", value: `${expenseDiff >= 0 ? "+" : ""}${fmt(expenseDiff)}`, highlight: true, color: expenseDiff > 0 ? "red" : "green" },
            ]}
          />
          <ChangeIndicator
            current={currentNet} previous={prevNet} label="คงเหลือ" signed
            tooltipTitle="คงเหลือ — เปรียบเทียบ"
            rows={[
              { label: "เดือนนี้", value: fmtSigned(currentNet), highlight: true },
              { label: "เดือนก่อน", value: fmtSigned(prevNet) },
              { label: "ผลต่าง", value: `${netDiff >= 0 ? "+" : ""}${fmt(netDiff)}`, highlight: true, color: netDiff >= 0 ? "green" : "red" },
              { label: "หมายเหตุ", value: "ไม่รวมรายการโอน" },
            ]}
          />
        </div>

        {/* แถวที่ 2: สินทรัพย์ หนี้สิน Net Worth */}
        {accountMetrics && (
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-border/50">
            <ChangeIndicator
              current={curOther} previous={prevOther} label="สินทรัพย์"
              tooltipTitle="สินทรัพย์อื่น — เปรียบเทียบ"
              rows={[
                { label: "เดือนนี้", value: fmt(curOther), highlight: true },
                { label: "เดือนก่อน", value: fmt(prevOther) },
                { label: "ผลต่าง", value: `${curOther - prevOther >= 0 ? "+" : ""}${fmt(curOther - prevOther)}`, highlight: true, color: curOther >= prevOther ? "green" : "red" },
                { label: "หมายเหตุ", value: "ไม่รวมกระเป๋าหลักและหนี้สิน" },
              ]}
            />
            <ChangeIndicator
              current={curLiab} previous={prevLiab} label="หนี้สิน" invertColor
              tooltipTitle="หนี้สิน — เปรียบเทียบ"
              rows={[
                { label: "เดือนนี้", value: fmt(curLiab), highlight: true },
                { label: "เดือนก่อน", value: fmt(prevLiab) },
                { label: "ผลต่าง", value: `${curLiab - prevLiab >= 0 ? "+" : ""}${fmt(curLiab - prevLiab)}`, highlight: true, color: curLiab > prevLiab ? "red" : "green" },
                { label: "หมายเหตุ", value: "บัตรเครดิต / สินเชื่อ / เจ้าหนี้" },
              ]}
            />
            <ChangeIndicator
              current={currentNetWorth} previous={prevNetWorth} label="Net Worth" signed
              tooltipTitle="Net Worth — เปรียบเทียบ"
              rows={[
                { label: "เดือนนี้ (carry)", value: fmt(data.carryOver) },
                { label: "เดือนนี้ (net)", value: fmtSigned(currentNetWorth), highlight: true },
                { label: "เดือนก่อน (carry)", value: fmt(prevCarryOver) },
                { label: "เดือนก่อน (net)", value: fmtSigned(prevNetWorth) },
                { label: "ผลต่าง", value: `${netWorthDiff >= 0 ? "+" : ""}${fmt(netWorthDiff)}`, highlight: true, color: netWorthDiff >= 0 ? "green" : "red" },
              ]}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
