/**
 * مولّد باركود Code128-B خالص (بلا DOM/React) — FR-01-02 «مع دعم توليد رمز QR للصنف».
 * يُرجع سلسلة SVG جاهزة للحقن أو للطباعة:
 *  - الأعمدة `fill="currentColor"` افتراضياً فتتبع لون النص (صحيح في الوضعين الداكن/الفاتح).
 *  - الطول المعروض داخل SVG عند showText يتمدد معه بنفس المقياس (بلا تشويه).
 *  - عند showText=false يُضاف preserveAspectRatio="none" فيجوز تمدّد الأعمدة أفقياً
 *    (ممارسة قياسية للملصقات الحرارية — الأعمدة تتحرك؟ لا: تتسع فقط) والأرقام
 *    تُعرض عندئذ كنص HTML خارج الـ SVG بضبط الطالب.
 * جدول الأنماط (107 أنماط) مُطابق للمواصفة القياسية ISO/IEC 15417 — تم التحقق
 * منه بمطابقة حرفية بين جدول العروض الرسمي وترميز JsBarcode الثنائي.
 */
// أنماط Code128: القيم 0..102 رموز بيانات، 103/104/105 بدايات A/B/C، 106 التوقف
// (نمط التوقف 7 عناصر «2331112» = 13 موديولاً بما فيها العمود الختامي العريض).
const PATTERNS: readonly string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222",
  "122213", "122312", "132212", "221213", "221312", "231212",
  "112232", "122132", "122231", "113222", "123122", "123221",
  "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321",
  "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131",
  "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124",
  "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111",
  "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141",
  "411131",
  // 103: بداية A، 104: بداية B، 105: بداية C
  "211412", "211214", "211232",
  // 106: التوقف (7 عناصر — العمود الأخير 2 موديولاً)
  "2331112",
] as const;

const START_B = 104;
const STOP = 106;

export interface BarcodeSvgOptions {
  /** عرض عنصر svg بالبكسل — افتراضياً "100%" (يتمدد بحاويته) */
  width?: number;
  /** الارتفاع الكلي بالبكسل (شاملاً منطقة الأرقام عند showText) — افتراضي 64 */
  height?: number;
  /** إظهار النص داخل الـ svg (مونوسباس، يتمدد بمقياس موحّد بلا تشويه) */
  showText?: boolean;
  /** لون الأعمدة — افتراضياً currentColor ليرث لون النص في الوضعين */
  barColor?: string;
}

/** تهريب كيانات XML للنص داخل SVG */
function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * ترميز Code128-B (محارف ASCII 32..126) وإرجاع SVG نصي.
 * - سلسلة فارغة (أو لا محارف صالحة) ⇒ "".
 * - خانة التحقق: ((start + Σ(قيمة المحرف × ترتيبه 1-based)) % 103).
 */
export function code128Svg(input: string, opts: BarcodeSvgOptions = {}): string {
  // تنقية المدخل إلى نطاق Code B فقط (محارف قابلة للطباعة) — الباقي يُهمَل
  const clean = Array.from(input ?? "")
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c <= 126;
    })
    .join("");
  if (clean.length === 0) return "";

  const { width, height = 64, showText = true, barColor = "currentColor" } = opts;

  // سلسلة القيم: بداية B ثم قيم المحارف (ASCII − 32) ثم التحقق
  const values: number[] = [START_B];
  for (const ch of clean) values.push(ch.charCodeAt(0) - 32);
  let sum = START_B;
  values.forEach((v, i) => {
    if (i > 0) sum += v * i; // i = 1..n (ترتيب المحرف بعد البداية)
  });
  values.push(sum % 103);
  values.push(STOP);

  // حساب الموديولاً وبناء أعمدة <rect> — وحدة viewBox = موديول واحد
  const totalModules = values.reduce(
    (acc, v) => acc + PATTERNS[v].split("").reduce((a, d) => a + Number(d), 0),
    0
  );

  // منطقة النص السفلية عند showText (نسبة من الارتفاع بحد أدنى مريح)
  const textZone = showText ? Math.max(Math.round(height * 0.24), 11) : 0;
  const barH = height - textZone;

  let x = 0;
  let bars = "";
  for (const v of values) {
    const els = PATTERNS[v];
    for (let i = 0; i < els.length; i++) {
      const w = Number(els[i]);
      // العناصر الزوجية (0,2,4,…) أعمدة والفردية فراغات
      if (i % 2 === 0) {
        bars += `<rect x="${x}" y="0" width="${w}" height="${barH}" fill="${barColor}"/>`;
      }
      x += w;
    }
  }

  const textEl = showText
    ? `<text x="${totalModules / 2}" y="${height}" text-anchor="middle" dominant-baseline="auto" font-family="'IBM Plex Sans Arabic', ui-monospace, monospace" font-size="${Math.max(
      Math.round(textZone * 0.82),
      9
    )}" fill="${barColor}">${escXml(clean)}</text>`
    : "";

  const widthAttr = width != null ? ` width="${width}"` : ' width="100%"';
  // بلا نص يجوز التمدد الأفقي (أعمدة فقط)؛ مع النص مقياس موحّد يمنع تشويه المحارف
  const par = showText ? "" : ' preserveAspectRatio="none"';

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${height}"${widthAttr}` +
    ` height="${height}"${par} role="img" aria-label="باركود ${escXml(clean)}">${bars}${textEl}</svg>`
  );
}

/**
 * أرقام باركود نظيفة للعرض النصي: فقط [A-Za-z0-9 -./] (أرقام EAN وأكواد يدوية).
 * يُستخدم حيث يُعرض الباركود نصاً خارج SVG — القيود تحصر المدخلات أصلاً (EAN-13
 * أرقام)، وهذه شبكة أمان للعرض.
 */
export function barcodeDisplayText(input: string): string {
  return (input ?? "").replace(/[^A-Za-z0-9 .\-/]/g, "");
}
