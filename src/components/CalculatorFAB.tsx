import { useState, useEffect, useRef, useCallback } from "react";
import { Calculator, X, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const INITIAL_POS = { x: 0, y: 0 };
const WINDOW_W = 288; // w-72
const WINDOW_H = 460;

function roundFloat(n: number) {
  if (!isFinite(n)) return n;
  return Math.round(n * 1e10) / 1e10;
}

// ===== Safe expression evaluator (Shunting-yard, no eval) =====
// Supports: + - * / ( )  and decimal numbers. Unary minus supported.
function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expr.length) {
    const c = expr[i];
    if (c === " ") { i++; continue; }
    if ("+-*/()".includes(c)) {
      // Detect unary minus / plus: at start, or right after another operator/'('
      const prev = tokens[tokens.length - 1];
      const isUnary =
        (c === "-" || c === "+") &&
        (prev === undefined || prev === "(" || "+-*/".includes(prev));
      if (isUnary) {
        // read the following number (or parse 0 - ... by inserting 0)
        tokens.push("0");
        tokens.push(c);
        i++;
        continue;
      }
      tokens.push(c);
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        num += expr[i];
        i++;
      }
      if (num === "." || (num.match(/\./g) || []).length > 1) throw new Error("bad number");
      tokens.push(num);
      continue;
    }
    throw new Error("bad char: " + c);
  }
  return tokens;
}

function toRPN(tokens: string[]): string[] {
  const out: string[] = [];
  const ops: string[] = [];
  const prec: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };
  for (const t of tokens) {
    if (!isNaN(Number(t))) {
      out.push(t);
    } else if (t in prec) {
      while (
        ops.length &&
        ops[ops.length - 1] in prec &&
        prec[ops[ops.length - 1]] >= prec[t]
      ) {
        out.push(ops.pop()!);
      }
      ops.push(t);
    } else if (t === "(") {
      ops.push(t);
    } else if (t === ")") {
      while (ops.length && ops[ops.length - 1] !== "(") {
        out.push(ops.pop()!);
      }
      if (!ops.length) throw new Error("mismatched paren");
      ops.pop();
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === "(" || op === ")") throw new Error("mismatched paren");
    out.push(op);
  }
  return out;
}

function evalRPN(rpn: string[]): number {
  const st: number[] = [];
  for (const t of rpn) {
    if (!isNaN(Number(t))) {
      st.push(Number(t));
    } else {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("bad expr");
      let r: number;
      switch (t) {
        case "+": r = a + b; break;
        case "-": r = a - b; break;
        case "*": r = a * b; break;
        case "/":
          if (b === 0) throw new Error("div by zero");
          r = a / b;
          break;
        default: throw new Error("bad op");
      }
      st.push(r);
    }
  }
  if (st.length !== 1) throw new Error("bad expr");
  return st[0];
}

function safeEvaluate(expr: string): number {
  return roundFloat(evalRPN(toRPN(tokenize(expr))));
}

// ===== Display formatting =====
function formatNumberWithCommas(numStr: string): string {
  if (!numStr) return numStr;
  const negative = numStr.startsWith("-");
  const body = negative ? numStr.slice(1) : numStr;
  const [intPart, decPart] = body.split(".");
  const n = Number(intPart);
  if (isNaN(n)) return numStr;
  const formatted = n.toLocaleString("en-US");
  const result = decPart !== undefined ? `${formatted}.${decPart}` : formatted;
  return negative ? "-" + result : result;
}

// Format an expression string for display: add commas to numbers, keep operators/parens
function formatExpression(expr: string): string {
  if (expr === "Error") return expr;
  let out = "";
  let buf = "";
  const flush = () => {
    if (buf) {
      out += formatNumberWithCommas(buf);
      buf = "";
    }
  };
  for (const c of expr) {
    if (/[0-9.]/.test(c)) {
      buf += c;
    } else {
      flush();
      // Pretty operator symbols
      if (c === "*") out += "×";
      else if (c === "/") out += "÷";
      else if (c === "-") out += "−";
      else out += c;
    }
  }
  flush();
  return out;
}

// Count unmatched open parens
function openParenCount(expr: string): number {
  let n = 0;
  for (const c of expr) {
    if (c === "(") n++;
    else if (c === ")") n--;
  }
  return n;
}

const isOperator = (c: string) => "+-*/".includes(c);

