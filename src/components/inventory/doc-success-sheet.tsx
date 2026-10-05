"use client";

/**
 * لوحة نجاح حفظ مستند مشتريات/مرتجع (Task 3-a) — ملخص + طباعة + تم.
 */
import { CheckCircle2, Printer } from "lucide-react";
import { formatAmount } from "@/lib/format";
import type { InvoiceDetailDto } from "@/domain/dto";
import { StatusChip, PrimaryButton } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";

interface DocSuccessSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: InvoiceDetailDto | null
  /** رصيد الطرف بعد الحفظ (عميل/مورد حسب نوع المستند) */
  partyBalance: number | null
  partyLabel?: string
  onPrint: (invoice: InvoiceDetailDto) => void
  onDone: () => void
}

export function DocSuccessSheet({
  open,
  onOpenChange,
  invoice,
  partyBalance,
  partyLabel,
  onPrint,
  onDone,
}: DocSuccessSheetProps) {
  if (!invoice) return null
  const cur = invoice.currencyCode
  const isReturn = invoice.docType === "sale_return" || invoice.docType === "purchase_return"

  return (
    <PosSheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) onDone()
      }}
      title="تم حفظ المستند بنجاح"
    >
      <div className="flex flex-col items-center gap-4 pb-2">
        <span className="flex size-16 items-center justify-center rounded-full bg-[#34D399]/15">
          <CheckCircle2 className="size-9 text-[#34D399]" aria-hidden />
        </span>
        <div className="flex flex-col items-center gap-1">
          <span className="font-num text-[18px] font-bold text-foreground">
            {invoice.invoiceNo}
          </span>
          <StatusChip status={invoice.payStatus} />
        </div>

        <div className="w-full rounded-xl border border-border/70 bg-muted/40 p-3">
          <div className="flex justify-between py-0.5 text-[14px]">
            <span className="text-muted-foreground">{isReturn ? "إجمالي المسترد" : "إجمالي الفاتورة"}</span>
            <span className="font-num font-bold">{formatAmount(invoice.total, { currency: cur })}</span>
          </div>
          {invoice.paidAmount > 0 && (
            <div className="flex justify-between py-0.5 text-[14px]">
              <span className="text-muted-foreground">
                {invoice.docType === "sale_return" ? "المردود نقدياً" : "المدفوع نقدياً"}
              </span>
              <span className="font-num font-bold text-[#34D399]">
                {formatAmount(invoice.paidAmount, { currency: cur })}
              </span>
            </div>
          )}
          {invoice.dueAmount > 0 && (
            <div className="flex justify-between py-0.5 text-[14px]">
              <span className="text-muted-foreground">المتبقي (آجل)</span>
              <span className="font-num font-bold text-[#FBBF24]">
                {formatAmount(invoice.dueAmount, { currency: cur })}
              </span>
            </div>
          )}
          {invoice.dueAmount < 0 && (
            <div className="flex justify-between py-0.5 text-[14px]">
              <span className="text-muted-foreground">خُصم من الحساب</span>
              <span className="font-num font-bold text-[#34D399]">
                {formatAmount(Math.abs(invoice.dueAmount), { currency: cur })}
              </span>
            </div>
          )}
          {partyBalance != null && partyLabel && (
            <div className="mt-1 flex justify-between border-t border-border/60 pt-1.5 text-[14px]">
              <span className="text-muted-foreground">رصيد {partyLabel}</span>
              <span className="font-num font-bold text-[#FBBF24]">
                {formatAmount(partyBalance, { currency: "YER", decimals: 0 })}
              </span>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-2">
          <PrimaryButton block onClick={() => onPrint(invoice)}>
            <Printer className="size-5" aria-hidden /> طباعة
          </PrimaryButton>
          <PrimaryButton block variant="ghost" onClick={onDone}>
            تم
          </PrimaryButton>
        </div>
      </div>
    </PosSheet>
  )
}
