"use client";

/**
 * طباعة كشف الحساب — قالب A4 (FR-03-04): رأس منشأة + طرف + فترة
 * + رصيد أول الفترة + جدول (التاريخ/المستند/البيان/مدين/دائن/الرصيد) + إجماليات + توقيع.
 */
import "./print.css";
import { toast } from "sonner";
import { formatAmount, formatDate } from "@/lib/format";
import type { StatementResult } from "@/domain/parties";
import type { PrintCompanyInfo } from "./voucher-types";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statementHtml(st: StatementResult, company: PrintCompanyInfo, phone: string | null): string {
  const cur = st.baseCurrencyCode;
  const fmt = (n: number) =>
    n === 0 ? "—" : formatAmount(n, { currency: cur, parentheses: false });

  const rows = st.rows
    .map(
      (r) => `
      <tr>
        <td class="num">${r.date ? formatDate(r.date) : "—"}</td>
        <td>${esc(r.docNo ?? "—")}</td>
        <td>${esc(r.docLabel)}</td>
        <td class="num">${r.debit > 0 ? fmt(r.debit) : "—"}</td>
        <td class="num">${r.credit > 0 ? fmt(r.credit) : "—"}</td>
        <td class="num"><b>${fmt(r.balance)}</b></td>
      </tr>`
    )
    .join("");

  return `
  <div class="print-doc a4">
    <style>
      table.st-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4mm; }
      table.st-table th { background: #e8eef2; border: 1px solid #444; padding: 2mm 2.2mm; text-align: center; font-weight: 700; }
      table.st-table td { border: 1px solid #777; padding: 1.6mm 2.2mm; text-align: right; }
      table.st-table td.num { direction: ltr; text-align: left; white-space: nowrap; }
      .st-tfoot td { background: #f2f6f9; font-weight: 700; }
      .st-partybox { display: flex; gap: 8mm; font-size: 12px; margin-top: 4mm; }
      .st-partybox > div { border: 1px solid #555; border-radius: 2mm; padding: 2.5mm 4mm; flex: 1; }
    </style>
    <div class="a4-head">
      <div class="a4-company">
        <div class="a4-logo">${esc(company.name.trim().charAt(0) || "م")}</div>
        <div>
          <div class="a4-company-name">${esc(company.name)}</div>
          <div class="a4-company-meta">
            ${company.phone ? `هاتف: ${esc(company.phone)}<br/>` : ""}
            ${company.address ? esc(company.address) : ""}
          </div>
        </div>
      </div>
      <div class="a4-invbox">
        <h2>كشف حساب — ${st.partyType === "customer" ? "عميل" : "مورد"}</h2>
        <div class="rc-row"><span>الطرف</span><span class="rc-val">${esc(st.partyName)}</span></div>
        ${phone ? `<div class="rc-row"><span>الهاتف</span><span class="rc-val">${esc(phone)}</span></div>` : ""}
        <div class="rc-row"><span>الفترة</span><span class="rc-val">${st.from ? `${formatDate(st.from)} — ${formatDate(st.to)}` : `حتى ${formatDate(st.to)}`}</span></div>
        <div class="rc-row"><span>العملة</span><span class="rc-val">${esc(cur)}</span></div>
      </div>
    </div>

    <div class="st-partybox">
      <div>رصيد أول الفترة: <b>${formatAmount(st.openingBalance, { currency: cur })}</b></div>
      <div>عدد الحركات: <b>${st.transactionsCount}</b></div>
      <div>الرصيد الختامي: <b>${formatAmount(st.closingBalance, { currency: cur })}</b></div>
    </div>

    <table class="st-table">
      <thead>
        <tr>
          <th style="width:17mm">التاريخ</th>
          <th style="width:24mm">المستند</th>
          <th>البيان</th>
          <th style="width:24mm">مدين</th>
          <th style="width:24mm">دائن</th>
          <th style="width:26mm">الرصيد</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="st-tfoot">
          <td colspan="3">الإجماليات</td>
          <td class="num">${fmt(st.totals.debit)}</td>
          <td class="num">${fmt(st.totals.credit)}</td>
          <td class="num">${fmt(st.closingBalance)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="display:flex;justify-content:space-between;gap:10mm;margin-top:10mm;font-size:10.5px">
      <div style="flex:1;text-align:center;border-top:1px solid #000;padding-top:2mm">توقيع المسؤول</div>
      <div style="flex:1;text-align:center;border-top:1px solid #000;padding-top:2mm">توقيع ${st.partyType === "customer" ? "العميل" : "المورد"}</div>
    </div>

    <div class="a4-footer">
      ${company.footerText ? `${esc(company.footerText)} — ` : ""}طور بواسطة المُحاسِب الشخصي
    </div>
  </div>`;
}

export function printStatement(
  statement: StatementResult,
  company: PrintCompanyInfo,
  partyPhone?: string | null
): void {
  try {
    document.getElementById("print-root")?.remove();
    const root = document.createElement("div");
    root.id = "print-root";
    root.dir = "rtl";
    root.innerHTML = statementHtml(statement, company, partyPhone ?? null);

    const style = document.createElement("style");
    style.textContent = "@page { size: A4; margin: 10mm; }";
    root.appendChild(style);

    document.body.appendChild(root);
    const clean = () => root.remove();
    window.addEventListener("afterprint", clean, { once: true });
    setTimeout(clean, 90_000);

    window.print();
    toast.success("تم إرسال كشف الحساب للطباعة (A4)");
  } catch {
    toast.error("تعذر فتح حوار الطباعة");
  }
}
