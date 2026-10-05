"use client";

/**
 * طباعة «مسير رواتب» A4 — جدول البنود + الإجماليات + خانات التوقيع (إعداد/مراجعة/اعتماد).
 * يبني #print-root مخفياً يظهر وحده في وضع الطباعة (نفس آلية Task 2 بلا تعديل ملفاته).
 */
import { toast } from "sonner";
import { formatAmount, formatDateDisplay, ARABIC_MONTHS } from "@/lib/format";

export interface PayrollPrintRow {
  employeeName: string;
  role: string | null;
  baseSalary: number;
  absentDays: number;
  absentDeduction: number;
  lateDeduction: number; // خصم التأخير والأنصاف
  bonus: number;
  otherDeduction: number;
  advancesDeducted: number;
  net: number;
}

export interface PayrollPrintOptions {
  company: { name: string; phone?: string | null };
  cashboxName: string;
  txDate: string;
  currency?: string;
}

function periodTitle(period: string): string {
  const [y, m] = period.split("-").map(Number)
  return `${ARABIC_MONTHS[m - 1] ?? m} ${y}`
}

export function printPayrollSheet(
  period: string,
  rows: PayrollPrintRow[],
  opts: PayrollPrintOptions
): void {
  const cur = opts.currency ?? "YER"
  const n = (v: number) => formatAmount(v, { decimals: 0, showSymbol: false })
  const money = (v: number) => `${formatAmount(v, { decimals: 0, showSymbol: false })} ${cur === "YER" ? "ر.ي" : cur}`
  const sum = (f: (r: PayrollPrintRow) => number) => rows.reduce((s, r) => s + f(r), 0)

  const bodyRows = rows
    .map(
      (r, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${r.employeeName}</td>
        <td class="c">${r.role ?? "—"}</td>
        <td class="n">${n(r.baseSalary)}</td>
        <td class="c">${r.absentDays}</td>
        <td class="n">${n(r.absentDeduction)}</td>
        <td class="n">${n(r.lateDeduction)}</td>
        <td class="n">${n(r.advancesDeducted)}</td>
        <td class="n">${n(r.bonus)}</td>
        <td class="n">${n(r.otherDeduction)}</td>
        <td class="n net">${n(r.net)}</td>
      </tr>`
    )
    .join("")

  const html = `
  <div class="print-doc" style="font-family:'Tajawal','IBM Plex Sans Arabic',sans-serif">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px double #000;padding-bottom:6px;margin-bottom:10px">
      <div>
        <div style="font-size:20px;font-weight:800">${opts.company.name}</div>
        ${opts.company.phone ? `<div style="font-size:12px">هاتف: ${opts.company.phone}</div>` : ""}
      </div>
      <div style="text-align:left">
        <div style="font-size:18px;font-weight:800">مسير رواتب — ${periodTitle(period)}</div>
        <div style="font-size:12px">تاريخ الصرف: ${formatDateDisplay(opts.txDate)} — من صندوق: ${opts.cashboxName}</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11.5px">
      <thead>
        <tr style="background:#e2e8f0">
          <th style="border:1px solid #000;padding:5px;width:24px">م</th>
          <th style="border:1px solid #000;padding:5px">الموظف</th>
          <th style="border:1px solid #000;padding:5px">الوظيفة</th>
          <th style="border:1px solid #000;padding:5px">الأساسي</th>
          <th style="border:1px solid #000;padding:5px;width:34px">أيام الغياب</th>
          <th style="border:1px solid #000;padding:5px">خصم الغياب</th>
          <th style="border:1px solid #000;padding:5px">خصم التأخير/النص</th>
          <th style="border:1px solid #000;padding:5px">السحبيات</th>
          <th style="border:1px solid #000;padding:5px">مكافآت</th>
          <th style="border:1px solid #000;padding:5px">خصومات أخرى</th>
          <th style="border:1px solid #000;padding:5px">الصافي</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
        <tr style="background:#f1f5f9;font-weight:800">
          <td colspan="3" style="border:1px solid #000;padding:5px;text-align:left">الإجمالي (${rows.length} موظفاً)</td>
          <td class="n" style="border:1px solid #000;padding:5px">${n(sum((r) => r.baseSalary))}</td>
          <td class="c" style="border:1px solid #000;padding:5px">${sum((r) => r.absentDays)}</td>
          <td class="n" style="border:1px solid #000;padding:5px">${n(sum((r) => r.absentDeduction))}</td>
          <td class="n" style="border:1px solid #000;padding:5px">${n(sum((r) => r.lateDeduction))}</td>
          <td class="n" style="border:1px solid #000;padding:5px">${n(sum((r) => r.advancesDeducted))}</td>
          <td class="n" style="border:1px solid #000;padding:5px">${n(sum((r) => r.bonus))}</td>
          <td class="n" style="border:1px solid #000;padding:5px">${n(sum((r) => r.otherDeduction))}</td>
          <td class="n" style="border:1px solid #000;padding:5px">${n(sum((r) => r.net))}</td>
        </tr>
      </tbody>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:13px;font-weight:700">
      <span>إجمالي المصروف من الصندوق: ${money(sum((r) => r.net))}</span>
      <span>عدد البنود: ${rows.length}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:38px;font-size:13px;text-align:center">
      <span style="flex:1;border-top:1px solid #000;padding-top:5px">إعداد</span>
      <span style="flex:1;border-top:1px solid #000;padding-top:5px">مراجعة</span>
      <span style="flex:1;border-top:1px solid #000;padding-top:5px">اعتماد المدير</span>
    </div>
    <div style="text-align:center;font-size:10px;color:#555;margin-top:14px">طور بواسطة المُحاسِب الشخصي</div>
  </div>`

  try {
    document.getElementById("print-root")?.remove()
    const root = document.createElement("div")
    root.id = "print-root"
    root.dir = "rtl"
    root.innerHTML = html
    const style = document.createElement("style")
    style.textContent = `@page { size: A4 landscape; margin: 10mm; }`
    root.appendChild(style)
    document.body.appendChild(root)
    const clean = () => root.remove()
    window.addEventListener("afterprint", clean, { once: true })
    setTimeout(clean, 90_000)
    window.print()
    toast.success("جاهز للطباعة — مسير الرواتب")
  } catch {
    toast.error("تعذر فتح حوار الطباعة")
  }
}
