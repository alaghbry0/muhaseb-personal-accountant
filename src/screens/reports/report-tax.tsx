"use client";

/**
 * تقرير الضريبة — FR-09-07: إجمالي مبيعات/مشتريات + محصّلة/مدخلة وصافيها
 * + المرتجعات — بفترة قابلة للتخصيص + طباعة/CSV.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Percent } from "lucide-react";
import { getJson } from "@/lib/api";
import { AppHeader, EmptyState, SectionTitle } from "@/components/ds";
import { PeriodPicker, makePeriodState, periodLabel, type PeriodState } from "@/components/reports/period-picker";
import { ReportTable, ReportToolbar } from "@/components/reports/report-table";
import { printReport } from "@/components/print/report-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { TaxReport } from "@/domain/reports";

export default function ReportTaxScreen() {
  const [period, setPeriod] = useState<PeriodState>(makePeriodState("month"));
  const { company, baseCurrency } = usePrintCompany();

  const url = `/api/reports/tax?from=${period.from}&to=${period.to}`;
  const { data, isLoading } = useQuery<TaxReport>({
    queryKey: ["reports", "tax", url],
    queryFn: () => getJson<TaxReport>(url),
  });

  const cur = data?.baseCurrency ?? baseCurrency;

  const doPrint = () => {
    if (!data) return;
    printReport({
      title: "تقرير الضريبة",
      company,
      currency: cur,
      periodLabel: periodLabel(period),
      columns: [
        { key: "item", label: "البند", fr: 1.6 },
        { key: "count", label: "عدد", num: true },
        { key: "total", label: `الإجمالي (${cur})`, num: true },
        { key: "tax", label: `الضريبة (${cur})`, num: true },
      ],
      rows: [
        { item: "المبيعات", count: data.sales.count, total: data.sales.totalBase, tax: data.sales.tax },
        { item: "المشتريات", count: data.purchases.count, total: data.purchases.totalBase, tax: data.purchases.tax },
        { item: "مرتجعات المبيعات", count: "—", total: data.returns.salesReturnsBase, tax: 0 },
        { item: "مرتجعات المشتريات", count: "—", total: data.returns.purchaseReturnsBase, tax: 0 },
      ],
      summary: [
        { label: "الضريبة المحصّلة (مبيعات)", value: data.sales.tax },
        { label: "الضريبة المدخلة (مشتريات)", value: data.purchases.tax },
        { label: "الصافي المستحق للسلطة", value: data.netTax, emphasis: true },
      ],
      footerNote: "اليمن حالياً بلا ضريبة قيمة مضافة — يُستخدم هذا التقرير أساساً لأي تسجيل ضريبي مستقبلي أو نسب اتفاقية.",
    });
  };

  const csvRows = () => [
    { البند: "المبيعات", العدد: data?.sales.count ?? 0, "الإجمالي بالأساس": data?.sales.totalBase ?? 0, "الضريبة": data?.sales.tax ?? 0 },
    { البند: "المشتريات", العدد: data?.purchases.count ?? 0, "الإجمالي بالأساس": data?.purchases.totalBase ?? 0, "الضريبة": data?.purchases.tax ?? 0 },
    { البند: "مرتجعات المبيعات", العدد: "", "الإجمالي بالأساس": data?.returns.salesReturnsBase ?? 0, "الضريبة": 0 },
    { البند: "مرتجعات المشتريات", العدد: "", "الإجمالي بالأساس": data?.returns.purchaseReturnsBase ?? 0, "الضريبة": 0 },
    { البند: "الصافي", العدد: "", "الإجمالي بالأساس": "", "الضريبة": data?.netTax ?? 0 },
  ];

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-8">
      <AppHeader
        title="تقرير الضريبة"
        action={
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#A78BFA]/15 text-[#A78BFA]">
            <Percent className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="px-3 pb-3">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </AppHeader>

      {isLoading ? (
        <p className="py-8 text-center text-[13.5px] text-muted-foreground">جارٍ التحميل…</p>
      ) : !data ? (
        <EmptyState icon={Percent} message="تعذر توليد التقرير" />
      ) : (
        <>
          <SectionTitle>الملخص</SectionTitle>
          <ReportTable
            columns={[
              { key: "item", label: "البند", fr: 1.6 },
              { key: "count", label: "عدد", num: true, fr: 0.6 },
              { key: "total", label: `الإجمالي (${cur})`, num: true, fr: 1.2 },
              { key: "tax", label: `الضريبة (${cur})`, num: true, fr: 1 },
            ]}
            amountKeys={["total", "tax"]}
            rows={[
              { item: "المبيعات", count: data.sales.count, total: data.sales.totalBase, tax: data.sales.tax },
              { item: "المشتريات", count: data.purchases.count, total: data.purchases.totalBase, tax: data.purchases.tax },
              { item: "مرتجعات المبيعات", count: "—", total: data.returns.salesReturnsBase, tax: "—" },
              { item: "مرتجعات المشتريات", count: "—", total: data.returns.purchaseReturnsBase, tax: "—" },
            ]}
            maxH="max-h-none"
          />

          <div className="flex items-center justify-between rounded-2xl border border-[#A78BFA]/40 bg-[#A78BFA]/10 p-4">
            <span className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-bold text-foreground">صافي الضريبة (محصّلة − مدخلة)</span>
              <span className="font-num text-[12px] text-muted-foreground">
                محصّلة {formatTax(data.sales.tax)} • مدخلة {formatTax(data.purchases.tax)}
              </span>
            </span>
            <span dir="ltr" className="font-num text-[22px] font-extrabold text-[#A78BFA]">
              {formatTax(data.netTax)}
            </span>
          </div>

          <p className="rounded-xl border border-border/60 bg-card p-3.5 text-[12.5px] leading-relaxed text-muted-foreground">
            اليمن حالياً بلا ضريبة قيمة مضافة على هذه العمليات؛ يُستخدم التقرير أساساً لأي تسجيل ضريبي مستقبلي أو نسب
            اتفاقية مع الموردين. الفواتير المخزنة تحمل taxAmount بعملتها وتحوَّل للأساس بأسعار تاريخ الإصدار.
          </p>
        </>
      )}

      <ReportToolbar onPrint={doPrint} csvRows={csvRows} csvPrefix="tax" disabled={!data} />
    </div>
  );
}

function formatTax(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}
