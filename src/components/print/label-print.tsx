"use client";

/**
 * طباعة ملصقات الصنف ⭐ — ثلاث صيغ (FR-01-02):
 *  - a4: ورقة رف A4 شبكة 3×8 (24 ملصقاً/صفحة، 63×25مم للملصق) بحدود قص متقطعة.
 *  - t58: حراري 58×32مم — كل ملصق صفحة مستقلة (page-break) بلا حدود قص
 *    (الطابعة الحرارية تقص ذاتياً — أبيض/أسود فقط).
 *  - t80: حراري 80×50مم — نفس نمط t58 بخطوط أكبر وQR أعرض.
 * رمز الملصق: باركود Code128 (SVG فوري + أرقام) أو رمز QR (qrSvg — JSON
 * عربي مضغوط بالاسم والباركود والسعر، يقرأه أي قارئ) بعرض كامل وارتفاع مربع.
 * بنفس نمط receipt-print: يُبنى DOM مخفي #print-root يظهر وحده في وضع الطباعة
 * (print.css) ثم window.print() ويُنظَّف بعد afterprint.
 */
import "./print.css";
import { toast } from "sonner";
import { code128Svg, barcodeDisplayText } from "@/lib/barcode";
import { qrSvg, qrPayload } from "@/lib/qr";
import { CURRENCY_DECIMALS, CURRENCY_SYMBOLS } from "@/lib/format";
import type { PrintCompanyInfo } from "./receipt-print";

export interface LabelProduct {
  name: string;
  barcode: string;
  price?: number;
  currencyCode?: string;
}

/** صيغة الورق: ورق A4 (شبكة) أو حراري 58/80مم (ملصق واحد لكل صفحة) */
export type LabelFormat = "a4" | "t58" | "t80";

/** رمز الملصق: باركود Code128 أو رمز QR */
export type LabelCode = "code128" | "qr";

export interface LabelSheetOptions {
  company: PrintCompanyInfo | null;
  product: LabelProduct;
  count: number;
  /** افتراضياً a4 (توافق رجعي مع الاستدعاءات القائمة) */
  format?: LabelFormat;
  /** افتراضياً code128 (توافق رجعي) */
  codeType?: LabelCode;
}

/** 3 أعمدة × 8 صفوف لكل صفحة A4 */
export const LABELS_PER_PAGE = 24;
/** الحد الأقصى لورق A4 */
export const LABELS_MAX = 240;
/** الحد الأقصى للحراري (ملصق/صفحة — يطبع بسرعة) */
export const LABELS_MAX_THERMAL = 100;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * نص سعر بأسلوب غربي ثابت للملصقات — استثناء مقصود لشكل الأرقام (FR-13-05):
 * الملصق يُقرأ بماسح ضوئي/يدوياً على الرف فتبقى أرقامه غربية دائماً بلا formatAmount.
 */
export function labelPriceText(price: number, currencyCode?: string): string {
  const cur = currencyCode ?? "";
  const dec = CURRENCY_DECIMALS[cur] ?? 2;
  const n = price.toLocaleString("en-US", { maximumFractionDigits: dec });
  return cur && CURRENCY_SYMBOLS[cur] ? `${n} ${CURRENCY_SYMBOLS[cur]}` : n;
}

/** عنصر الرمز: باركود (أعمدة + أرقام) أو QR مربع (بلا أرقام تحته) */
function labelCodeHtml(product: LabelProduct, codeType: LabelCode, qr: string): string {
  if (codeType === "qr") {
    // يُدرج مكان شريط الباركود بعرض كامل وارتفاع مربع (ضبط الحجم في print.css)
    return `<div class="label-qr">${qr}</div>`;
  }
  const svg = code128Svg(product.barcode, { showText: false, barColor: "#000000" });
  const digits = esc(barcodeDisplayText(product.barcode) || product.barcode);
  return `<div class="label-bar">${svg}</div><div class="label-digits">${digits}</div>`;
}

function labelPriceHtml(product: LabelProduct): string {
  return product.price != null && isFinite(product.price)
    ? `<div class="label-price">${esc(labelPriceText(product.price, product.currencyCode))}</div>`
    : "";
}

