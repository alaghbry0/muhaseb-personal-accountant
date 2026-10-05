"use client";

/**
 * لوحة الدفع النقدي (بيع مختلط) — دليل الشاشات 04/04 «دفع نقدي فاتورة»:
 * الإجمالي (قراءة فقط) + المدفوع (إدخال) + المتبقي آجل (محسوب).
 * الحالة المحلية داخل Body يُركَّب عند الفتح فقط.
 */
import { useState } from "react";
import { PosSheet } from "./pos-sheet";
import { PrimaryButton } from "@/components/ds";
import { formatAmount } from "@/lib/format";

interface PaymentSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  total: number
  currencyCode: string
  onConfirm: (paid: number) => void
}

export function PaymentSheet({
  open,
  onOpenChange,
  total,
  currencyCode,
  onConfirm,
}: PaymentSheetProps) {
  return (
    <PosSheet
      open={open}
      onOpenChange={onOpenChange}
      title="الدفع النقدي"
      description="جزء نقدي من الصندوق والباقي آجل على حساب العميل"
    >
      {open && (
        <PaymentBody
          total={total}
          currencyCode={currencyCode}
          onConfirm={(paid) => {
            onConfirm(paid)
            onOpenChange(false)
          }}
        />
      )}
    </PosSheet>
  )
}

function PaymentBody({
  total,
  currencyCode,
  onConfirm,
}: {
  total: number
  currencyCode: string
  onConfirm: (paid: number) => void
}) {
  const [paid, setPaid] = useState(String(Math.round(total)))

  const paidNum = Math.min(Math.max(0, Number(paid) || 0), total)
  const remaining = Math.max(0, total - paidNum)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-12 items-center justify-between rounded-xl border border-border bg-muted/40 px-3">
        <span className="text-[14px] text-muted-foreground">الإجمالي</span>
        <span className="font-num text-[17px] font-bold text-foreground">
          {formatAmount(total, { currency: currencyCode })}
        </span>
      </div>
      <div className="flex h-12 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 focus-within:border-primary/70">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          value={paid}
          onChange={(e) => setPaid(e.target.value)}
          placeholder="المبلغ المدفوع"
          aria-label="المبلغ المدفوع"
          className="font-num h-full min-w-0 flex-1 bg-transparent text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none"
        />
        <span className="shrink-0 text-[13px] text-muted-foreground">{currencyCode}</span>
      </div>
      <div className="flex h-12 items-center justify-between rounded-xl border border-[#FBBF24]/40 bg-[#FBBF24]/10 px-3">
        <span className="text-[14px] font-medium text-[#FBBF24]">المتبقي (آجل)</span>
        <span className="font-num text-[17px] font-bold text-[#FBBF24]">
          {formatAmount(remaining, { currency: currencyCode })}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setPaid(String(Math.round(total / 2)))}
          className="flex-1 rounded-xl border border-border py-2.5 text-[13.5px] font-bold text-muted-foreground transition-colors hover:bg-accent/30"
        >
          نصف المبلغ
        </button>
        <button
          type="button"
          onClick={() => setPaid(String(Math.round(total)))}
          className="flex-1 rounded-xl border border-border py-2.5 text-[13.5px] font-bold text-muted-foreground transition-colors hover:bg-accent/30"
        >
          كامل المبلغ
        </button>
      </div>
      <PrimaryButton
        block
        variant="success"
        disabled={paidNum <= 0 || remaining <= 0}
        onClick={() => onConfirm(paidNum)}
      >
        حفظ البيع المختلط
      </PrimaryButton>
    </div>
  )
}
