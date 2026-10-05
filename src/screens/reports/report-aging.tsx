"use client";

/**
 * أعمار الديون — FR-09-05: بطاقات الأوعية (0–30/31–60/61–90/+90/غير مصنّف)
 * + صفوف العملاء بمبالغ كل وعاء والرصيد الكلي + تلميحات الأقساط المتأخرة + طباعة/CSV.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock4 } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDateDisplay } from "@/lib/format";
import { AppHeader, AmountText, EmptyState, SectionTitle } from "@/components/ds";
import { ReportTable, ReportToolbar } from "@/components/reports/report-table";
import { printReport } from "@/components/print/report-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { AgingReport, AgingBucketId } from "@/domain/reports";
import { cn } from "@/lib/utils";

const BUCKET_META: Array<{ id: AgingBucketId; label: string; color: string; bg: string }> = [
  { id: "d30", label: "0–30 يوم", color: "#34D399", bg: "bg-[#34D399]/10" },
  { id: "d60", label: "31–60 يوم", color: "#FBBF24", bg: "bg-[#FBBF24]/10" },
  { id: "d90", label: "61–90 يوم", color: "#FB923C", bg: "bg-[#FB923C]/10" },
  { id: "d90p", label: "أكثر من 90", color: "#F87171", bg: "bg-[#F87171]/10" },
  { id: "other", label: "غير مصنّف", color: "#94A3B8", bg: "bg-muted" },
];

export default function ReportAgingScreen() {
  const { company, baseCurrency } = usePrintCompany();
  const [bucketFilter, setBucketFilter] = useState<AgingBucketId | null>(null);

  const { data, isLoading } = useQuery<AgingReport>({
    queryKey: ["reports", "aging"],
    queryFn: () => getJson<AgingReport>("/api/reports/aging"),
  });

  const cur = data?.baseCurrency ?? baseCurrency;
  const rows = (data?.rows ?? []).filter((r) => (bucketFilter ? Math.abs(r.buckets[bucketFilter]) > 0.005 : Math.abs(r.balance) > 0.005 || Object.values(r.buckets).some((v) => Math.abs(v) > 0.005)));

  const doPrint = () => {
    if (!data) return;
    printReport({
      title: "أعمار الديون (العملاء)",
      company,
      currency: cur,
      periodLabel: `حتى ${formatDateDisplay(data.asOf)}`,
      columns: [
        { key: "name", label: "العميل", fr: 1.6 },
        { key: "d30", label: "0–30", num: true },
        { key: "d60", label: "31–60", num: true },
        { key: "d90", label: "61–90", num: true },
        { key: "d90p", label: "+90", num: true },
        { key: "other", label: "غير مصنّف", num: true },
        { key: "balance", label: "الرصيد", num: true },
      ],
      rows: data.rows
        .filter((r) => r.balance > 0.01)
        .map((r) => ({
          name: r.name,
          d30: r.buckets.d30,
          d60: r.buckets.d60,
          d90: r.buckets.d90,
          d90p: r.buckets.d90p,
          other: r.buckets.other,
          balance: r.balance,
        })),
      summary: BUCKET_META.map((b) => ({ label: `إجمالي ${b.label}`, value: data.totals[b.id] })).concat([
        { label: "إجمالي المديونية", value: data.totalBalance, emphasis: true },
      ]),
      footerNote: "التحصيلات تُطبَّق على أقدم الديون (FIFO)؛ «غير مصنّف» = أرصدة افتتاحية وخطط مستقلة غير مؤرخة بفواتير.",
    });
  };

  const csvRows = () =>
    (data?.rows ?? [])
      .filter((r) => r.balance > 0.01)
      .map((r) => ({
        العميل: r.name,
        "0-30": r.buckets.d30,
        "31-60": r.buckets.d60,
        "61-90": r.buckets.d90,
        "+90": r.buckets.d90p,
        "غير مصنف": r.buckets.other,
        الرصيد: r.balance,
      }));

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-8">
      <AppHeader
        title="أعمار الديون"
        action={
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#FBBF24]/15 text-[#FBBF24]">
            <Clock4 className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="px-3 pb-3">
          <p className="text-[12.5px] text-muted-foreground">
            أرصدة العملاء موزعة حسب عمر الدين — حتى {formatDateDisplay(data?.asOf ?? new Date())}
          </p>
        </div>
      </AppHeader>

      {/* ─── بطاقات الأوعية ─── */}
      <div className="grid grid-cols-2 gap-2.5">
        {BUCKET_META.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBucketFilter(bucketFilter === b.id ? null : b.id)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-2xl border p-4 text-start shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-colors active:scale-[0.99]",
              bucketFilter === b.id ? "border-primary bg-primary/10" : `border-border/60 ${b.bg}`
            )}
            aria-pressed={bucketFilter === b.id}
          >
            <span className="text-[12.5px] font-bold" style={{ color: b.color }}>
              {b.label}
            </span>
            <AmountText value={data?.totals[b.id] ?? 0} currency={cur} size="lg" variant="neutral" />
          </button>
        ))}
      </div>

      {/* الإجمالي + عدد المدينين */}
      <div className="flex items-center justify-between rounded-2xl border border-primary/40 bg-primary/10 p-4">
        <span className="flex flex-col gap-0.5">
          <span className="text-[13px] font-bold text-foreground">إجمالي المديونية</span>
          <span className="font-num text-[12px] text-muted-foreground">
            {data?.debtorsCount ?? 0} عميل مدين
          </span>
        </span>
        <AmountText value={data?.totalBalance ?? 0} currency={cur} size="2xl" variant="primary" />
      </div>

      {/* ─── الصفوف ─── */}
      <SectionTitle>
        العملاء {bucketFilter ? <span className="text-[12px] font-normal text-muted-foreground">(مفلتر على وعاء)</span> : null}
      </SectionTitle>
      {isLoading ? (
        <p className="py-8 text-center text-[13.5px] text-muted-foreground">جارٍ التحميل…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Clock4} message="لا مديونيات" hint="كل العملاء مسدّدون 🎉" />
      ) : (
        <ReportTable
          columns={[
            { key: "name", label: "العميل", fr: 1.5 },
            { key: "d30", label: "0-30", num: true },
            { key: "d60", label: "31-60", num: true },
            { key: "d90p", label: "+90", num: true },
            { key: "balance", label: "الرصيد", num: true },
          ]}
          amountKeys={["d30", "d60", "d90p", "balance"]}
          rows={rows.map((r) => ({
            name: (
              <span className="flex flex-col">
                <span className="truncate font-medium">{r.name}</span>
                {r.oldestDate && <span className="font-num text-[11px] text-muted-foreground">أقدم دين {formatDateDisplay(r.oldestDate)}</span>}
              </span>
            ),
            d30: r.buckets.d30 || "—",
            d60: r.buckets.d60 || "—",
            d90p: r.buckets.d90p || "—",
            balance: r.balance,
          }))}
          maxH="max-h-[46vh]"
        />
      )}

      <ReportToolbar onPrint={doPrint} csvRows={csvRows} csvPrefix="aging" disabled={!data} />
    </div>
  );
}
