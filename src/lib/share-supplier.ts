/**
 * مشاركة نصية لمستندات المشتريات/المرتجعات عبر واتساب — Task 3-a
 * (نظير shareInvoiceWhatsApp من Task 2 لكن بمصطلحات المورد/المرتجع).
 */
import type { InvoiceDetailDto } from "@/domain/dto";
import { formatAmount, formatDate } from "@/lib/format";

const DOC_TITLES: Record<string, string> = {
  purchase: "فاتورة شراء",
  purchase_return: "مرتجع شراء",
  sale_return: "مرتجع بيع",
};

/** بناء النص العربي المشارك لمستند مشتريات/مرتجع */
export function buildSupplierShareText(invoice: InvoiceDetailDto, companyName: string): string {
  const cur = invoice.currencyCode;
  const title = DOC_TITLES[invoice.docType] ?? "مستند";
  const lines: string[] = [`${companyName}`, `${title} ${invoice.invoiceNo}`, formatDate(invoice.issuedAt)];
  const party =
    invoice.docType === "sale_return"
      ? invoice.customer?.name ?? "نقدي"
      : invoice.supplier?.name ?? "مورد نقدي";
  lines.push(invoice.docType === "sale_return" ? `العميل: ${party}` : `المورد: ${party}`);

  const items = invoice.items.slice(0, 5);
  for (const it of items) {
    lines.push(`• ${it.productName} ×${formatAmount(it.qty, { decimals: it.qty % 1 ? 3 : 0, showSymbol: false })} = ${formatAmount(it.lineTotal, { currency: cur })}`);
  }
  if (invoice.items.length > 5) lines.push(`…و ${invoice.items.length - 5} صنفاً آخر`);

  lines.push(`الإجمالي: ${formatAmount(invoice.total, { currency: cur })}`);
  if (invoice.paidAmount > 0) {
    lines.push(`المدفوع: ${formatAmount(invoice.paidAmount, { currency: cur })}`);
  }
  if (invoice.dueAmount > 0) {
    lines.push(`المتبقي: ${formatAmount(invoice.dueAmount, { currency: cur })}`);
  }
  if (invoice.dueAmount < 0) {
    lines.push(`خصم من الحساب: ${formatAmount(Math.abs(invoice.dueAmount), { currency: cur })}`);
  }
  return lines.join("\n");
}
