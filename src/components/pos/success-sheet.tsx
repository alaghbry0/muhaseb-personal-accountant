"use client";

/**
 * لوحة نجاح الحفظ (شاشة البيع) — ملخص الفاتورة المحفوظة +
 * طباعة / مشاركة واتساب / بدء فاتورة جديدة — FR-02-14.
 */
import { CheckCircle2, Printer, MessageCircle } from "lucide-react";
import { formatAmount } from "@/lib/format";
import type { InvoiceDetailDto } from "@/domain/dto";
import { StatusChip, PrimaryButton } from "@/components/ds";
import { PosSheet } from "./pos-sheet";

interface SuccessSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: InvoiceDetailDto | null
  /** رصيد العميل بعد الفاتورة (للآجل/المختلط) */
  customerBalance: number | null
  onPrint: (invoice: InvoiceDetailDto) => void
  onShare: (invoice: InvoiceDetailDto) => void
  onDone: () => void
}

export function SuccessSheet({
  open,
  onOpenChange,
  invoice,
  customerBalance,
  onPrint,
  onShare,
  onDone,
}: SuccessSheetProps) {
  if (!invoice) return null
  const cur = invoice.currencyCode

  return (
    <PosSheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) onDone()
      }}
      title="تم حفظ الفاتورة بنجاح"
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
            <span className="text-muted-foreground">الإجمالي</span>
            <span className="font-num font-bold">{formatAmount(invoice.total, { currency: cur })}</span>
          </div>
          <div className="flex justify-between py-0.5 text-[14px]">
            <span className="text-muted-foreground">المدفوع</span>
            <span className="font-num font-bold text-[#34D399]">
              {formatAmount(invoice.paidAmount, { currency: cur })}
            </span>
          </div>
          {invoice.dueAmount > 0 && (
            <div className="flex justify-between py-0.5 text-[14px]">
              <span className="text-muted-foreground">المتبقي (آجل)</span>
              <span className="font-num font-bold text-[#FBBF24]">
                {formatAmount(invoice.dueAmount, { currency: cur })}
              </span>
            </div>
          )}
          {invoice.customer && customerBalance != null && (
            <div className="mt-1 flex justify-between border-t border-border/60 pt-1.5 text-[14px]">
              <span className="text-muted-foreground">رصيد {invoice.customer.name}</span>
              <span className="font-num font-bold text-[#FBBF24]">
                {formatAmount(customerBalance, { currency: "YER", decimals: 0 })}
              </span>
            </div>
          )}
        </div>

        <div className="flex w-full flex-col gap-2">
          <PrimaryButton block onClick={() => onPrint(invoice)}>
            <Printer className="size-5" aria-hidden /> طباعة الإيصال
          </PrimaryButton>
          <PrimaryButton block variant="outline" onClick={() => onShare(invoice)}>
            <MessageCircle className="size-5" aria-hidden /> مشاركة واتساب
          </PrimaryButton>
          <PrimaryButton block variant="ghost" onClick={onDone}>
            تم — فاتورة جديدة
          </PrimaryButton>
        </div>
      </div>
    </PosSheet>
  )
}