/** خلية ملصق A4 (63×25مم داخل شبكة 3×8) */
function labelCellHtml(
  company: PrintCompanyInfo | null,
  product: LabelProduct,
  codeType: LabelCode,
  qr: string
): string {
  return `
  <div class="label-cell">
    ${company ? `<div class="label-company">${esc(company.name)}</div>` : ""}
    <div class="label-name">${esc(product.name)}</div>
    ${labelCodeHtml(product, codeType, qr)}
    ${labelPriceHtml(product)}
  </div>`;
}

/** ملصق حراري كامل الصفحة (t58/t58) — بلا حدود قص: الطابعة تقص ذاتياً */
function thermalCellHtml(
  company: PrintCompanyInfo | null,
  product: LabelProduct,
  codeType: LabelCode,
  qr: string
): string {
  return `
  <div class="label-company">${esc(company?.name ?? "")}</div>
  <div class="label-name">${esc(product.name)}</div>
  ${labelCodeHtml(product, codeType, qr)}
  ${labelPriceHtml(product)}`;
}

/** @page لكل صيغة */
function pageStyle(format: LabelFormat): string {
  if (format === "t58") return "@page { size: 58mm 32mm; margin: 0; }";
  if (format === "t80") return "@page { size: 80mm 50mm; margin: 0; }";
  return "@page { size: A4; margin: 5mm; }";
}

/**
 * طباعة ملصقات صنف — async (توليد QR واعد).
 *  - a4: count نسخة موزعة على صفحات 3×8 (1..240).
 *  - t58/t80: كل ملصق صفحة مستقلة (1..100).
 * بلا باركود ⇒ toast خطأ.
 */
export async function printLabelSheet({
  company,
  product,
  count,
  format = "a4",
  codeType = "code128",
}: LabelSheetOptions): Promise<void> {
  if (!product.barcode) {
    toast.error("لا يوجد باركود لهذا الصنف — يُولَّد تلقائياً عند حفظ صنف جديد");
    return;
  }
  const thermal = format !== "a4";
  const max = thermal ? LABELS_MAX_THERMAL : LABELS_MAX;
  const n = Math.max(1, Math.min(max, Math.floor(Number(count)) || LABELS_PER_PAGE));

  // رمز QR يُولَّد مرة واحدة (الحمولة: JSON عربي مضغوط) — فشل التوليد ⇒ رجوع للباركود
  let qr = "";
  let effectiveCode = codeType;
  if (codeType === "qr") {
    qr = await qrSvg(qrPayload(product));
    if (!qr) effectiveCode = "code128";
  }

  let docHtml: string;
  if (thermal) {
    // كل ملصق صفحة كاملة بخلاصة الصنف — page-break بين الصفحات (`.last` بدونه)
    const cls = format === "t58" ? "label-t58" : "label-t80";
    docHtml =
      `<div class="print-doc label-thermal-doc">` +
      Array.from({ length: n }, (_, i) => {
        const last = i === n - 1 ? " last" : "";
        return `<div class="${cls}${last}">${thermalCellHtml(company, product, effectiveCode, qr)}</div>`;
      }).join("") +
      `</div>`;
  } else {
    const pages = Math.ceil(n / LABELS_PER_PAGE);
    const pagesHtml = Array.from({ length: pages }, (_, p) => {
      const inPage = Math.min(LABELS_PER_PAGE, n - p * LABELS_PER_PAGE);
      const cells = Array.from({ length: inPage }, () =>
        labelCellHtml(company, product, effectiveCode, qr)
      ).join("");
      return `<div class="label-page${p === pages - 1 ? " last" : ""}">${cells}</div>`;
    }).join("");
    docHtml = `<div class="print-doc label-sheet">${pagesHtml}</div>`;
  }

  try {
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    root.dir = "rtl";
    root.innerHTML = docHtml;

    const style = document.createElement("style");
    style.textContent = pageStyle(format);
    root.appendChild(style);

    document.body.appendChild(root);
    const clean = () => root.remove();
    window.addEventListener("afterprint", clean, { once: true });
    setTimeout(clean, 90_000); // شبكة أمان للتنظيف

    window.print();
    if (thermal) {
      toast.success(
        `تم إرسال ${n} ملصقاً (حراري ${format === "t58" ? "58" : "80"}مم — «${product.name}»)`
      );
    } else {
      const pages = Math.ceil(n / LABELS_PER_PAGE);
      toast.success(`تم إرسال ${n} ملصقاً (${pages} صفحة ورق A4 — «${product.name}»)`);
    }
  } catch {
    toast.error("تعذر فتح حوار الطباعة");
  }
}
