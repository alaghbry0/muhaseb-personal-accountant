"use client";

/**
 * مشاركة الفاتورة عبر واتساب — FR-02-14.
 * يبني ملخصاً نصياً عربياً ويفتح wa.me (مع رقم العميل إن وُجد).
 */
import { toast } from "sonner";
import { formatAmount, formatDateDisplay, formatTime12 } from "@/lib/format";
import type { InvoiceDetailDto } from "@/domain/dto";

/** تطبيع رقم يمني للصيغة الدولية: 777123456 → 967777123456 */
export function normalizeYemeniPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("967")) return digits;
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.length === 9 && digits.startsWith("7")) return `967${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `967${digits.slice(1)}`;
  return digits;
}

/** نص ملخص الفاتورة (المنشأة، الرقم، التاريخ، العميل، أول 5 بنود، الإجماليات) */
export function buildInvoiceShareText(
  invoice: InvoiceDetailDto,
  companyName: string
): string {
  const cur = invoice.currencyCode;
  const lines: string[] = [];
  lines.push(`🏪 ${companyName}`);
  lines.push(`🧾 فاتورة مبيعات رقم: ${invoice.invoiceNo}`);
  lines.push(`📅 التاريخ: ${formatDateDisplay(invoice.issuedAt)} — ${formatTime12(invoice.createdAt)}`);
  lines.push(`👤 العميل: ${invoice.customer?.name ?? "نقدي"}`);
  lines.push("──────────────");
  lines.push("البنود:");
  const shown = invoice.items.slice(0, 5);
  for (const it of shown) {
    lines.push(`• ${it.productName} × ${formatAmount(it.qty, { decimals: it.qty % 1 ? 3 : 0, showSymbol: false })} = ${formatAmount(it.lineTotal, { currency: cur })}`);
  }
  if (invoice.items.length > 5) {
    lines.push(`...و ${invoice.items.length - 5} صنفاً آخر`);
  }
  lines.push("──────────────");
  lines.push(`الإجمالي: ${formatAmount(invoice.subtotal, { currency: cur })}`);
  if (invoice.discountAmount > 0) {
    lines.push(`الخصم: ${formatAmount(invoice.discountAmount, { currency: cur })}`);
  }
  if (invoice.taxAmount > 0) {
    lines.push(`الضريبة: ${formatAmount(invoice.taxAmount, { currency: cur })}`);
  }
  lines.push(`الصافي: ${formatAmount(invoice.total, { currency: cur })}`);
  lines.push(`المدفوع: ${formatAmount(invoice.paidAmount, { currency: cur })}`);
  if (invoice.dueAmount > 0) {
    lines.push(`المتبقي (آجل): ${formatAmount(invoice.dueAmount, { currency: cur })}`);
  }
  lines.push("شكراً لتعاملكم معنا 🌹");
  return lines.join("\n");
}

/** فتح واتساب مع ملخص الفاتورة (رقم العميل إن وُجد، وإلا اختيار جهة) */
export function shareInvoiceWhatsApp(
  invoice: InvoiceDetailDto,
  companyName: string
): void {
  const text = buildInvoiceShareText(invoice, companyName);
  const phone = normalizeYemeniPhone(invoice.customer?.whatsapp || invoice.customer?.phone);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  toast.info("سيتم فتح واتساب لمشاركة الفاتورة…");
  window.open(url, "_blank", "noopener,noreferrer");
}
