"use client";

/**
 * مساعدات واتساب لوحدة الأطراف — تذكيرات الديون والأقساط وكشوف الحساب (FR-03-06، FR-05-03).
 */
import { toast } from "sonner";
import { formatAmount, formatDate } from "@/lib/format";
import { normalizeYemeniPhone } from "@/lib/share";

/** فتح واتساب برسالة جاهزة (رقم اختياري — بدونه يفتح اختيار جهة) */
export function openWhatsApp(phone: string | null | undefined, text: string): void {
  const p = normalizeYemeniPhone(phone)
  const url = p
    ? `https://wa.me/${p}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(url, "_blank", "noopener,noreferrer")
}

/** رسالة تذكير بالرصيد (FR-03-06): الرصيد الحالي + آخر 3 حركات */
export function buildDebtReminderText(opts: {
  customerName: string
  companyName: string
  balance: number
  currencyCode: string
  lastRows?: Array<{ date: string; docLabel: string; debit: number; credit: number }>
}): string {
  const { customerName, companyName, balance, currencyCode, lastRows } = opts
  const lines: string[] = []
  lines.push(`مرحباً ${customerName} 🌹`)
  lines.push(`${companyName}`)
  lines.push("──────────────")
  lines.push(
    balance > 0
      ? `نودّ تذكيركم بسداد المبلغ المتبقي على حسابكم: ${formatAmount(balance, { currency: currencyCode })}`
      : `رصيدكم الحالي لدينا دائن بمقدار: ${formatAmount(Math.abs(balance), { currency: currencyCode })}`
  )
  if (lastRows && lastRows.length > 0) {
    lines.push("──────────────")
    lines.push("آخر الحركات:")
    for (const r of lastRows.slice(0, 3)) {
      const v = r.debit > 0 ? `+${formatAmount(r.debit, { currency: currencyCode })}` : `−${formatAmount(r.credit, { currency: currencyCode })}`
      lines.push(`• ${formatDate(r.date)} — ${r.docLabel}: ${v}`)
    }
  }
  lines.push("شكراً لتعاملكم معنا 🙏")
  return lines.join("\n")
}

/** رسالة تذكير بقسط مستحق (FR-05-03) */
export function buildInstallmentReminderText(opts: {
  customerName: string
  companyName: string
  seq: number
  installmentsCount: number
  dueDate: string
  remaining: number
  currencyCode: string
  balance?: number | null
}): string {
  const { customerName, companyName, seq, installmentsCount, dueDate, remaining, currencyCode, balance } = opts
  const lines: string[] = []
  lines.push(`مرحباً ${customerName} 🌹`)
  lines.push(`${companyName}`)
  lines.push("──────────────")
  lines.push(
    `تذكير وديّ بالقسط رقم ${seq} من ${installmentsCount} بقيمة ${formatAmount(remaining, { currency: currencyCode })} المستحق بتاريخ ${formatDate(dueDate)}`
  )
  if (balance != null && balance > 0) {
    lines.push(`رصيدكم الحالي: ${formatAmount(balance, { currency: currencyCode })}`)
  }
  lines.push("شكراً لتعاملكم معنا 🙏")
  return lines.join("\n")
}

/** إشعار + فتح */
export function remindViaWhatsApp(phone: string | null | undefined, text: string): void {
  toast.info("سيتم فتح واتساب لإرسال التذكير…")
  openWhatsApp(phone, text)
}
