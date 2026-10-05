/**
 * Domain — حسابات الفواتير (نقية، بلا قاعدة بيانات) — يستخدمها الـ API داخل transaction ذرّية.
 * نموذج الحساب:
 *   البند:  gross = qty × unitPrice
 *           lineDiscount = gross×discountPercent% + discountAmount (يُقص عند الصفر)
 *           lineNet = gross − lineDiscount
 *           lineTax = lineNet × taxPercent%
 *           lineTotal = lineNet + lineTax
 *   الفاتورة: subtotal = Σ lineNet  (بعد خصومات البنود، قبل الضريبة)
 *             base = subtotal − invoiceDiscount (خصم الإجمالي)
 *             taxAmount = Σ lineTax (إن وُجدت ضرائب بنود) وإلا base × taxRate%
 *             total = base + taxAmount
 *             dueAmount = total − paidAmount
 */
import { round2, round4 } from "./money"

export interface LineInput {
  qty: number
  unitPrice: number
  discountPercent?: number
  discountAmount?: number
  taxPercent?: number
}

export interface LineTotals {
  gross: number
  discount: number
  net: number
  tax: number
  total: number
}

/** إجمالي سطر واحد بعد الخصم والضريبة */
export function calcLineTotal(line: LineInput): LineTotals {
  const gross = round4(line.qty * line.unitPrice)
  const percentDisc = round4(gross * ((line.discountPercent ?? 0) / 100))
  let discount = round4(percentDisc + (line.discountAmount ?? 0))
  if (discount < 0) discount = 0
  if (discount > gross) discount = gross
  const net = round4(gross - discount)
  const tax = round4(net * ((line.taxPercent ?? 0) / 100))
  const total = round4(net + tax)
  return { gross, discount, net, tax, total }
}

export interface InvoiceTotalsInput {
  /** خصم على إجمالي الفاتورة (قيمة ثابتة) */
  invoiceDiscount?: number
  /** نسبة ضريبة الفاتورة % — تُطبق إذا لم تحمل البنود ضرائبها الخاصة */
  taxRate?: number
  /** المدفوع نقداً الآن (للنقدي = total، للآجل = 0، للمختلط جزئي) */
  paidAmount?: number
}

export interface InvoiceTotals {
  subtotal: number
  discountAmount: number
  base: number
  taxAmount: number
  total: number
  paidAmount: number
  dueAmount: number
}

/**
 * حساب إجماليات الفاتورة من بنودها.
 * paidAmount يُقص عند total (لا يمكن دفع أكثر من قيمتها).
 */
export function calcInvoiceTotals(
  items: LineInput[],
  opts: InvoiceTotalsInput = {}
): InvoiceTotals {
  const invoiceDiscount = Math.max(0, opts.invoiceDiscount ?? 0)

  let subtotal = 0
  let lineTaxSum = 0
  for (const item of items) {
    const line = calcLineTotal(item)
    subtotal += line.net
    lineTaxSum += line.tax
  }
  subtotal = round4(subtotal)
  lineTaxSum = round4(lineTaxSum)

  const base = round4(Math.max(0, subtotal - invoiceDiscount))
  const taxAmount =
    lineTaxSum > 0 ? lineTaxSum : round4(base * ((opts.taxRate ?? 0) / 100))
  const total = round4(base + taxAmount)

  const paidRaw = opts.paidAmount ?? total
  const paidAmount = round4(Math.min(Math.max(0, paidRaw), total))
  const dueAmount = round4(total - paidAmount)

  return {
    subtotal,
    discountAmount: round4(invoiceDiscount),
    base,
    taxAmount,
    total,
    paidAmount,
    dueAmount,
  }
}

/** تحديد حالة الدفع من المدفوع — cash|credit|mixed (held يحدده المستخدم صراحة) */
export function derivePayStatus(total: number, paid: number): "cash" | "credit" | "mixed" {
  if (paid >= total - 0.009) return "cash"
  if (paid <= 0.009) return "credit"
  return "mixed"
}
