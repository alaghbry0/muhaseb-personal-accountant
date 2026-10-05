"use client";

/**
 * لوحتا الخصم والضريبة (اللوحة السفلية لشاشة البيع) — دليل الشاشات 04/02:
 * «خصم مبالغ» (مبلغ مقطوع أو نسبة) و«الضريبة» (نسبة % على الإجمالي).
 * الحالة المحلية داخل Body يُركَّب عند الفتح فقط (تهيئة نظيفة بلا effects).
 */
import { useState } from "react";
import { Percent, Banknote } from "lucide-react";
import { PosSheet } from "./pos-sheet";
import { PrimaryButton } from "@/components/ds";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

// ═══════════════ خصم الإجمالي ═══════════════

interface DiscountSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** المجموع قبل الخصم — لقص قيمة الخصم وحساب النسبة */
  subtotal: number
  currencyCode: string
  currentDiscount: number
  onApply: (amount: number) => void
}

export function DiscountSheet({
  open,
  onOpenChange,
  subtotal,
  currencyCode,
  currentDiscount,
  onApply,
}: DiscountSheetProps) {
  return (
    <PosSheet
      open={open}
      onOpenChange={onOpenChange}
      title="خصم مبالغ"
      description="خصم على إجمالي الفاتورة — لا يمكن أن يتجاوز المجموع"
    >
      {open && (
        <DiscountBody
          subtotal={subtotal}
          currencyCode={currencyCode}
          currentDiscount={currentDiscount}
          hasDiscount={currentDiscount > 0}
          onApply={(amount) => {
            onApply(amount)
            onOpenChange(false)
          }}
          onRemove={() => {
            onApply(0)
            onOpenChange(false)
          }}
        />
      )}
    </PosSheet>
  )
}

function DiscountBody({
  subtotal,
  currencyCode,
  currentDiscount,
  hasDiscount,
  onApply,
  onRemove,
}: {
  subtotal: number
  currencyCode: string
  currentDiscount: number
  hasDiscount: boolean
  onApply: (amount: number) => void
  onRemove: () => void
}) {
  const [mode, setMode] = useState<"amount" | "percent">("amount")
  const [value, setValue] = useState(currentDiscount > 0 ? String(currentDiscount) : "")

  const numeric = Number(value) || 0
  const computedAmount =
    mode === "amount" ? numeric : Math.max(0, (subtotal * numeric) / 100)
  const clamped = Math.min(computedAmount, subtotal)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("amount")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[14px] font-bold transition-colors",
            mode === "amount"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent/30"
          )}
        >
          <Banknote className="size-4" aria-hidden /> خصم مبلغ
        </button>
        <button
          type="button"
          onClick={() => setMode("percent")}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[14px] font-bold transition-colors",
            mode === "percent"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent/30"
          )}
        >
          <Percent className="size-4" aria-hidden /> خصم نسبة
        </button>
      </div>

      <div className="flex h-12 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 focus-within:border-primary/70">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={mode === "amount" ? "قيمة الخصم" : "نسبة الخصم %"}
          aria-label={mode === "amount" ? "قيمة الخصم" : "نسبة الخصم"}
          className="font-num h-full min-w-0 flex-1 bg-transparent text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none"
        />
        <span className="shrink-0 text-[13px] text-muted-foreground">
          {mode === "amount" ? currencyCode : "%"}
        </span>
      </div>

      <div className="rounded-xl bg-muted/50 p-3 text-[13.5px]">
        <div className="flex justify-between py-0.5">
          <span className="text-muted-foreground">المجموع قبل الخصم</span>
          <span className="font-num font-bold">
            {formatAmount(subtotal, { currency: currencyCode })}
          </span>
        </div>
        <div className="flex justify-between py-0.5">
          <span className="text-muted-foreground">قيمة الخصم</span>
          <span className="font-num font-bold text-[#F87171]">
            − {formatAmount(clamped, { currency: currencyCode })}
          </span>
        </div>
        <div className="mt-1.5 flex justify-between border-t border-border/60 pt-1.5">
          <span className="text-muted-foreground">الصافي بعد الخصم</span>
          <span className="font-num font-bold text-primary">
            {formatAmount(Math.max(0, subtotal - clamped), { currency: currencyCode })}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        {hasDiscount && (
          <PrimaryButton variant="outline" className="flex-1" onClick={onRemove}>
            إزالة الخصم
          </PrimaryButton>
        )}
        <PrimaryButton
          className="flex-1"
          disabled={!value || clamped <= 0}
          onClick={() => onApply(clamped)}
        >
          تطبيق الخصم
        </PrimaryButton>
      </div>
    </div>
  )
}

// ═══════════════ الضريبة ═══════════════

interface TaxSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRate: number
  onApply: (rate: number) => void
}

export function TaxSheet({ open, onOpenChange, currentRate, onApply }: TaxSheetProps) {
  return (
    <PosSheet
      open={open}
      onOpenChange={onOpenChange}
      title="الضريبة"
      description="نسبة ضريبة القيمة المضافة على إجمالي الفاتورة (0% افتراضياً)"
    >
      {open && (
        <TaxBody
          currentRate={currentRate}
          onApply={(rate) => {
            onApply(rate)
            onOpenChange(false)
          }}
          onRemove={() => {
            onApply(0)
            onOpenChange(false)
          }}
        />
      )}
    </PosSheet>
  )
}

function TaxBody({
  currentRate,
  onApply,
  onRemove,
}: {
  currentRate: number
  onApply: (rate: number) => void
  onRemove: () => void
}) {
  const [rate, setRate] = useState(currentRate > 0 ? String(currentRate) : "")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-12 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 focus-within:border-primary/70">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="نسبة الضريبة %"
          aria-label="نسبة الضريبة"
          className="font-num h-full min-w-0 flex-1 bg-transparent text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none"
        />
        <span className="shrink-0 text-[13px] text-muted-foreground">%</span>
      </div>
      <div className="flex gap-2">
        {[0, 5, 15].map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRate(String(r))}
            className={cn(
              "flex-1 rounded-xl border px-3 py-2.5 font-num text-[14px] font-bold transition-colors",
              (Number(rate) || 0) === r
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/30"
            )}
          >
            {r}%
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        {currentRate > 0 && (
          <PrimaryButton variant="outline" className="flex-1" onClick={onRemove}>
            إزالة الضريبة
          </PrimaryButton>
        )}
        <PrimaryButton
          className="flex-1"
          onClick={() => onApply(Math.min(100, Math.max(0, Number(rate) || 0)))}
        >
          تطبيق
        </PrimaryButton>
      </div>
    </div>
  )
}
