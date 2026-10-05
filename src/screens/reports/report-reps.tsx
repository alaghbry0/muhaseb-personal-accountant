"use client";

/**
 * أداء المناديب — FR-06-04: لكل مندوب (فواتير/مبيعات/مرتجعات/تحصيلات/
 * عمولات مستحقة ومصروفة) بنسبة العمولة + جدول مقارن + طباعة/CSV.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { getJson } from "@/lib/api";
import { AppHeader, EmptyState, SectionTitle, StatTile } from "@/components/ds";
import { PeriodPicker, makePeriodState, periodLabel, type PeriodState } from "@/components/reports/period-picker";
import { ReportTable, ReportToolbar } from "@/components/reports/report-table";
import { printReport } from "@/components/print/report-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { RepsReport } from "@/domain/reports";

const TYPE_LABELS: Record<string, string> = {
  sales: "نسبة من المبيعات",
  collection: "نسبة من التحصيل",
  both: "بيع + تحصيل",
};

export default function ReportRepsScreen() {
  const [period, setPeriod] = useState<PeriodState>(makePeriodState("month"));
  const { company, baseCurrency } = usePrintCompany();

  const url = `/api/reports/reps?from=${period.from}&to=${period.to}`;
  const { data, isLoading } = useQuery<RepsReport>({
    queryKey: ["reports", "reps", url],
    queryFn: () => getJson<RepsReport>(url),
  });

  const cur = data?.baseCurrency ?? baseCurrency;

  const doPrint = () => {
    if (!data) return;
    printReport({
      title: "تقرير أداء المناديب",
      company,
      currency: cur,
      periodLabel: periodLabel(period),
      columns: [
        { key: "name", label: "المندوب", fr: 1.4 },
        { key: "invoices", label: "فواتير", num: true },
        { key: "salesBase", label: "المبيعات", num: true },
        { key: "returnsBase", label: "المرتجعات", num: true },
        { key: "collectionsBase", label: "التحصيلات", num: true },
        { key: "commissionsEarned", label: "عمولات الفترة", num: true },
        { key: "commissionsDue", label: "مستحق الآن", num: true },
      ],
      rows: data.rows.map((r) => ({
        name: r.name,
        invoices: r.invoices,
        salesBase: r.salesBase,
        returnsBase: r.returnsBase,
        collectionsBase: r.collectionsBase,
        commissionsEarned: r.commissionsEarned,
        commissionsDue: r.commissionsDue,
      })),
      summary: [
        { label: "إجمالي المبيعات", value: data.totals.salesBase },
        { label: "إجمالي التحصيلات", value: data.totals.collectionsBase },
        { label: "عمولات مستحقة الآن (كل الفترات)", value: data.totals.commissionsDue, emphasis: true },
      ],
      footerNote: "التحصيلات = عمولات نوع collection (المبلغ الأساس للتحصيل)؛ العمولات المستحقة تشمل كل الفترات.",
    });
  };

  const csvRows = () =>
    (data?.rows ?? []).map((r) => ({
      المندوب: r.name,
      "نوع العمولة": TYPE_LABELS[r.commissionType] ?? r.commissionType,
      "النسبة %": r.commissionPercent,
      فواتير: r.invoices,
      المبيعات: r.salesBase,
      المرتجعات: r.returnsBase,
      التحصيلات: r.collectionsBase,
      "عمولات الفترة": r.commissionsEarned,
      "عمولات مصروفة": r.commissionsPaid,
      "مستحق الآن": r.commissionsDue,
    }));

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-8">
      <AppHeader
        title="أداء المناديب"
        action={
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#F472B6]/15 text-[#F472B6]">
            <Users className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="px-3 pb-3">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </AppHeader>

      {/* ─── الملخص ─── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile title="إجمالي مبيعات المناديب" amount={data?.totals.salesBase ?? 0} currency={cur} loading={isLoading} variant="primary" />
        <StatTile title="إجمالي التحصيلات" amount={data?.totals.collectionsBase ?? 0} currency={cur} loading={isLoading} variant="pos" />
        <StatTile title="عمولات مستحقة الآن" amount={data?.totals.commissionsDue ?? 0} currency={cur} loading={isLoading} variant="due" hint="كل الفترات" />
        <StatTile title="عمولات مصروفة بالفترة" amount={data?.totals.commissionsPaid ?? 0} currency={cur} loading={isLoading} variant="neutral" />
      </div>

      {/* ─── الجدول ─── */}
      <SectionTitle>التفاصيل</SectionTitle>
      {isLoading ? (
        <p className="py-8 text-center text-[13.5px] text-muted-foreground">جارٍ التحميل…</p>
      ) : (data?.rows?.length ?? 0) === 0 ? (
        <EmptyState icon={Users} message="لا مناديب" />
      ) : (
        <ReportTable
          columns={[
            { key: "name", label: "المندوب", fr: 1.4 },
            { key: "invoices", label: "فواتير", num: true, fr: 0.7 },
            { key: "salesBase", label: "المبيعات", num: true, fr: 1.1 },
            { key: "collectionsBase", label: "التحصيلات", num: true, fr: 1.1 },
            { key: "commissionsDue", label: "مستحق", num: true, fr: 0.9 },
          ]}
          amountKeys={["salesBase", "collectionsBase", "commissionsDue"]}
          rows={(data?.rows ?? []).map((r) => ({
            name: (
              <span className="flex flex-col">
                <span className="truncate font-medium">{r.name}</span>
                <span className="text-[11px] text-muted-foreground">
                  {TYPE_LABELS[r.commissionType] ?? r.commissionType} {r.commissionPercent}%
                </span>
              </span>
            ),
            invoices: r.invoices,
            salesBase: r.salesBase,
            collectionsBase: r.collectionsBase,
            commissionsDue: r.commissionsDue || "—",
          }))}
          maxH="max-h-[46vh]"
        />
      )}

      <ReportToolbar onPrint={doPrint} csvRows={csvRows} csvPrefix="reps" disabled={!data} />
    </div>
  );
}
