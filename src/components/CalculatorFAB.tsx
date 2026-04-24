import { useState, useEffect, useRef, useCallback } from "react";
import { Calculator, X, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

type Operator = "+" | "-" | "*" | "/" | null;

const INITIAL_POS = { x: 0, y: 0 };
const WINDOW_W = 288; // w-72
const WINDOW_H = 420;

function roundFloat(n: number) {
  if (!isFinite(n)) return n;
  return Math.round(n * 1e10) / 1e10;
}

function formatDisplay(s: string) {
  if (s === "Error") return s;
  // Allow trailing dot while typing
  if (s.endsWith(".")) {
    const intPart = s.slice(0, -1);
    const num = Number(intPart);
    if (!isNaN(num)) return num.toLocaleString("en-US") + ".";
  }
  const num = Number(s);
  if (isNaN(num)) return s;
  // Preserve decimals as typed
  if (s.includes(".")) {
    const [i, d] = s.split(".");
    return Number(i).toLocaleString("en-US") + "." + d;
  }
  return num.toLocaleString("en-US", { maximumFractionDigits: 10 });
}

export default function CalculatorFAB() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState("0");
  const [previousValue, setPreviousValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator>(null);
  const [waitingForOperand, setWaitingForOperand] = useState(false);

  const [position, setPosition] = useState(INITIAL_POS);
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const initialized = useRef(false);

  // Initialize position near bottom-right when first opened
  useEffect(() => {
    if (open && !initialized.current) {
      const x = Math.max(16, window.innerWidth - WINDOW_W - 88);
      const y = Math.max(16, window.innerHeight - WINDOW_H - 32);
      setPosition({ x, y });
      initialized.current = true;
    }
  }, [open]);

  // ===== Calculator logic =====
  const inputDigit = useCallback((d: string) => {
    setDisplay((prev) => {
      if (waitingForOperand) {
        setWaitingForOperand(false);
        return d;
      }
      if (prev === "0" || prev === "Error") return d;
      if (prev.replace(/[^0-9]/g, "").length >= 14) return prev;
      return prev + d;
    });
  }, [waitingForOperand]);

  const inputDot = useCallback(() => {
    setDisplay((prev) => {
      if (waitingForOperand) {
        setWaitingForOperand(false);
        return "0.";
      }
      if (prev === "Error") return "0.";
      if (prev.includes(".")) return prev;
      return prev + ".";
    });
  }, [waitingForOperand]);

  const clear = useCallback(() => {
    setDisplay("0");
    setPreviousValue(null);
    setOperator(null);
    setWaitingForOperand(false);
  }, []);

  const del = useCallback(() => {
    setDisplay((prev) => {
      if (prev === "Error" || waitingForOperand) return "0";
      if (prev.length <= 1 || (prev.length === 2 && prev.startsWith("-"))) return "0";
      return prev.slice(0, -1);
    });
  }, [waitingForOperand]);

  const percent = useCallback(() => {
    setDisplay((prev) => {
      const n = Number(prev);
      if (isNaN(n)) return "Error";
      return String(roundFloat(n / 100));
    });
  }, []);

  const compute = (a: number, b: number, op: Operator): number | "Error" => {
    switch (op) {
      case "+": return roundFloat(a + b);
      case "-": return roundFloat(a - b);
      case "*": return roundFloat(a * b);
      case "/": return b === 0 ? "Error" : roundFloat(a / b);
      default: return b;
    }
  };

  const performOperation = useCallback((nextOp: Operator) => {
    const current = Number(display);
    if (display === "Error" || isNaN(current)) {
      clear();
      return;
    }
    if (previousValue === null) {
      setPreviousValue(current);
    } else if (operator && !waitingForOperand) {
      const result = compute(previousValue, current, operator);
      if (result === "Error") {
        setDisplay("Error");
        setPreviousValue(null);
        setOperator(null);
        setWaitingForOperand(true);
        return;
      }
      setDisplay(String(result));
      setPreviousValue(result);
    }
    setOperator(nextOp);
    setWaitingForOperand(true);
  }, [display, previousValue, operator, waitingForOperand, clear]);

  const equals = useCallback(() => {
    const current = Number(display);
    if (operator === null || previousValue === null || isNaN(current)) return;
    const result = compute(previousValue, current, operator);
    if (result === "Error") {
      setDisplay("Error");
    } else {
      setDisplay(String(result));
    }
    setPreviousValue(null);
    setOperator(null);
    setWaitingForOperand(true);
  }, [display, operator, previousValue]);

  // ===== Keyboard support =====
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const k = e.key;
      if (/^[0-9]$/.test(k)) {
        e.preventDefault();
        inputDigit(k);
      } else if (k === ".") {
        e.preventDefault();
        inputDot();
      } else if (k === "+" || k === "-" || k === "*" || k === "/") {
        e.preventDefault();
        performOperation(k as Operator);
      } else if (k === "Enter" || k === "=") {
        e.preventDefault();
        equals();
      } else if (k === "Backspace") {
        e.preventDefault();
        del();
      } else if (k === "Escape" || k === "c" || k === "C") {
        e.preventDefault();
        clear();
      } else if (k === "%") {
        e.preventDefault();
        percent();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, inputDigit, inputDot, performOperation, equals, del, clear, percent]);

  // ===== Drag logic =====
  const startDrag = (clientX: number, clientY: number) => {
    dragOffset.current = { x: clientX - position.x, y: clientY - position.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (clientX: number, clientY: number) => {
      const x = Math.max(0, Math.min(window.innerWidth - WINDOW_W, clientX - dragOffset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - 80, clientY - dragOffset.current.y));
      setPosition({ x, y });
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) move(e.touches[0].clientX, e.touches[0].clientY);
    };
    const stop = () => setDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
    };
  }, [dragging]);

  // Button style helpers
  const btn = "h-12 rounded-lg font-semibold text-base active:scale-95 transition-transform select-none flex items-center justify-center";
  const numBtn = cn(btn, "bg-muted text-foreground hover:bg-muted/80");
  const opBtn = cn(btn, "bg-[hsl(var(--bills))] text-white hover:opacity-90");
  const eqBtn = cn(btn, "bg-primary text-primary-foreground hover:opacity-90");
  const clearBtn = cn(btn, "bg-destructive text-destructive-foreground hover:opacity-90");
  const utilBtn = cn(btn, "bg-secondary text-secondary-foreground hover:bg-secondary/80");

  return (
    <>
      {/* Trigger button — above AddTransactionFAB (which is bottom-6 right-6) */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "hidden md:flex fixed bottom-24 right-6 z-40",
          "w-12 h-12 rounded-full items-center justify-center",
          "bg-card border border-border shadow-lg",
          "hover:bg-muted active:scale-95 transition-all",
          open && "bg-primary text-primary-foreground border-primary"
        )}
        aria-label="เครื่องคิดเลข"
        title="เครื่องคิดเลข"
      >
        <Calculator className="h-5 w-5" />
      </button>

      {/* Floating Window */}
      {open && (
        <div
          className="fixed z-50 w-72 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in"
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            cursor: dragging ? "grabbing" : "default",
          }}
        >
          {/* Header / Drag handle */}
          <div
            className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border cursor-grab active:cursor-grabbing select-none"
            onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
            onTouchStart={(e) => {
              if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY);
            }}
          >
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <GripHorizontal className="h-3.5 w-3.5" />
              เครื่องคิดเลข
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-6 w-6 rounded-md flex items-center justify-center hover:bg-muted transition-colors"
              aria-label="ปิด"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Display */}
          <div className="px-4 py-5 bg-foreground text-background">
            <div className="text-right text-3xl font-mono font-semibold tabular-nums truncate">
              {formatDisplay(display)}
            </div>
            {operator && previousValue !== null && (
              <div className="text-right text-xs text-background/60 font-mono mt-1">
                {previousValue.toLocaleString("en-US")} {operator}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-4 gap-2 p-3">
            <button onClick={clear} className={cn(clearBtn, "col-span-2")}>C</button>
            <button onClick={del} className={utilBtn}>DEL</button>
            <button onClick={() => performOperation("/")} className={opBtn}>÷</button>

            <button onClick={() => inputDigit("7")} className={numBtn}>7</button>
            <button onClick={() => inputDigit("8")} className={numBtn}>8</button>
            <button onClick={() => inputDigit("9")} className={numBtn}>9</button>
            <button onClick={() => performOperation("*")} className={opBtn}>×</button>

            <button onClick={() => inputDigit("4")} className={numBtn}>4</button>
            <button onClick={() => inputDigit("5")} className={numBtn}>5</button>
            <button onClick={() => inputDigit("6")} className={numBtn}>6</button>
            <button onClick={() => performOperation("-")} className={opBtn}>−</button>

            <button onClick={() => inputDigit("1")} className={numBtn}>1</button>
            <button onClick={() => inputDigit("2")} className={numBtn}>2</button>
            <button onClick={() => inputDigit("3")} className={numBtn}>3</button>
            <button onClick={() => performOperation("+")} className={opBtn}>+</button>

            <button onClick={percent} className={utilBtn}>%</button>
            <button onClick={() => inputDigit("0")} className={numBtn}>0</button>
            <button onClick={inputDot} className={numBtn}>.</button>
            <button onClick={equals} className={eqBtn}>=</button>
          </div>

          <div className="px-3 pb-2 text-[10px] text-muted-foreground text-center">
            รองรับคีย์บอร์ด: 0-9 . + − × ÷ Enter Backspace Esc %
          </div>
        </div>
      )}
    </>
  );
}
