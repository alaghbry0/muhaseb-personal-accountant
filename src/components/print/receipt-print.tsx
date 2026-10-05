"use client";

/**
 * الطباعة ⭐ — إيصال حراري 58/80مم + فاتورة A4 — عبر window.print().
 * يُبنى DOM مخفي (#print-root) يظهر وحده في وضع الطباعة (print.css)
 * ثم يستدعى window.print() ويُنظَّف بعد afterprint.
 */
import "./print.css";
import { toast } from "sonner";
import { formatAmount, formatDateDisplay, formatTime12 } from "@/lib/format";
import type { InvoiceDetailDto } from "@/domain/dto";

export interface PrintCompanyInfo {
  name: string;
  phone?: string | null;
  address?: string | null;
  footerText?: string | null;
}

export interface PrintInvoiceOptions {
  /** عرض الورق الحراري — 58 أو 80مم (للقالب الحراري) */
  paper?: "58" | "80";
  /** receipt (افتراضي) أو a4 */
  template?: "receipt" | "a4";
  company: PrintCompanyInfo;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtQty(q: number): string {
  const dec = Math.abs(q % 1) > 1e-9 ? 3 : 0;
  return formatAmount(q, { decimals: dec, showSymbol: false });
}

function fmtAmount(n: number, currency: string): string {
  return formatAmount(n, { currency });
}

function dash(): string {
  return `<div class="rc-dash"></div>`;
}

// ═══════════════ قالب الإيصال الحراري ═══════════════

function receiptHtml(invoice: InvoiceDetailDto, opts: PrintInvoiceOptions): string {
  const paper = opts.paper ?? "80";
  const width = paper === "58" ? "48mm" : "72mm";
  const c = opts.company;
  const cur = invoice.currencyCode;

  const meta: Array<[string, string]> = [
    ["رقم الفاتورة", invoice.invoiceNo],
    ["التاريخ", formatDateDisplay(invoice.issuedAt)],
    ["الوقت", formatTime12(invoice.createdAt)],
    ["العميل", invoice.customer?.name ?? "نقدي"],
  ];
  if (invoice.salesRepName) meta.push(["المندوب", invoice.salesRepName]);
  if (invoice.warehouseName) meta.push(["المخزن", invoice.warehouseName]);

  const itemsRows = invoice.items
    .map(
      (it) => `
      <tr>
        <td>${esc(it.productName)}${it.unitName ? ` <span style="color:#444">(${esc(it.unitName)})</span>` : ""}</td>
        <td class="num">${fmtQty(it.qty)}</td>
        <td class="num">${fmtAmount(it.unitPrice, cur)}</td>
        <td class="num">${fmtAmount(it.lineTotal, cur)}</td>
      </tr>`
    )
    .join("");

  const totalsRows: Array<{ label: string; value: string; big?: boolean }> = [
    { label: "الإجمالي", value: fmtAmount(invoice.subtotal, cur) },
  ];
  if (invoice.discountAmount > 0) {
    totalsRows.push({ label: "الخصم", value: `− ${fmtAmount(invoice.discountAmount, cur)}` });
  }
  if (invoice.taxAmount > 0) {
    totalsRows.push({ label: `الضريبة (${invoice.taxRate}%)`, value: fmtAmount(invoice.taxAmount, cur) });
  }
  totalsRows.push({ label: "الصافي", value: fmtAmount(invoice.total, cur), big: true });
  if (invoice.payStatus === "held") {
    totalsRows.push({ label: "الحالة", value: "فاتورة معلّقة — لم تُعتمد بعد" });
  } else {
    totalsRows.push({ label: "المدفوع", value: fmtAmount(invoice.paidAmount, cur) });
    if (invoice.dueAmount > 0) {
      totalsRows.push({ label: "المتبقي (آجل)", value: fmtAmount(invoice.dueAmount, cur) });
    }
  }

  const notesPrinted = invoice.notesPrinted
    ? `${dash()}<div class="rc-sub" style="text-align:right">${esc(invoice.notesPrinted)}</div>`
    : "";

  return `
  <div class="print-doc rc" style="width:${width}">
    <div class="rc-logo">${esc(c.name.trim().charAt(0) || "م")}</div>
    <div class="rc-company">${esc(c.name)}</div>
    ${c.phone ? `<div class="rc-sub">هاتف: ${esc(c.phone)}</div>` : ""}
    ${c.address ? `<div class="rc-sub">${esc(c.address)}</div>` : ""}
    ${dash()}
    ${meta
      .map(
        ([k, v]) =>
          `<div class="rc-row"><span>${k}</span><span class="rc-val">${esc(v)}</span></div>`
      )
      .join("")}
    ${dash()}
    <table class="rc-items">
      <thead>
        <tr><th>الصنف</th><th class="num">كمية</th><th class="num">سعر</th><th class="num">إجمالي</th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
    ${dash()}
    <div class="rc-totals">
      ${totalsRows
        .map(
          (r) =>
            `<div class="rc-row${r.big ? " rc-big" : ""}"><span>${r.label}</span><span class="rc-val">${r.value}</span></div>`
        )
        .join("")}
    </div>
    ${dash()}
    <div class="rc-barcodelike">*${esc(invoice.invoiceNo)}*</div>
    ${notesPrinted}
    <div class="rc-footer">
      ${c.footerText ? `${esc(c.footerText)}<br/>` : ""}
      طور بواسطة المُحاسِب الشخصي
    </div>
  </div>`;
}

// ═══════════════ قالب A4 ═══════════════

function a4Html(invoice: InvoiceDetailDto, opts: PrintInvoiceOptions): string {
  const c = opts.company;
  const cur = invoice.currencyCode;

  const itemsRows = invoice.items
    .map(
      (it, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${esc(it.productName)}${it.unitName ? ` (${esc(it.unitName)})` : ""}</td>
        <td class="num">${fmtQty(it.qty)}</td>
        <td class="num">${fmtAmount(it.unitPrice, cur)}</td>
        <td class="num">${it.discountPercent > 0 ? `${it.discountPercent}%` : "—"}</td>
        <td class="num">${fmtAmount(it.lineTotal, cur)}</td>
      </tr>`
    )
    .join("");

  const totalsRows: Array<{ label: string; value: string; big?: boolean }> = [
    { label: "الإجمالي", value: fmtAmount(invoice.subtotal, cur) },
  ];
  if (invoice.discountAmount > 0) {
    totalsRows.push({ label: "الخصم", value: `− ${fmtAmount(invoice.discountAmount, cur)}` });
  }
  if (invoice.taxAmount > 0) {
    totalsRows.push({ label: `الضريبة (${invoice.taxRate}%)`, value: fmtAmount(invoice.taxAmount, cur) });
  }
  totalsRows.push({ label: "الصافي المستحق", value: fmtAmount(invoice.total, cur), big: true });
  totalsRows.push({ label: "المدفوع", value: fmtAmount(invoice.paidAmount, cur) });
  totalsRows.push({ label: "المتبقي", value: fmtAmount(invoice.dueAmount, cur) });

  return `
  <div class="print-doc a4">
    <div class="a4-head">
      <div class="a4-company">
        <div class="a4-logo">${esc(c.name.trim().charAt(0) || "م")}</div>
        <div>
          <div class="a4-company-name">${esc(c.name)}</div>
          <div class="a4-company-meta">
            ${c.phone ? `هاتف: ${esc(c.phone)}<br/>` : ""}
            ${c.address ? esc(c.address) : ""}
          </div>
        </div>
      </div>
      <div class="a4-invbox">
        <h2>فاتورة مبيعات</h2>
        <div class="rc-row"><span>الرقم</span><span class="rc-val">${esc(invoice.invoiceNo)}</span></div>
        <div class="rc-row"><span>التاريخ</span><span class="rc-val">${formatDateDisplay(invoice.issuedAt)}</span></div>
        <div class="rc-row"><span>الوقت</span><span class="rc-val">${formatTime12(invoice.createdAt)}</span></div>
        <div class="rc-row"><span>العملة</span><span class="rc-val">${esc(cur)}</span></div>
      </div>
    </div>

    <div class="a4-meta">
      <div>
        <b>العميل:</b> ${esc(invoice.customer?.name ?? "نقدي")}
        ${invoice.customer?.phone ? ` — ${esc(invoice.customer.phone)}` : ""}
      </div>
      <div>
        ${invoice.salesRepName ? `<b>المندوب:</b> ${esc(invoice.salesRepName)}` : ""}
        ${invoice.warehouseName ? ` &nbsp;|&nbsp; <b>المخزن:</b> ${esc(invoice.warehouseName)}` : ""}
      </div>
    </div>

    <table class="a4-items">
      <thead>
        <tr><th class="num">#</th><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الخصم</th><th>الإجمالي</th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>

    <div class="a4-bottom">
      <div class="a4-notes">
        ${
          invoice.notesPrinted
            ? `<b>ملاحظات:</b><br/>${esc(invoice.notesPrinted)}`
            : ""
        }
      </div>
      <div class="a4-totals">
        ${totalsRows
          .map(
            (r) =>
              `<div class="rc-row${r.big ? " rc-big" : ""}"><span>${r.label}</span><span class="rc-val">${r.value}</span></div>`
          )
          .join("")}
      </div>
    </div>

    <div class="a4-footer">
      ${c.footerText ? `${esc(c.footerText)} — ` : ""}طور بواسطة المُحاسِب الشخصي
    </div>
  </div>`;
}

// ═══════════════ نقطة الدخول ═══════════════

/**
 * طباعة فاتورة: إيصال حراري (58/80مم) أو قالب A4 حسب opts.template.
 * يعرض تقدمة عبر toast عند فشل فتح حوار الطباعة.
 */
export function printInvoice(invoice: InvoiceDetailDto, opts: PrintInvoiceOptions): void {
  try {
    document.getElementById("print-root")?.remove();
    const template = opts.template ?? "receipt";
    const paper = opts.paper ?? "80";

    const root = document.createElement("div");
    root.id = "print-root";
    root.dir = "rtl";
    root.innerHTML = template === "a4" ? a4Html(invoice, opts) : receiptHtml(invoice, opts);

    const style = document.createElement("style");
    style.textContent =
      template === "a4"
        ? "@page { size: A4; margin: 10mm; }"
        : `@page { size: ${paper}mm auto; margin: 2mm; }`;
    root.appendChild(style);

    document.body.appendChild(root);

    const clean = () => root.remove();
    window.addEventListener("afterprint", clean, { once: true });
    setTimeout(clean, 90_000); // شبكة أمان للتنظيف

    window.print();
    toast.success(`تم إرسال الفاتورة ${invoice.invoiceNo} للطباعة (${template === "a4" ? "A4" : `${paper}مم`})`);
  } catch {
    toast.error("تعذر فتح حوار الطباعة");
  }
}

// ═══════════════ مشتريات ومرتجعات (Task 3-a) ═══════════════

export type DocKind = "purchase" | "sale_return" | "purchase_return";

const DOC_TITLES: Record<DocKind, string> = {
  purchase: "فاتورة مشتريات",
  sale_return: "إشعار مرتجع بيع",
  purchase_return: "إشعار مرتجع شراء",
};

/** تنفيذ الطباعة المشترك: يبني #print-root ثم window.print() وينظف */
function runPrint(html: string, pageRule: string, successMsg: string): void {
  try {
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    root.dir = "rtl";
    root.innerHTML = html;

    const style = document.createElement("style");
    style.textContent = pageRule;
    root.appendChild(style);

    document.body.appendChild(root);
    const clean = () => root.remove();
    window.addEventListener("afterprint", clean, { once: true });
    setTimeout(clean, 90_000);
    window.print();
    toast.success(successMsg);
  } catch {
    toast.error("تعذر فتح حوار الطباعة");
  }
}

/**
 * طباعة مستند مشتريات/مرتجع (إيصال حراري 58/80مم) — Task 3-a.
 * فاتورة شراء/مرتجع بيع/مرتجع شراء بعنوان مناسب + المورد/العميل.
 */
export function printDocument(
  invoice: InvoiceDetailDto,
  kind: DocKind,
  opts: PrintInvoiceOptions
): void {
  const paper = opts.paper ?? "80";
  const width = paper === "58" ? "48mm" : "72mm";
  const c = opts.company;
  const cur = invoice.currencyCode;
  const title = DOC_TITLES[kind];
  const isReturn = kind !== "purchase";
  const partyLabel = kind === "sale_return" ? "العميل" : "المورد";
  const partyName =
    kind === "sale_return" ? invoice.customer?.name ?? "نقدي" : invoice.supplier?.name ?? "—";

  const meta: Array<[string, string]> = [
    ["رقم المستند", invoice.invoiceNo],
    ["التاريخ", formatDateDisplay(invoice.issuedAt)],
    ["الوقت", formatTime12(invoice.createdAt)],
    [partyLabel, partyName],
  ];
  if (invoice.warehouseName) meta.push(["المخزن", invoice.warehouseName]);

  const itemsRows = invoice.items
    .map(
      (it) => `
      <tr>
        <td>${esc(it.productName)}${it.unitName ? ` <span style="color:#444">(${esc(it.unitName)})</span>` : ""}</td>
        <td class="num">${fmtQty(it.qty)}</td>
        <td class="num">${fmtAmount(it.unitPrice, cur)}</td>
        <td class="num">${fmtAmount(it.lineTotal, cur)}</td>
      </tr>`
    )
    .join("");

  const totalsRows: Array<{ label: string; value: string; big?: boolean }> = [
    { label: "الإجمالي", value: fmtAmount(invoice.subtotal, cur) },
  ];
  if (invoice.discountAmount > 0) {
    totalsRows.push({ label: "الخصم", value: `− ${fmtAmount(invoice.discountAmount, cur)}` });
  }
  if (invoice.taxAmount > 0) {
    totalsRows.push({ label: `الضريبة (${invoice.taxRate}%)`, value: fmtAmount(invoice.taxAmount, cur) });
  }
  totalsRows.push({
    label: isReturn ? "إجمالي المسترد" : "الصافي",
    value: fmtAmount(invoice.total, cur),
    big: true,
  });
  if (invoice.paidAmount > 0) {
    totalsRows.push({
      label: kind === "sale_return" ? "المردود نقدياً" : "المدفوع نقدياً",
      value: fmtAmount(invoice.paidAmount, cur),
    });
  }
  if (invoice.dueAmount !== 0) {
    totalsRows.push({
      label: invoice.dueAmount < 0 ? "خصم من الحساب" : "المتبقي",
      value: fmtAmount(Math.abs(invoice.dueAmount), cur),
    });
  }

  const html = `
  <div class="print-doc rc" style="width:${width}">
    <div class="rc-logo">${esc(c.name.trim().charAt(0) || "م")}</div>
    <div class="rc-company">${esc(c.name)}</div>
    ${c.phone ? `<div class="rc-sub">هاتف: ${esc(c.phone)}</div>` : ""}
    ${c.address ? `<div class="rc-sub">${esc(c.address)}</div>` : ""}
    ${dash()}
    <div class="rc-company" style="font-size:12px">${title}</div>
    ${dash()}
    ${meta
      .map(([k, v]) => `<div class="rc-row"><span>${k}</span><span class="rc-val">${esc(v)}</span></div>`)
      .join("")}
    ${dash()}
    <table class="rc-items">
      <thead>
        <tr><th>الصنف</th><th class="num">كمية</th><th class="num">سعر</th><th class="num">إجمالي</th></tr>
      </thead>
      <tbody>${itemsRows}</tbody>
    </table>
    ${dash()}
    <div class="rc-totals">
      ${totalsRows
        .map(
          (r) =>
            `<div class="rc-row${r.big ? " rc-big" : ""}"><span>${r.label}</span><span class="rc-val">${r.value}</span></div>`
        )
        .join("")}
    </div>
    ${dash()}
    <div class="rc-barcodelike">*${esc(invoice.invoiceNo)}*</div>
    ${invoice.notesPrinted ? `${dash()}<div class="rc-sub" style="text-align:right">${esc(invoice.notesPrinted)}</div>` : ""}
    <div class="rc-footer">
      ${c.footerText ? `${esc(c.footerText)}<br/>` : ""}
      طور بواسطة المُحاسِب الشخصي
    </div>
  </div>`;

  runPrint(
    html,
    `@page { size: ${paper}mm auto; margin: 2mm; }`,
    `تم إرسال ${title} ${invoice.invoiceNo} للطباعة (${paper}مم)`
  );
}

/** ملصق باركود 58مم لصنف: المنشأة + اسم الصنف + أرقام EAN كبيرة + السعر. */
export function printBarcodeLabel(
  product: { name: string; barcode: string | null; price?: number; currencyCode?: string },
  opts: { company: PrintCompanyInfo }
): void {
  if (!product.barcode) {
    toast.error("لا يوجد باركود لهذا الصنف — ولّد باركوداً أولاً");
    return;
  }
  const digits = product.barcode.replace(/\D/g, "");
  const half = Math.ceil(digits.length / 2);
  const priceLine =
    product.price != null && product.currencyCode
      ? `<div class="rc-row"><span>السعر</span><span class="rc-val">${fmtAmount(product.price, product.currencyCode)}</span></div>`
      : "";

  const html = `
  <div class="print-doc rc" style="width:48mm">
    <div class="rc-sub" style="font-weight:700">${esc(opts.company.name)}</div>
    ${dash()}
    <div style="font-size:12px;font-weight:800;line-height:1.5;text-align:center">${esc(product.name)}</div>
    ${dash()}
    <div dir="ltr" style="text-align:center;font-family:'IBM Plex Sans Arabic',monospace;font-weight:700;font-size:18px;letter-spacing:3px;line-height:1.6">
      ${esc(digits.slice(0, half))}<br/>${esc(digits.slice(half))}
    </div>
    <div class="rc-barcodelike">||| || ||| ||| || |||| ||| |||</div>
    ${priceLine ? `${dash()}${priceLine}` : ""}
  </div>`;

  runPrint(html, "@page { size: 58mm auto; margin: 2mm; }", "تم إرسال ملصق الباركود للطباعة (58مم)");
}
