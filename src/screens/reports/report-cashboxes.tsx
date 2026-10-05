"use client";

/**
 * تقرير الصناديق — FR-09-08: لكل صندوق (افتتاحي/وارد/صادر/ختامي) بعملته
 * + إجماليات بالعملة الأساسية + عدد الحركات + طباعة/CSV.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { AppHeader, AmountText, EmptyState, SectionTitle } from "@/components/ds";
import { PeriodPicker, makePeriodState, periodLabel, type PeriodState } from "@/components/reports/period-picker";
import { ReportTable, ReportToolbar } from "@/components/reports/report-table";
import { printReport } from "@/components/print/report-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { CashboxesReport } from "@/domain/reports";

export default function ReportCashboxesScreen() {
  const [period, setPeriod] = useState<PeriodState>(makePeriodState("month"));
  const { company, baseCurrency } = usePrintCompany();

  const url = `/api/reports/cashboxes?from=${period.from}&to=${period.to}`;
  const { data, isLoading } = useQuery<CashboxesReport>({
    queryKey: ["reports", "cashboxes", url],
    queryFn: () => getJson<CashboxesReport>(url),
  });

  const cur = baseCurrency;

  const doPrint = () => {
    if (!data) return;
    printReport({
      title: "تقرير الصناديق",
      company,
      periodLabel: periodLabel(period),
      columns: [
        { key: "name", label: "الصندوق", fr: 1.5 },
        { key: "currencyCode", label: "العملة" },
        { key: "opening", label: "افتتاحي", num: true },
        { key: "in", label: "وارد", num: true },
        { key: "out", label: "صادر", num: true },
        { key: "closing", label: "ختامي", num: true },
        { key: "txCount", label: "حركات", num: true },
      ],
      rows: data.rows.map((r) => ({
        name: r.name,
        currencyCode: r.currencyCode,
        opening: `${formatAmount(r.opening, { currency: r.currencyCode, showSymbol: false })} ${r.currencyCode}`,
        in: formatAmount(r.in, { currency: r.currencyCode, showSymbol: false }),
        out: formatAmount(r.out, { currency: r.currencyCode, showSymbol: false }),
        closing: formatAmount(r.closing, { currency: r.currencyCode, showSymbol: false }),
        txCount: r.txCount,
      })),
      summary: [
        { label: `إجمالي الوارد (${cur})`, value: data.totalsBase.in },
        { label: `إجمالي الصادر (${cur})`, value: data.totalsBase.out },
        { label: `الختامي المحوّل (${cur})`, value: data.totalsBase.closing, emphasis: true },
      ],
      footerNote: "كل صندوق بعملته؛ الإجماليات محوّلة للعملة الأساسية بأسعار الفترة الحالية.",
    });
  };

  const csvRows = () =>
    (data?.rows ?? []).map((r) => ({
      الصندوق: r.name,
      العملة: r.currencyCode,
      الافتتاحي: r.opening,
      الوارد: r.in,
      الصادر: r.out,
      الختامي: r.closing,
      الحركات: r.txCount,
    }));

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-8">
      <AppHeader
        title="تقرير الصناديق"
        action={
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Wallet className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="px-3 pb-3">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </AppHeader>

      {isLoading ? (
        <p className="py-8 text-center text-[13.5px] text-muted-foreground">جارٍ التحميل…</p>
      ) : (data?.rows?.length ?? 0) === 0 ? (
        <EmptyState icon={Wallet} message="لا صناديق" />
      ) : (
        <>
          {/* بطاقة لكل صندوق */}
          {(data?.rows ?? []).map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2.5">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Wallet className="size-5" aria-hidden />
                  </span>
                  <span className="text-[15px] font-bold text-foreground">{r.name}</span>
                </span>
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-num text-[11.5px] font-bold text-primary">
                  {r.currencyCode}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <div className="flex flex-col gap-0.5 rounded-xl bg-muted/40 p-2">
                  <span className="text-[11px] text-muted-foreground">افتتاحي</span>
                  <AmountText value={r.opening} currency={r.currencyCode} size="sm" variant="neutral" />
                </div>
                <div className="flex flex-col gap-0.5 rounded-xl bg-[#34D399]/10 p-2">
                  <span className="flex items-center justify-center gap-1 text-[11px] text-[#34D399]">
                    <ArrowDownLeft className="size-3" aria-hidden /> وارد
                  </span>
                  <AmountText value={r.in} currency={r.currencyCode} size="sm" variant="pos" />
                </div>
                <div className="flex flex-col gap-0.5 rounded-xl bg-[#F87171]/10 p-2">
                  <span className="flex items-center justify-center gap-1 text-[11px] text-[#F87171]">
                    <ArrowUpRight className="size-3" aria-hidden /> صادر
                  </span>
                  <AmountText value={r.out} currency={r.currencyCode} size="sm" variant="neg" />
                </div>
                <div className="flex flex-col gap-0.5 rounded-xl bg-primary/10 p-2">
                  <span className="text-[11px] text-primary">ختامي</span>
                  <AmountText value={r.closing} currency={r.currencyCode} size="sm" variant="primary" />
                </div>
              </div>
              <span className="mt-2 block text-[11.5px] text-muted-foreground">{r.txCount} حركة في الفترة</span>
            </div>
          ))}

          {/* الإجماليات بالأساس */}
          <SectionTitle>الإجماليات بالعملة الأساسية ({cur})</SectionTitle>
          <ReportTable
            columns={[
              { key: "label", label: "البند", fr: 1.6 },
              { key: "value", label: `المبلغ (${cur})`, num: true },
            ]}
            amountKeys={["value"]}
            rows={[
              { label: "إجمالي الافتتاحي", value: data!.totalsBase.opening },
              { label: "إجمالي الوارد", value: data!.totalsBase.in },
              { label: "إجمالي الصادر", value: data!.totalsBase.out },
              { label: "إجمالي الختامي", value: data!.totalsBase.closing },
            ]}
            maxH="max-h-none"
          />
        </>
      )}

      <ReportToolbar onPrint={doPrint} csvRows={csvRows} csvPrefix="cashboxes" disabled={!data} />
    </div>
  );
}
