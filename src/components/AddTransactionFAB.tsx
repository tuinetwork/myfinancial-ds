import { useState, useEffect } from "react";
import { Plus, X, CalendarIcon, ChevronLeft, CircleDot } from "lucide-react";
import { collection, doc, getDocs, setDoc, query, where, onSnapshot } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
@@ -20,7 +19,7 @@
  category_icons?: Record<string, string>;
}

// Fallback label map (used when no custom icon is set)
const categoryLabelMap: Record<string, string> = {
  "หนี้สินและผ่อนชำระ": "DEBT",
  "เงินออมและการลงทุน": "SAVINGS",
@@ -181,167 +180,182 @@
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform duration-200"
      >
        <Plus className="h-7 w-7" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={handleClose}>
          <div className={cn(
            "absolute inset-0 bg-background/5 backdrop-blur-xl",
            closing ? "animate-modal-backdrop-out" : "animate-modal-backdrop-in"
          )} />

          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative z-10 w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl shadow-2xl p-5 space-y-3",
              "bg-card/95 backdrop-blur-xl border border-border",
              closing ? "animate-modal-slide-down" : "animate-modal-slide-up"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">เพิ่มรายการใหม่</h2>

              <button
                onClick={handleClose}
                className="h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Type toggle */}
            <div className="flex gap-2">
              <button
                onClick={() => handleTypeChange("expense")}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  isExpense
                    ? "bg-destructive text-destructive-foreground shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                - Expense
              </button>
              <button
                onClick={() => handleTypeChange("income")}
                className={cn(
                  "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                  !isExpense
                    ? "bg-accent text-accent-foreground shadow-md"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                + Income
              </button>
            </div>

            {/* Amount */}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-muted-foreground">฿</span>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(
                  "pl-8 text-lg font-semibold h-12 bg-muted/50 border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-1",
                  isExpense ? "focus-visible:ring-destructive" : "focus-visible:ring-accent"
                )}
              />






            </div>

            {/* Date */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full h-12 justify-start bg-muted/50 border-border text-foreground hover:bg-muted"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {thaiDate}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[60]" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} initialFocus />
              </PopoverContent>
            </Popover>

            {/* Category area */}
            <div className="h-[200px] relative overflow-hidden rounded-xl bg-muted/30 border border-border">
              {/* Step 1: Main categories grid */}
              <div className={cn(
                "absolute inset-0 p-2 overflow-y-auto transition-all duration-200",
                categoryStep === 1 ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
              )}>
                {mainCats.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {mainCats.map((mc) => {
                      const IconComp = getCategoryIcon(mc);

                      return (
                        <button
                          key={mc}
                          onClick={() => handleMainCategorySelect(mc)}
                          className={cn(
                            "px-2 py-3 rounded-xl text-xs font-medium transition-all duration-150",
                            "flex flex-col items-center justify-center gap-1.5",
                            "bg-muted/50 border hover:bg-muted",
                            mainCategory === mc
                              ? isExpense ? "border-destructive bg-destructive/10" : "border-accent bg-accent/10"
                              : "border-border"
                          )}
                        >
                          <IconComp className={cn(
                            "h-6 w-6",
                            mainCategory === mc
                              ? isExpense ? "text-destructive" : "text-accent"
                              : "text-muted-foreground"
                          )} />
                          <span className="text-foreground text-center leading-tight">{getLabel(mc)}</span>





                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">

                    ไม่พบหมวดหมู่
                  </div>
                )}
              </div>

              {/* Step 2: Sub categories list */}
              <div className={cn(
                "absolute inset-0 p-2 overflow-y-auto transition-all duration-200",
                categoryStep === 2 ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
              )}>
                <button
                  onClick={handleBackToMainCategories}
                  className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>{getLabel(mainCategory) || "Back"}</span>
                </button>
                <div className="flex flex-wrap gap-1.5">



                  {subCats.map((sc) => {
                    const SubIcon = getCategoryIcon(sc);
                    const selected = subCategory === sc;
                    return (
                      <button
                        key={sc}
                        onClick={() => setSubCategory(sc)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150",
                          selected
                            ? isExpense
                              ? "bg-destructive text-destructive-foreground shadow-sm"
                              : "bg-accent text-accent-foreground shadow-sm"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border"
                        )}
                      >
                        <SubIcon className="h-3 w-3 shrink-0" />
                        {sc}
                      </button>
                    );
@@ -353,36 +367,36 @@
            {/* Note */}
            <div className="relative">
              <Textarea
                placeholder="Note..."
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                className="resize-none bg-muted/50 border-border text-foreground placeholder:text-muted-foreground min-h-[56px] text-sm"
                maxLength={MAX_NOTE_LENGTH}
              />
              <span className="absolute bottom-1 right-2 text-[10px] text-muted-foreground">
                {note.length}/{MAX_NOTE_LENGTH}
              </span>
            </div>

            {/* Submit */}
            <Button
              onClick={handleSave}
              disabled={!canSubmit}
              className={cn(
                "w-full h-12 text-base font-semibold rounded-xl transition-all duration-200",
                isExpense
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lg"
                  : "bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg",
                !canSubmit && "opacity-50 cursor-not-allowed"
              )}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
};

export default AddTransactionFAB;
