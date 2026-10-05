/**
 * تنسيق موحد للمبالغ والتواريخ والفترات (SRS §5.4 قاعدة 5).
 * شكل الأرقام (FR-13-05): متغير module-level «digitsShape» يتحكم في مخرجات formatAmount —
 * يضبطه AppShell من مخزن إعدادات العرض (western 0-9 / arabic ٠-٩) قبل كل رسم،
 * فتتبعه كل المبالغ والكميات في التطبيق (266+ استدعاء) دون تعديل الشاشات.
 * التواريخ (formatDate/formatDateTime/formatTime12) تبقى غربية عمداً — مخارجها تُستخدم
 * في حمولات API وحقول date فأي تحويل لها يُفسد البيانات.
 */

export type CurrencyCode = "YER" | "SAR" | "USD" | "AED"

/** رموز العملات المعروضة */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  YER: "ر.ي",
  SAR: "ر.س",
  USD: "$",
  AED: "د.إ",
}

/** الخانات العشرية الافتراضية لكل عملة (YER تُعرض بدون كسور) */
export const CURRENCY_DECIMALS: Record<string, number> = {
  YER: 0,
  SAR: 2,
  USD: 2,
  AED: 2,
}

/** أسماء الأيام العربية — يبدأ من الأحد */
export const ARABIC_DAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
] as const

export const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const

const AR_DIGITS = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"]

/** تحويل الأرقام الغربية إلى هندية (خيار إعدادات العرض) */
export function toArabicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => AR_DIGITS[Number(d)])
}

// ═══ شكل الأرقام المعروض (FR-13-05) ═══
// متغير module-level مستقل عن مخزن zustand (لا استيراد متبادل ولا مشاكل SSR) —
// AppShell يضبطه قبل كل رسم ويُعيد تركيب الشجرة عند التبديل (key remount).
let digitsShape: "western" | "arabic" = "western";

/** ضبط شكل أرقام formatAmount على مستوى التطبيق (يستدعى من AppShell) */
export function setDigitsShape(s: "western" | "arabic") {
  digitsShape = s;
}

/** شكل الأرقام الحالي (للعرض/التشخيص) */
export function getDigitsShape(): "western" | "arabic" {
  return digitsShape;
}

/** تحويل نص أرقام حسب الشكل المفعّل (غربية كما هي / هندية ٠-٩) */
function shaped(s: string): string {
  return digitsShape === "arabic" ? toArabicDigits(s) : s;
}

/** تقريب مدمج: يزيل الأصفار الذيلية الزائدة (12.50 → 12.5) */
export function num(n: number | null | undefined, decimals = 2): number {
  if (n == null || !isFinite(n)) return 0
  const f = Math.pow(10, decimals)
  return Math.round((n + Number.EPSILON) * f) / f
}

export interface FormatAmountOptions {
  /** عدد الخانات العشرية — افتراضياً حسب العملة */
  decimals?: number
  /** رمز العملة (YER/SAR/USD) */
  currency?: string
  /** إظهار رمز العملة */
  showSymbol?: boolean
  /** عرض سالب بين قوسين محاسبياً (1,200) */
  parentheses?: boolean
}

/**
 * تنسيق مبلغ بفواصل آلاف + رمز العملة، بفواصل الأرقام حسب شكل العرض المفعّل.
 * formatAmount(12500) → "12,500" (أو "١٢,٥٠٠" بالشكل الهندي) |
 * مع currency: "YER" → "12,500 ر.ي"
 */
export function formatAmount(
  n: number | null | undefined,
  opts: FormatAmountOptions = {}
): string {
  const { decimals, currency, showSymbol = true, parentheses = false } = opts
  const v = num(n, decimals ?? (currency ? (CURRENCY_DECIMALS[currency] ?? 2) : 2))
  const neg = v < 0
  const abs = Math.abs(v)
  const str = abs.toLocaleString("en-US", {
    minimumFractionDigits: decimals ?? (currency ? (CURRENCY_DECIMALS[currency] ?? 2) : 2),
    maximumFractionDigits: decimals ?? (currency ? (CURRENCY_DECIMALS[currency] ?? 2) : 2),
  })
  let out: string
  if (neg && parentheses) out = `(${str})`
  else if (neg) out = `-${str}`
  else out = str
  if (showSymbol && currency && CURRENCY_SYMBOLS[currency]) {
    out += ` ${CURRENCY_SYMBOLS[currency]}`
  }
  return shaped(out)
}