export default function CalculatorFAB() {
  const [open, setOpen] = useState(false);
  // expression accumulator (raw, e.g. "50*2+(3-1)")
  const [expr, setExpr] = useState("");
  // current display: either the running expression or the last result
  const [display, setDisplay] = useState("0");
  const [justEvaluated, setJustEvaluated] = useState(false);

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

  // ===== Calculator actions =====
  const clear = useCallback(() => {
    setExpr("");
    setDisplay("0");
    setJustEvaluated(false);
  }, []);

  const del = useCallback(() => {
    setJustEvaluated(false);
    setExpr((prev) => {
      const next = prev.slice(0, -1);
      setDisplay(next || "0");
      return next;
    });
  }, []);

  const appendDigit = useCallback((d: string) => {
    setExpr((prev) => {
      // After equals, typing a digit starts fresh
      const base = justEvaluated ? "" : prev;
      const next = base + d;
      setDisplay(next);
      return next;
    });
    setJustEvaluated(false);
  }, [justEvaluated]);

  const appendDot = useCallback(() => {
    setExpr((prev) => {
      const base = justEvaluated ? "" : prev;
      // Find last number segment
      const m = base.match(/(\d*\.?\d*)$/);
      const lastNum = m ? m[0] : "";
      let next: string;
      if (lastNum === "") next = base + "0.";
      else if (lastNum.includes(".")) next = base; // already has dot
      else next = base + ".";
      setDisplay(next || "0");
      return next;
    });
    setJustEvaluated(false);
  }, [justEvaluated]);

  const appendOperator = useCallback((op: string) => {
    setExpr((prev) => {
      let base = justEvaluated ? display.replace(/,/g, "") : prev;
      if (base === "" || base === "Error") {
        // Allow leading minus
        if (op === "-") {
          setDisplay("-");
          return "-";
        }
        return base;
      }
      const last = base[base.length - 1];
      if (isOperator(last)) {
        // replace the last operator
        base = base.slice(0, -1) + op;
      } else {
        base = base + op;
      }
      setDisplay(base);
      return base;
    });
    setJustEvaluated(false);
  }, [justEvaluated, display]);

  const appendParen = useCallback((p: "(" | ")") => {
    setExpr((prev) => {
      const base = justEvaluated ? "" : prev;
      const last = base[base.length - 1];
      let next = base;
      if (p === "(") {
        // Implicit multiplication: number or ) followed by (
        if (last && (/[0-9)]/.test(last))) {
          next = base + "*(";
        } else {
          next = base + "(";
        }
      } else {
        // Only allow ) if there is an unmatched (
        if (openParenCount(base) <= 0) return base;
        // Don't close right after operator or open paren
        if (!last || isOperator(last) || last === "(") return base;
        next = base + ")";
      }
      setDisplay(next || "0");
      return next;
    });
    setJustEvaluated(false);
  }, [justEvaluated]);

  const percent = useCallback(() => {
    setExpr((prev) => {
      const base = justEvaluated ? display.replace(/,/g, "") : prev;
      // Convert trailing number to /100 wrapped: e.g. "50+20" => "50+20/100"
      const m = base.match(/(\d*\.?\d+)$/);
      if (!m) return base;
      const before = base.slice(0, base.length - m[0].length);
      const next = `${before}(${m[0]}/100)`;
      setDisplay(next);
      return next;
    });
    setJustEvaluated(false);
  }, [justEvaluated, display]);

  const equals = useCallback(() => {
    setExpr((prev) => {
      if (!prev) return prev;
      // Auto-close any open parens
      let candidate = prev;
      let opens = openParenCount(candidate);
      while (opens > 0) { candidate += ")"; opens--; }
      // Strip trailing operator
      while (candidate.length && isOperator(candidate[candidate.length - 1])) {
        candidate = candidate.slice(0, -1);
      }
      try {
        const result = safeEvaluate(candidate);
        if (!isFinite(result)) {
          setDisplay("Error");
          setJustEvaluated(true);
          return "";
        }
        setDisplay(String(result));
        setJustEvaluated(true);
        return String(result);
      } catch {
        setDisplay("Error");
        setJustEvaluated(true);
        return "";
      }
    });
  }, []);

  // ===== Keyboard support =====
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const k = e.key;
      if (/^[0-9]$/.test(k)) { e.preventDefault(); appendDigit(k); }
      else if (k === ".") { e.preventDefault(); appendDot(); }
      else if (k === "+" || k === "-" || k === "*" || k === "/") { e.preventDefault(); appendOperator(k); }
      else if (k === "(") { e.preventDefault(); appendParen("("); }
      else if (k === ")") { e.preventDefault(); appendParen(")"); }
      else if (k === "Enter" || k === "=") { e.preventDefault(); equals(); }
      else if (k === "Backspace") { e.preventDefault(); del(); }
      else if (k === "Escape" || k === "c" || k === "C") { e.preventDefault(); clear(); }
      else if (k === "%") { e.preventDefault(); percent(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, appendDigit, appendDot, appendOperator, appendParen, equals, del, clear, percent]);

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

  // Live preview: try to evaluate current expression
  let preview: string | null = null;
  if (!justEvaluated && expr && !isOperator(expr[expr.length - 1])) {
    try {
      let candidate = expr;
      let opens = openParenCount(candidate);
      while (opens > 0) { candidate += ")"; opens--; }
      const r = safeEvaluate(candidate);
      if (isFinite(r) && String(r) !== expr) preview = formatNumberWithCommas(String(r));
    } catch { /* ignore */ }
  }

  // Button style helpers
  const btn = "h-11 rounded-lg font-semibold text-sm active:scale-95 transition-transform select-none flex items-center justify-center";
  const numBtn = cn(btn, "bg-muted text-foreground hover:bg-muted/80");
  const opBtn = cn(btn, "bg-[hsl(var(--debt))] text-[hsl(var(--debt-foreground))] hover:opacity-90");
  const eqBtn = cn(btn, "bg-primary text-primary-foreground hover:opacity-90");
  const clearBtn = cn(btn, "bg-destructive text-destructive-foreground hover:opacity-90");
  const utilBtn = cn(btn, "bg-secondary text-secondary-foreground hover:bg-secondary/80");
  const parenBtn = cn(btn, "bg-accent/20 text-accent-foreground hover:bg-accent/30 border border-accent/40");

  return (
    <>
      {/* Trigger button — above AddTransactionFAB */}
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
          <div className="px-4 py-4 bg-foreground text-background min-h-[88px] flex flex-col justify-end">
            <div className="text-right text-xs text-background/50 font-mono truncate min-h-[16px]">
              {preview ? `= ${preview}` : "\u00A0"}
            </div>
            <div className="text-right text-2xl font-mono font-semibold tabular-nums truncate">
              {formatExpression(display) || "0"}
            </div>
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-4 gap-2 p-3">
            <button onClick={clear} className={clearBtn}>C</button>
            <button onClick={del} className={utilBtn}>DEL</button>
            <button onClick={() => appendParen("(")} className={parenBtn}>(</button>
            <button onClick={() => appendParen(")")} className={parenBtn}>)</button>

            <button onClick={() => appendDigit("7")} className={numBtn}>7</button>
            <button onClick={() => appendDigit("8")} className={numBtn}>8</button>
            <button onClick={() => appendDigit("9")} className={numBtn}>9</button>
            <button onClick={() => appendOperator("/")} className={opBtn}>÷</button>

            <button onClick={() => appendDigit("4")} className={numBtn}>4</button>
            <button onClick={() => appendDigit("5")} className={numBtn}>5</button>
            <button onClick={() => appendDigit("6")} className={numBtn}>6</button>
            <button onClick={() => appendOperator("*")} className={opBtn}>×</button>

            <button onClick={() => appendDigit("1")} className={numBtn}>1</button>
            <button onClick={() => appendDigit("2")} className={numBtn}>2</button>
            <button onClick={() => appendDigit("3")} className={numBtn}>3</button>
            <button onClick={() => appendOperator("-")} className={opBtn}>−</button>

            <button onClick={percent} className={utilBtn}>%</button>
            <button onClick={() => appendDigit("0")} className={numBtn}>0</button>
            <button onClick={appendDot} className={numBtn}>.</button>
            <button onClick={() => appendOperator("+")} className={opBtn}>+</button>

            <button onClick={equals} className={cn(eqBtn, "col-span-4")}>=</button>
          </div>

          <div className="px-3 pb-2 text-[10px] text-muted-foreground text-center">
            รองรับคีย์บอร์ด: 0-9 . + − × ÷ ( ) Enter Backspace Esc %
          </div>
        </div>
      )}
    </>
  );
}
