"use client";

/**
 * طباعة ملصقات الباركود ⭐ — ورقة A4 شبكة 3×8 (24 ملصقاً/صفحة، 63×25مم للملصق)
 * بنفس نمط receipt-print: يُبنى DOM مخفي #print-root يظهر وحده في وضع الطباعة
 * (print.css) ثم window.print() ويُنظَّف بعد afterprint.
 * الملصق: المنشأة (6pt) + اسم الصنف (سطران) + باركود Code128 حقيقي قابل للمسح
 * + الأرقام + السعر — كله حبر أسود على أبيض بحدود قص متقطعة.
 */
import "./print.css";
import { toast } from "sonner";
import { code128Svg, barcodeDisplayText } from "@/lib/barcode";
import { CURRENCY_DECIMALS, CURRENCY_SYMBOLS } from "@/lib/format";
import type { PrintCompanyInfo } from "./receipt-print";

export interface LabelProduct {
  name: string;
  barcode: string;
  price?: number;
  currencyCode?: string;
}

export interface LabelSheetOptions {
  company: PrintCompanyInfo | null;
  product: LabelProduct;
  count: number;
}

/** 3 أعمدة × 8 صفوف لكل صفحة A4 */
export const LABELS_PER_PAGE = 24;
export const LABELS_MAX = 240;

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

function labelCellHtml(company: PrintCompanyInfo | null, product: LabelProduct): string {
  // أعمدة فقط (بلا نص داخل svg) — التمدد الأفقي مسموح، والأرقام نص HTML بضبط 7.5pt
  const svg = code128Svg(product.barcode, { showText: false, barColor: "#000000" });
  const digits = esc(barcodeDisplayText(product.barcode) || product.barcode);
  const price =
    product.price != null && isFinite(product.price)
      ? `<div class="label-price">${esc(labelPriceText(product.price, product.currencyCode))}</div>`
      : "";
  return `
  <div class="label-cell">
    ${company ? `<div class="label-company">${esc(company.name)}</div>` : ""}
    <div class="label-name">${esc(product.name)}</div>
    <div class="label-bar">${svg}</div>
    <div class="label-digits">${digits}</div>
    ${price}
  </div>`;
}

/**
 * طباعة ورقة ملصقات صنف: count نسخة متطابقة موزعة على صفحات 3×8.
 * count تُقيَّد بين 1 و240. بلا باركود ⇒ toast خطأ.
 */
export function printLabelSheet({ company, product, count }: LabelSheetOptions): void {
  if (!product.barcode) {
    toast.error("لا يوجد باركود لهذا الصنف — يُولَّد تلقائياً عند حفظ صنف جديد");
    return;
  }
  const n = Math.max(1, Math.min(LABELS_MAX, Math.floor(Number(count)) || LABELS_PER_PAGE));
  const pages = Math.ceil(n / LABELS_PER_PAGE);

  const pagesHtml = Array.from({ length: pages }, (_, p) => {
    const inPage = Math.min(LABELS_PER_PAGE, n - p * LABELS_PER_PAGE);
    const cells = Array.from({ length: inPage }, () => labelCellHtml(company, product)).join("");
    return `<div class="label-page${p === pages - 1 ? " last" : ""}">${cells}</div>`;
  }).join("");

  try {
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    root.dir = "rtl";
    root.innerHTML = `<div class="print-doc label-sheet">${pagesHtml}</div>`;

    const style = document.createElement("style");
    style.textContent = "@page { size: A4; margin: 5mm; }";
    root.appendChild(style);

    document.body.appendChild(root);
    const clean = () => root.remove();
    window.addEventListener("afterprint", clean, { once: true });
    setTimeout(clean, 90_000); // شبكة أمان للتنظيف

    window.print();
    toast.success(
      `تم إرسال ${n} ملصقاً للطباعة (${pages} صفحة A4 — «${product.name}»)`
    );
  } catch {
    toast.error("تعذر فتح حوار الطباعة");
  }
}
