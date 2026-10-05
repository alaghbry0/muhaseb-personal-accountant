/**
 * غلاف رقيق لمكتبة qrcode (FR-01-02 «رمز QR للصنف») — يُرجع SVG نصياً:
 * - viewBox + path stroke (يدعم أي محتوى بما فيه العربية داخل JSON).
 * - استبدال stroke الافتراضي بلون الطالب (افتراضياً أسود للطباعة).
 * - نص فارغ أو يتجاوز 1000 حرف ⇒ "" (شبكة أمان بلا رمي استثناء).
 * الخادم حي على المنفذ 3000 — لا bun run dev.
 */
import QRCode from "qrcode";

export interface QrSvgOptions {
  /** لون النقاط — افتراضياً #000000 (حبر أسود للطباعة/الرف) */
  color?: string;
}

const QR_TEXT_MAX = 1000;

/** SVG نصي للنص المرمّز QR — "" عند الفشل (نص فارغ/طويل جداً >1000 حرف). */
export async function qrSvg(text: string, opts?: QrSvgOptions): Promise<string> {
  const color = opts?.color ?? "#000000";
  const clean = text ?? "";
  if (clean.length === 0 || clean.length > QR_TEXT_MAX) return "";
  try {
    const svg = await QRCode.toString(clean, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
    if (!svg) return "";
    return svg.replace(/stroke="#000000"/g, `stroke="${color}"`);
  } catch {
    return "";
  }
}

/** حمولة QR للصنف: JSON عربي مضغوط {"ن":name,"ب":barcode,"س":price?} — السعر عند وجوده فقط. */
export function qrPayload(p: {
  name: string;
  barcode: string;
  price?: number | null;
}): string {
  const obj: Record<string, unknown> = { ن: p.name, ب: p.barcode };
  if (p.price != null && isFinite(p.price)) obj["س"] = p.price;
  return JSON.stringify(obj);
}
