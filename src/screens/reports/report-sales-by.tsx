"use client";

/**
 * المبيعات حسب — FR-09-06: رقائق البُعد (العميل/المندوب/الفئة/الصنف/اليوم)
 * + فترة + جدول (فواتير/إجمالي/اتجاه مقابل الفترة السابقة) + رسم أعلى 7 + طباعة/CSV.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { BarChart3 } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { AppHeader, AmountText, SectionTitle, StatTile, TrendBadge } from "@/components/ds";
import { PeriodPicker, makePeriodState, periodLabel, type PeriodState } from "@/components/reports/period-picker";
import { ReportTable, ReportToolbar } from "@/components/reports/report-table";
import { printReport } from "@/components/print/report-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { SalesByReport, SalesDimension } from "@/domain/reports";
import { cn } from "@/lib/utils";

const DIMS: Array<{ id: SalesDimension; label: string }> = [
  { id: "customer", label: "العميل" },
  { id: "rep", label: "المندوب" },
  { id: "category", label: "الفئة" },
  { id: "product", label: "الصنف" },
  { id: "day", label: "اليوم" },
];

export default function ReportSalesByScreen() {
  const [dimension, setDimension] = useState<SalesDimension>("customer");
  const [period, setPeriod] = useState<PeriodState>(makePeriodState("month"));
  const { company, baseCurrency } = usePrintCompany();

  const url = `/api/reports/sales-by?dimension=${dimension}&from=${period.from}&to=${period.to}`;
  const { data, isLoading } = useQuery<SalesByReport>({
    queryKey: ["reports", "sales-by", url],
    queryFn: () => getJson<SalesByReport>(url),
  });

  const cur = data?.baseCurrency ?? baseCurrency;

  const chartData = useMemo(
    () =>
      (data?.rows ?? []).slice(0, 7).map((r) => ({
        name: r.name.length > 10 ? `${r.name.slice(0, 10)}…` : r.name,
        المبيعات: Math.round(r.total),
      })),
    [data]
  );

  const doPrint = () => {
    if (!data) return;
    printReport({
      title: "تقرير المبيعات",
      subtitle: `حسب ${DIMS.find((d) => d.id === dimension)?.label ?? dimension}`,
      company,
      currency: cur,
      periodLabel: periodLabel(period),
      columns: [
        { key: "name", label: DIMS.find((d) => d.id === dimension)?.label ?? "البند" },
        { key: "invoices", label: "فواتير", num: true },
        ...(dimension === "product" || dimension === "category" ? [{ key: "qty", label: "كمية", num: true }] : []),
        { key: "total", label: `الإجمالي (${cur})`, num: true },
        { key: "prevTotal", label: `الفترة السابقة (${cur})`, num: true },
        { key: "changePct", label: "التغير %" },
      ],
      rows: data.rows.map((r) => ({
        name: r.name,
        invoices: r.invoices,
        ...(dimension === "product" || dimension === "category" ? { qty: r.qty } : {}),
        total: r.total,
        prevTotal: r.prevTotal,
        changePct: r.changePct == null ? "—" : `${r.changePct > 0 ? "+" : ""}${r.changePct}%`,
      })),
      summary: [
        { label: "عدد الفواتير", value: data.invoiceCount },
        { label: `إجمالي المبيعات (حسب ${DIMS.find((d) => d.id === dimension)?.label})`, value: data.total, emphasis: true },
      ],
    });
  };

  const csvRows = () =>
    (data?.rows ?? []).map((r) => ({
      الاسم: r.name,
      فواتير: r.invoices,
      الإجمالي: r.total,
      "الفترة السابقة": r.prevTotal,
      "التغير %": r.changePct ?? "—",
    }));

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-8">
      <AppHeader
        title="المبيعات حسب"
        action={
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <BarChart3 className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3">
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
            {DIMS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDimension(d.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                  dimension === d.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/70 text-muted-foreground hover:bg-accent/30"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </AppHeader>

      {/* ─── الملخص ─── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          title={`إجمالي المبيعات حسب ${DIMS.find((d) => d.id === dimension)?.label}`}
          amount={data?.total ?? 0}
          currency={cur}
          loading={isLoading}
          variant="primary"
          hint={`${data?.invoiceCount ?? 0} فاتورة بيع`}
        />
        <div className="flex flex-col items-start gap-1.5 rounded-2xl border border-border/60 bg-card p-4 text-start shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
          <span className="text-[13px] font-medium text-muted-foreground">الفترة السابقة</span>
          {isLoading ? (
            <span className="font-num text-2xl text-muted-foreground">…</span>
          ) : (
            <AmountText value={data?.prevTotal ?? 0} currency={cur} size="xl" variant="neutral" />
          )}
          {data?.changePct != null ? (
            <TrendBadge percent={data.changePct} />
          ) : (
            <span className="font-num text-xs text-muted-foreground">لا مقارنة</span>
          )}
        </div>
      </div>

      {/* ─── رسم أعلى 7 ─── */}
      {chartData.length > 0 && (
        <>
          <SectionTitle>الأعلى مبيعاً</SectionTitle>
          <div className="rounded-2xl border border-border/60 bg-card p-3">
            <div dir="ltr" className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={{ stroke: "#334155" }} tickLine={false} interval={0} angle={-18} dy={8} height={38} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94A3B8" }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 12, fontSize: 12, direction: "rtl" }}
                    labelStyle={{ color: "#F1F5F9", fontWeight: 700 }}
                    formatter={(value: number | string) => [formatAmount(Number(value)), "المبيعات"]}
                  />
                  <Bar dataKey="المبيعات" fill="#22D3EE" radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ─── الجدول ─── */}
      <SectionTitle>التفاصيل</SectionTitle>
      <ReportTable
        columns={[
          { key: "name", label: DIMS.find((d) => d.id === dimension)?.label ?? "البند", fr: 1.6 },
          { key: "invoices", label: "فواتير", num: true, fr: 0.7 },
          { key: "total", label: `الإجمالي`, num: true, fr: 1.2 },
          { key: "trend", label: "اتجاه", num: true, fr: 1 },
        ]}
        amountKeys={["total"]}
        rows={(data?.rows ?? []).map((r) => ({
          name: r.name,
          invoices: r.invoices,
          total: r.total,
          trend: r.changePct == null ? <span className="text-muted-foreground">—</span> : <TrendBadge percent={r.changePct} />,
        }))}
        maxH="max-h-[46vh]"
      />

      <ReportToolbar onPrint={doPrint} csvRows={csvRows} csvPrefix={`sales-by-${dimension}`} disabled={!data} />
    </div>
  );
}
