"use client";

/**
 * تقرير المصروفات — FR-09-08: فترة + إجمالي مع مقارنة + جدول الفئات
 * (النسبة/العدد) + سلسلة يومية + قائمة الحركات + طباعة/CSV.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { Receipt } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDate } from "@/lib/format";
import { AppHeader, AmountText, SectionTitle, StatTile, TrendBadge } from "@/components/ds";
import { PeriodPicker, makePeriodState, periodLabel, type PeriodState } from "@/components/reports/period-picker";
import { ReportTable, ReportToolbar } from "@/components/reports/report-table";
import { printReport } from "@/components/print/report-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { ExpensesReport } from "@/domain/reports";

export default function ReportExpensesScreen() {
  const [period, setPeriod] = useState<PeriodState>(makePeriodState("month"));
  const { company, baseCurrency } = usePrintCompany();

  const url = `/api/reports/expenses?from=${period.from}&to=${period.to}`;
  const { data, isLoading } = useQuery<ExpensesReport>({
    queryKey: ["reports", "expenses", url],
    queryFn: () => getJson<ExpensesReport>(url),
  });

  const cur = data?.baseCurrency ?? baseCurrency;

  const chartData = useMemo(
    () =>
      (data?.series ?? []).map((s) => ({
        name: s.label,
        المصروفات: Math.round(s.total),
      })),
    [data]
  );

  const doPrint = () => {
    if (!data) return;
    printReport({
      title: "تقرير المصروفات",
      company,
      currency: cur,
      periodLabel: periodLabel(period),
      columns: [
        { key: "name", label: "الفئة", fr: 1.6 },
        { key: "count", label: "عدد", num: true },
        { key: "total", label: `المبلغ (${cur})`, num: true },
        { key: "sharePct", label: "النسبة %" },
      ],
      rows: data.byCategory.map((c) => ({
        name: c.name,
        count: c.count,
        total: c.total,
        sharePct: `${c.sharePct}%`,
      })),
      summary: [
        { label: "عدد الحركات", value: data.count },
        { label: "الفترة السابقة", value: data.prevTotal },
        { label: "إجمالي مصروفات الفترة", value: data.total, emphasis: true },
      ],
    });
  };

  const csvRows = () =>
    (data?.rows ?? []).map((r) => ({
      التاريخ: r.txDate,
      الفئة: r.categoryName,
      البيان: r.description ?? "",
      المبلغ: r.amount,
      العملة: r.currencyCode,
      "المبلغ بالأساس": r.amountBase,
      الصندوق: r.cashboxName,
    }));

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-8">
      <AppHeader
        title="تقرير المصروفات"
        action={
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#F87171]/15 text-[#F87171]">
            <Receipt className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="px-3 pb-3">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </AppHeader>

      {/* ─── الملخص ─── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile title="إجمالي المصروفات" amount={data?.total ?? 0} currency={cur} loading={isLoading} variant="neg" hint={`${data?.count ?? 0} حركة`} />
        <div className="flex flex-col items-start gap-1.5 rounded-2xl border border-border/60 bg-card p-4 text-start shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
          <span className="text-[13px] font-medium text-muted-foreground">مقارنة بالفترة السابقة</span>
          {isLoading ? (
            <span className="font-num text-2xl text-muted-foreground">…</span>
          ) : (
            <AmountText value={data?.prevTotal ?? 0} currency={cur} size="xl" variant="neutral" />
          )}
          {data?.changePct != null ? <TrendBadge percent={data.changePct} goodWhenDown /> : <span className="font-num text-xs text-muted-foreground">لا مقارنة</span>}
        </div>
      </div>

      {/* ─── الرسم ─── */}
      {chartData.length > 0 && (
        <>
          <SectionTitle>المصروفات عبر الفترة</SectionTitle>
          <div className="rounded-2xl border border-border/60 bg-card p-3">
            <div dir="ltr" className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="name" tick={{ fontSize: 9.5, fill: "#94A3B8" }} axisLine={{ stroke: "#334155" }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={false} tickLine={false} width={46} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip
                    contentStyle={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 12, fontSize: 12, direction: "rtl" }}
                    labelStyle={{ color: "#F1F5F9", fontWeight: 700 }}
                    formatter={(value: number | string) => [formatAmount(Number(value)), "مصروفات"]}
                  />
                  <Bar dataKey="المصروفات" fill="#F87171" radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ─── الفئات ─── */}
      <SectionTitle>حسب الفئة</SectionTitle>
      <ReportTable
        columns={[
          { key: "name", label: "الفئة", fr: 1.6 },
          { key: "count", label: "عدد", num: true, fr: 0.6 },
          { key: "total", label: `المبلغ`, num: true, fr: 1.2 },
          { key: "sharePct", label: "النسبة", num: true, fr: 0.8 },
        ]}
        amountKeys={["total"]}
        rows={(data?.byCategory ?? []).map((c) => ({
          name: c.name,
          count: c.count,
          total: c.total,
          sharePct: `${c.sharePct}%`,
        }))}
        maxH="max-h-64"
      />

      {/* ─── القائمة ─── */}
      <SectionTitle>الحركات</SectionTitle>
      <ReportTable
        columns={[
          { key: "txDate", label: "التاريخ", num: true },
          { key: "categoryName", label: "الفئة", fr: 1.1 },
          { key: "description", label: "البيان", fr: 1.6 },
          { key: "amountBase", label: "المبلغ", num: true },
        ]}
        amountKeys={["amountBase"]}
        rows={(data?.rows ?? []).map((r) => ({
          txDate: formatDate(r.txDate),
          categoryName: r.categoryName,
          description: r.description ?? "—",
          amountBase: r.amountBase,
        }))}
        maxH="max-h-64"
      />

      <ReportToolbar onPrint={doPrint} csvRows={csvRows} csvPrefix="expenses" disabled={!data} />
    </div>
  );
}
