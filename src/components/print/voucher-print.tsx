"use client";

/**
 * طباعة السندات — سند قبض / سند صرف (قالب إيصال 80مم مع توقيعات).
 * يُبنى DOM مخفي #print-root (نفس بنية receipt-print) ثم window.print().
 */
import "./print.css";
import { toast } from "sonner";
import { formatAmount, formatDateDisplay } from "@/lib/format";
import { tafqeet } from "@/lib/tafqeet";
import type { VoucherDto, PrintCompanyInfo } from "./voucher-types";

/** بنية السند للطباعة — إما VoucherDto من الـ API أو بيانات مبسطة عند إعادة الطباعة */
export type PrintableVoucher = Pick<
  VoucherDto,
  "number" | "kind" | "partyName" | "amount" | "currencyCode" | "txDate" | "description"
> & { partyPhone?: string | null };

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function voucherHtml(v: PrintableVoucher, company: PrintCompanyInfo): string {
  const isReceipt = v.kind === "receipt";
  const title = isReceipt ? "سند قبض" : "سند صرف";
  const cur = v.currencyCode;

  const meta: Array<[string, string]> = [
    ["رقم السند", v.number],
    ["التاريخ", formatDateDisplay(v.txDate)],
    [isReceipt ? "استلمنا من" : "صرفنا إلى", esc(v.partyName)],
  ];
  if (v.partyPhone) meta.push(["الهاتف", esc(v.partyPhone)]);

  const unitName = cur === "SAR" ? "ريال سعودي" : cur === "USD" ? "دولار" : "ريال";

  return `
  <div class="print-doc rc" style="width:72mm">
    <div class="rc-logo">${esc(company.name.trim().charAt(0) || "م")}</div>
    <div class="rc-company">${esc(company.name)}</div>
    ${company.phone ? `<div class="rc-sub">هاتف: ${esc(company.phone)}</div>` : ""}
    ${company.address ? `<div class="rc-sub">${esc(company.address)}</div>` : ""}
    <div class="rc-dash"></div>
    <div style="text-align:center;font-size:15px;font-weight:800;border:0.4mm solid #000;border-radius:2mm;padding:1.6mm 0;margin-bottom:1.6mm">
      ${title}
    </div>
    ${meta
      .map(
        ([k, val]) =>
          `<div class="rc-row"><span>${k}</span><span class="rc-val">${val}</span></div>`
      )
      .join("")}
    <div class="rc-dash"></div>
    <div class="rc-totals">
      <div class="rc-row"><span>المبلغ</span><span class="rc-val">${formatAmount(v.amount, { currency: cur })}</span></div>
      <div class="rc-row rc-big"><span>${isReceipt ? "وقد استلمت مبلغاً وقدره" : "وقد صُرف مبلغ وقدره"}</span><span></span></div>
    </div>
    <div style="text-align:center;font-size:10.5px;font-weight:700;line-height:1.7;margin:1.2mm 0">
      ${esc(tafqeet(v.amount, unitName))}
    </div>
    <div class="rc-dash"></div>
    ${
      v.description
        ? `<div class="rc-row"><span>البيان</span><span class="rc-val" style="text-align:left">${esc(v.description)}</span></div>
           <div class="rc-dash"></div>`
        : ""
    }
    <div style="display:flex;justify-content:space-between;gap:6mm;margin-top:6mm">
      <div style="flex:1;text-align:center;font-size:10px">
        <div style="border-top:0.35mm solid #000;padding-top:1.4mm;margin-top:8mm">توقيع ${isReceipt ? "المستلم" : "المسلم"}</div>
      </div>
      <div style="flex:1;text-align:center;font-size:10px">
        <div style="border-top:0.35mm solid #000;padding-top:1.4mm;margin-top:8mm">توقيع ${isReceipt ? "المسلِّم" : "المستفيد"}</div>
      </div>
    </div>
    <div class="rc-footer" style="margin-top:4mm">
      ${company.footerText ? `${esc(company.footerText)}<br/>` : ""}
      طور بواسطة المُحاسِب الشخصي
    </div>
  </div>`;
}

/** طباعة سند قبض/صرف */
export function printVoucher(voucher: PrintableVoucher, company: PrintCompanyInfo): void {
  try {
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    root.dir = "rtl";
    root.innerHTML = voucherHtml(voucher, company);

    const style = document.createElement("style");
    style.textContent = "@page { size: 80mm auto; margin: 2mm; }";
    root.appendChild(style);

    document.body.appendChild(root);
    const clean = () => root.remove();
    window.addEventListener("afterprint", clean, { once: true });
    setTimeout(clean, 90_000);

    window.print();
    toast.success(`تم إرسال ${voucher.kind === "receipt" ? "سند القبض" : "سند الصرف"} ${voucher.number} للطباعة`);
  } catch {
    toast.error("تعذر فتح حوار الطباعة");
  }
}
