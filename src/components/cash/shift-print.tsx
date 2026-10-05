"use client";

/**
 * طباعة تقرير الوردية — إيصال حراري 58/80مم (المتوقع/الفعلي/الفرق + التصنيف).
 */
import "../print/print.css";
import { toast } from "sonner";
import { formatAmount, formatDateTime } from "@/lib/format";
import type { PrintCompanyInfo } from "@/components/print/voucher-types";
import type { CloseShiftResult } from "@/domain/cash";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function printShiftReport(res: CloseShiftResult, company: PrintCompanyInfo): void {
  try {
    document.getElementById("print-root")?.remove();
    const cur = res.currencyCode;
    const fmt = (n: number) => formatAmount(n, { currency: cur });
    const b = res.breakdown;
    const diffColor = Math.abs(res.difference) < 0.01 ? "#111" : res.difference > 0 ? "inherit" : "inherit";

    const lines: Array<[string, string]> = [
      ["مبيعات نقدية", fmt(b.cashSales)],
      ["تحصيلات (سندات/أقساط)", fmt(b.collections)],
      ["سحب بنكي/أخرى", fmt(b.otherIn)],
      ["تحويلات واردة", fmt(b.transfersIn)],
      ["مصاريف", `−${fmt(b.expenses)}`],
      ["صرف لموردين", `−${fmt(b.payments)}`],
      ["سحبيات موظفين", `−${fmt(b.advances)}`],
      ["عمولات مصروفة", `−${fmt(b.commissions)}`],
      ["رواتب", `−${fmt(b.salaries)}`],
      ["إيداعات بنكية", `−${fmt(b.bankDeposits)}`],
      ["تحويلات صادرة", `−${fmt(b.transfersOut)}`],
    ];

    const root = document.createElement("div");
    root.id = "print-root";
    root.dir = "rtl";
    root.innerHTML = `
    <div class="print-doc rc" style="width:72mm">
      <div class="rc-logo">${esc(company.name.trim().charAt(0) || "م")}</div>
      <div class="rc-company">${esc(company.name)}</div>
      ${company.phone ? `<div class="rc-sub">هاتف: ${esc(company.phone)}</div>` : ""}
      <div class="rc-dash"></div>
      <div style="text-align:center;font-size:14px;font-weight:800;border:0.4mm solid #000;border-radius:2mm;padding:1.4mm 0;margin-bottom:1.6mm">
        تقرير إقفال الوردية
      </div>
      <div class="rc-row"><span>الصندوق</span><span class="rc-val">${esc(res.cashboxName)}</span></div>
      <div class="rc-row"><span>الفتح</span><span class="rc-val" dir="ltr">${formatDateTime(res.openedAt)}</span></div>
      <div class="rc-row"><span>الإقفال</span><span class="rc-val" dir="ltr">${formatDateTime(res.closedAt)}</span></div>
      <div class="rc-dash"></div>
      ${lines.map(([k, v]) => `<div class="rc-row"><span>${k}</span><span class="rc-val" dir="ltr">${v}</span></div>`).join("")}
      <div class="rc-dash"></div>
      <div class="rc-totals">
        <div class="rc-row rc-big"><span>المتوقع (محسوب)</span><span class="rc-val" dir="ltr">${fmt(res.expected)}</span></div>
        <div class="rc-row rc-big"><span>العدّ الفعلي</span><span class="rc-val" dir="ltr">${fmt(res.counted)}</span></div>
        <div class="rc-row rc-big" style="color:${diffColor}">
          <span>الفرق</span>
          <span class="rc-val" dir="ltr">${res.difference >= 0 ? "+" : ""}${fmt(res.difference)}</span>
        </div>
      </div>
      <div class="rc-footer" style="margin-top:4mm">
        ${company.footerText ? `${esc(company.footerText)}<br/>` : ""}
        طور بواسطة المُحاسِب الشخصي
      </div>
    </div>`;

    const style = document.createElement("style");
    style.textContent = "@page { size: 80mm auto; margin: 2mm; }";
    root.appendChild(style);

    document.body.appendChild(root);
    const clean = () => root.remove();
    window.addEventListener("afterprint", clean, { once: true });
    setTimeout(clean, 90_000);

    window.print();
    toast.success("تم إرسال تقرير الوردية للطباعة");
  } catch {
    toast.error("تعذر فتح حوار الطباعة");
  }
}
