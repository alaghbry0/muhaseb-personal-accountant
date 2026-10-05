/**
 * Domain — حسابات مالية نقية (Float مع تقريب دقيق، بلا Decimal في SQLite).
 * كل الدوال نقية — لا تستورد قاعدة بيانات أو React.
 */

/** تقريب لخانتين مع معالجة دقة الفواصل العائمة */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** تقريب لثلاث خانات (كميات المخزون) */
export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000
}

/** تقريب لأربع خانات (المبالغ الدقيقة NUMERIC(14,4)) */
export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}

/** تحويل مبلغ من عملة إلى العملة الأساسية: amount × rate */
export function toBase(amount: number, rate: number): number {
  if (!rate || rate === 1) return round4(amount)
  return round4(amount * rate)
}

/** تحويل مبلغ من العملة الأساسية إلى عملة: amount ÷ rate */
export function fromBase(amountBase: number, rate: number): number {
  if (!rate || rate === 1) return round4(amountBase)
  return round4(amountBase / rate)
}

/** قسمة آمنة (بلا NaN/Infinity) */
export function safeDivide(a: number, b: number, fallback = 0): number {
  if (!b || !isFinite(b) || !isFinite(a)) return fallback
  const r = a / b
  return isFinite(r) ? r : fallback
}

/**
 * توزيع مبلغ على أوزان تناسبياً مع ضمان أن مجموع الأنصبة = المبلغ الأصلي
 * (الفروق الصغيرة تُضاف/تُخصم على النصيب الأخير).
 * مثال: allocate(100, [1,1,1]) → [33.34, 33.33, 33.33]
 */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + w, 0)
  if (weights.length === 0) return []
  if (total <= 0) {
    // أوزان صفرية — توزيع متساوٍ
    const even = round2(amount / weights.length)
    const parts = weights.map(() => even)
    parts[parts.length - 1] = round2(amount - even * (weights.length - 1))
    return parts
  }
  const parts: number[] = []
  let consumed = 0
  for (let i = 0; i < weights.length; i++) {
    if (i === weights.length - 1) {
      // النصيب الأخير يلتقط الكسر لضمان التطابق التام
      const last = round2(amount - consumed)
      parts.push(last)
    } else {
      const share = round2((amount * weights[i]) / total)
      parts.push(share)
      consumed += share
    }
  }
  return parts
}

/**
 * متوسط التكلفة المرجّح (WAC) — SRS §5.4 قاعدة 2:
 * new_cost = (qty_old×cost_old + qty_new×cost_new) / (qty_old + qty_new)
 */
export function weightedAverageCost(
  qtyOld: number,
  costOld: number,
  qtyNew: number,
  costNew: number
): number {
  const totalQty = qtyOld + qtyNew
  if (totalQty <= 0) return round4(costNew)
  return round4((qtyOld * costOld + qtyNew * costNew) / totalQty)
}