/** YYYY-MM-DD من كائن تاريخ أو نص */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return ""
  const dt = typeof d === "string" ? new Date(d.length <= 10 ? `${d}T00:00:00` : d) : d
  if (isNaN(dt.getTime())) return typeof d === "string" ? d : ""
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, "0")
  const day = String(dt.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** YYYY-MM-DD HH:mm */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return ""
  const dt = typeof d === "string" ? new Date(d) : d
  if (isNaN(dt.getTime())) return typeof d === "string" ? d : ""
  const hh = String(dt.getHours()).padStart(2, "0")
  const mm = String(dt.getMinutes()).padStart(2, "0")
  return `${formatDate(dt)} ${hh}:${mm}`
}

// ═══ نسخ العرض (FR-13-05) — تواريخ بأرقام هندية حسب شكل العرض ═══
// فرق جوهري: formatDate/formatDateTime مخارجهما تدخل حمولات API وحقول date
// فتبقى ISO غربية دائماً. أما *Display فيُستخدم **حصرياً في نصوص العرض**
// (JSX، قوالب الطباعة، مشاركة واتساب) فيتبع شكل الأرقام المفعّل.

/** تاريخ العرض YYYY-MM-DD بشكل الأرقام المفعّل (٠-٩ عند الهندي) — للنصوص المعروضة فقط */
export function formatDateDisplay(d: Date | string | null | undefined): string {
  return shaped(formatDate(d))
}

/** تاريخ/وقت العرض YYYY-MM-DD HH:mm بالشكل المفعّل — للنصوص المعروضة فقط */
export function formatDateTimeDisplay(d: Date | string | null | undefined): string {
  return shaped(formatDateTime(d))
}

/** 15:31 → 3:31 م */
export function formatTime12(d: Date | string | null | undefined): string {
  if (!d) return ""
  const dt = typeof d === "string" ? new Date(d) : d
  if (isNaN(dt.getTime())) return ""
  let h = dt.getHours()
  const period = h < 12 ? "ص" : "م"
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(dt.getMinutes()).padStart(2, "0")} ${period}`
}

/** اسم اليوم العربي لتاريخ */
export function dayName(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00`) : d
  return ARABIC_DAYS[dt.getDay()] ?? ""
}

/** تاريخ طويل عربي: «الأحد 5 أكتوبر 2026» */
export function formatDateLong(d: Date | string = new Date()): string {
  const dt = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00`) : d
  return `${dayName(dt)} ${dt.getDate()} ${ARABIC_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`
}

// ═══════════════ فترات التقارير ═══════════════

export type PeriodId = "today" | "week" | "month" | "quarter" | "year" | "custom"

export interface DateRange {
  from: string // YYYY-MM-DD شامل
  to: string // YYYY-MM-DD شامل
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/**
 * تحويل معرف فترة إلى نطاق تواريخ {from, to} شامل الطرفين.
 * today: اليوم | week: آخر 7 أيام | month: الشهر الحالي | quarter: الربع الحالي | year: السنة الحالية
 */
export function resolvePeriod(period: PeriodId, custom?: Partial<DateRange>): DateRange {
  const now = new Date()
  const today = formatDate(now)
  switch (period) {
    case "today":
      return { from: today, to: today }
    case "week":
      return { from: formatDate(addDays(now, -6)), to: today }
    case "month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from: formatDate(first), to: today }
    }
    case "quarter": {
      const qStart = Math.floor(now.getMonth() / 3) * 3
      const first = new Date(now.getFullYear(), qStart, 1)
      return { from: formatDate(first), to: today }
    }
    case "year": {
      const first = new Date(now.getFullYear(), 0, 1)
      return { from: formatDate(first), to: today }
    }
    case "custom":
      return {
        from: custom?.from ?? formatDate(addDays(now, -29)),
        to: custom?.to ?? today,
      }
  }
}

/** عنوان الفترة بالعربية */
export const PERIOD_LABELS: Record<PeriodId, string> = {
  today: "اليوم",
  week: "آخر 7 أيام",
  month: "هذا الشهر",
  quarter: "هذا الربع",
  year: "هذه السنة",
  custom: "فترة مخصصة",
}
