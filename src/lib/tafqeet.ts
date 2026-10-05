/**
 * تفقيط المبالغ — تحويل رقم إلى كلمات عربية (مبسّط للسندات).
 * يدعم حتى مئات الملايين + الكسور (هللات). مثال:
 * tafqeet(1250.5) → "ألف ومئتان وخمسون ريال وخمسون هللة لا غير"
 */

const ONES = [
  "", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة",
  "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر",
  "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر",
]
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"]
const HUNDREDS = [
  "", "مئة", "مئتان", "ثلاثمئة", "أربعمئة", "خمسمئة", "ستمئة", "سبعمئة", "ثمانمئة", "تسعمئة",
]

/** تحويل 0..999 إلى كلمات */
function under1000(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const rest = n % 100
  if (h > 0) parts.push(HUNDREDS[h])
  if (rest > 0) {
    if (rest < 20) parts.push(ONES[rest])
    else {
      const unit = rest % 10
      const ten = Math.floor(rest / 10)
      parts.push(unit > 0 ? `${ONES[unit]} و${TENS[ten]}` : TENS[ten])
    }
  }
  return parts.join(" و")
}

/** تحويل عدد صحيح إلى كلمات عربية (حتى 999,999,999) */
export function integerToArabicWords(n: number): string {
  if (!isFinite(n) || n < 0) return ""
  n = Math.floor(n)
  if (n === 0) return "صفر"
  if (n >= 1_000_000_000) return String(n)

  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1_000)
  const rest = n % 1_000
  const parts: string[] = []

  if (millions > 0) {
    if (millions === 1) parts.push("مليون")
    else if (millions === 2) parts.push("مليونان")
    else if (millions <= 10) parts.push(`${ONES[millions]} ملايين`)
    else parts.push(`${under1000(millions)} مليوناً`)
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push("ألف")
    else if (thousands === 2) parts.push("ألفان")
    else if (thousands <= 10) parts.push(`${ONES[thousands]} آلاف`)
    else parts.push(`${under1000(thousands)} ألفاً`)
  }
  if (rest > 0) parts.push(under1000(rest))
  return parts.join(" و")
}

/**
 * تفقيط مبلغ: «فقط X ريال وY هللة لا غير».
 * @param amount المبلغ
 * @param unit اسم وحدة العملة المفرد (ريال/ريال يمني/دولار)
 * @param fraction اسم الكسر (هللة/قرشاً) — يُعرض فقط إن وُجد كسر
 */
export function tafqeet(amount: number, unit = "ريال", fraction = "هللة"): string {
  if (!isFinite(amount)) return ""
  const negative = amount < 0
  const abs = Math.abs(amount)
  const intPart = Math.floor(abs)
  const fracPart = Math.round((abs - intPart) * 100)
  const intWords = integerToArabicWords(intPart)
  let out = `${negative ? "سالب " : ""}${intWords} ${unit}`
  if (fracPart > 0) {
    out += ` و${integerToArabicWords(fracPart)} ${fraction}`
  }
  return `فقط ${out} لا غير`
}
