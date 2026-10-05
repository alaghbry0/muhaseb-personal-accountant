/**
 * Domain — الترقيم التسلسلي للمستندات — SRS §5.4 قاعدة 1:
 * PREFIX-YYYY-NNNNN (خمس خانات) — عدّاد سنوي لا يُصفّر عند التراجع، الفراغ مسموح.
 */

/** يولّد الرقم التالي: nextInvoiceNo('INV', 2026, 41) → 'INV-2026-00042' */
export function nextInvoiceNo(prefix: string, year: number, lastNo: number): string {
  const seq = String(lastNo + 1).padStart(5, "0")
  return `${prefix}-${year}-${seq}`
}

/** الرقم التسلسلي من رقم مستند موجود (INV-2026-00042 → 42) أو 0 */
export function parseSeq(docNo: string): number {
  const parts = docNo.split("-")
  const last = parts[parts.length - 1]
  const n = parseInt(last, 10)
  return isNaN(n) ? 0 : n
}

/** سنة المستند من رقمه (INV-2026-00042 → 2026) أو السنة الحالية */
export function parseYear(docNo: string): number {
  const parts = docNo.split("-")
  if (parts.length >= 2) {
    const y = parseInt(parts[parts.length - 2], 10)
    if (!isNaN(y)) return y
  }
  return new Date().getFullYear()
}
