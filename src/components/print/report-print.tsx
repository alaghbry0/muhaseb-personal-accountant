"use client";

/**
 * قالب طباعة موحد للتقارير (A4 عربي) — FR-09-10.
 * رأس: المنشأة + عنوان التقرير + الفترة؛ جدول أعمدة؛ ملخص؛ تذييل بتاريخ التوليد.
 * تُستخدم من كل شاشات التقارير عبر printReport(...).
 */
import "./print.css";
import { toast } from "sonner";
import { formatAmount, formatDate } from "@/lib/format";
import type { PrintCompanyInfo } from "./voucher-types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ReportColumn {
  key: string;
  label: string;
  /** محاذاة رقمية (ltr) */
  num?: boolean;
  width?: string;
}

export interface PrintReportOptions {
  title: string;
  subtitle?: string;
  periodLabel?: string;
  company: PrintCompanyInfo;
  currency?: string;
  columns: ReportColumn[];
  rows: Array<Record<string, string | number | null | undefined>>;
  /** صفوف الملخص أسفل الجدول (قبل الإجمالي) */
  summary?: Array<{ label: string; value: string | number; emphasis?: boolean }>;
  footerNote?: string;
  generatedAt?: Date;
}

function cellText(v: string | number | null | undefined, num: boolean, currency?: string): string {
  if (v == null) return "—";
  if (typeof v === "number") {
    return formatAmount(v, { currency: num ? currency : undefined, parentheses: false });
  }
  return esc(v);
}

function reportHtml(o: PrintReportOptions): string {
  const generated = `تاريخ التوليد: ${formatDate(o.generatedAt ?? new Date())}`;
  const rowsHtml = o.rows.length
    ? o.rows
        .map(
          (r) => `
      <tr>
        ${o.columns
          .map(
            (c) =>
              `<td${c.num ? ' class="num"' : ""}>${cellText(r[c.key], !!c.num, o.currency)}</td>`
          )
          .join("")}
      </tr>`
        )
        .join("")
    : `<tr><td colspan="${o.columns.length}" style="text-align:center;color:#555">لا توجد بيانات لهذه الفترة</td></tr>`;

  const summaryHtml = (o.summary ?? [])
    .map(
      (s) => `
      <tr class="rp-sum${
        s.emphasis ? " rp-emph" : ""
      }"><td colspan="${Math.max(1, o.columns.length - 1)}">${esc(s.label)}</td><td class="num">${
        typeof s.value === "number"
          ? formatAmount(s.value, { currency: o.currency, parentheses: false })
          : esc(s.value)
      }</td></tr>`
    )
    .join("");

  return `
  <div class="print-doc a4">
    <style>
      table.rp-table { width: 100%; border-collapse: collapse; font-size: 10.8px; margin-top: 4mm; }
      table.rp-table th { background: #e8eef2; border: 1px solid #444; padding: 1.8mm 2mm; text-align: center; font-weight: 700; }
      table.rp-table td { border: 1px solid #777; padding: 1.4mm 2mm; text-align: right; }
      table.rp-table td.num { direction: ltr; text-align: left; white-space: nowrap; }
      tr.rp-sum td { background: #f2f6f9; font-weight: 700; }
      tr.rp-emph td { background: #dceef5; font-weight: 800; font-size: 12px; }
    </style>
    <div class="a4-head">
      <div class="a4-company">
        <div class="a4-logo">${esc(o.company.name.trim().charAt(0) || "م")}</div>
        <div>
          <div class="a4-company-name">${esc(o.company.name)}</div>
          <div class="a4-company-meta">
            ${o.company.phone ? `هاتف: ${esc(o.company.phone)}<br/>` : ""}
            ${o.company.address ? esc(o.company.address) : ""}
          </div>
        </div>
      </div>
      <div class="a4-invbox">
        <h2>${esc(o.title)}</h2>
        ${o.subtitle ? `<div class="rc-row"><span>الوصف</span><span class="rc-val">${esc(o.subtitle)}</span></div>` : ""}
        ${o.periodLabel ? `<div class="rc-row"><span>الفترة</span><span class="rc-val" dir="ltr">${o.periodLabel}</span></div>` : ""}
        ${o.currency ? `<div class="rc-row"><span>العملة</span><span class="rc-val">${esc(o.currency)}</span></div>` : ""}
      </div>
    </div>

    <table class="rp-table">
      <thead>
        <tr>
          ${o.columns.map((c) => `<th${c.width ? ` style="width:${c.width}"` : ""}>${esc(c.label)}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        ${summaryHtml}
      </tbody>
    </table>

    ${o.footerNote ? `<div style="font-size:10.5px;margin-top:4mm">${esc(o.footerNote)}</div>` : ""}
    <div class="a4-footer">
      ${generated} — ${o.company.footerText ? `${esc(o.company.footerText)} — ` : ""}طور بواسطة المُحاسِب الشخصي
    </div>
  </div>`;
}

/** طباعة تقرير A4 */
export function printReport(o: PrintReportOptions): void {
  try {
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    root.dir = "rtl";
    root.innerHTML = reportHtml(o);

    const style = document.createElement("style");
    style.textContent = "@page { size: A4; margin: 10mm; }";
    root.appendChild(style);

    document.body.appendChild(root);
    const clean = () => root.remove();
    window.addEventListener("afterprint", clean, { once: true });
    setTimeout(clean, 90_000);

    window.print();
    toast.success(`تم إرسال «${o.title}» للطباعة (A4)`);
  } catch {
    toast.error("تعذر فتح حوار الطباعة");
  }
}
