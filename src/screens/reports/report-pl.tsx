"use client";

/**
 * حركة الشركة — الأرباح والخسائر ⭐ (FR-09-02): فترة + بلاطات ملخص
 * (الإيرادات/التكلفة/الإجمالي/المصروفات/العمولات/الصافي الكبير)
 * + تفكيك متتالٍ + رسم أعمدة (إيراد/مصروف/صافي) + جدول + طباعة A4 + CSV.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { TrendingUp, ShoppingBag, Coins, Calculator, BadgeDollarSign } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDate } from "@/lib/format";
import { AppHeader, AmountText, SectionTitle, StatTile } from "@/components/ds";
import { PeriodPicker, makePeriodState, periodLabel, type PeriodState } from "@/components/reports/period-picker";
import { ReportTable, ReportToolbar } from "@/components/reports/report-table";
import { printReport } from "@/components/print/report-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { ProfitLossReport } from "@/domain/reports";

export default function ReportPlScreen() {
  const [period, setPeriod] = useState<PeriodState>(makePeriodState("month"));
  const { company, baseCurrency } = usePrintCompany();

  const url = `/api/reports/profit-loss?from=${period.from}&to=${period.to}`;
  const { data, isLoading } = useQuery<ProfitLossReport>({
    queryKey: ["reports", "pl", url],
    queryFn: () => getJson<ProfitLossReport>(url),
  });

  const s = data?.summary;
  const cur = data?.baseCurrency ?? baseCurrency;

  const chartData = useMemo(
    () =>
      (data?.series ?? []).map((p) => ({
        ...p,
        الايرادات: Math.round(p.revenue),
        المصروفات: Math.round(p.expenses + p.commissions),
        الصافي: Math.round(p.net),
      })),
    [data]
  );

  const breakdown = useMemo(
    () =>
      s
        ? [
            { label: "إجمالي المبيعات", value: s.salesRevenue, variant: "pos" as const },
            { label: "− مرتجعات المبيعات", value: -s.salesReturns, variant: "neg" as const },
            { label: "= صافي الإيرادات", value: s.revenue, variant: "primary" as const, strong: true },
            { label: "− تكلفة المبيعات (مرجّحة)", value: -s.cogs, variant: "neg" as const },
            { label: "= الربح الإجمالي", value: s.grossProfit, variant: "primary" as const, strong: true },
            { label: "− المصروفات التشغيلية", value: -s.expenses, variant: "neg" as const },
            { label: "− عمولات المناديب", value: -s.commissions, variant: "neg" as const },
            { label: "= الربح الصافي", value: s.netProfit, variant: "primary" as const, strong: true },
          ]
        : [],
    [s]
  );

  const doPrint = () => {
    if (!data) return;
    printReport({
      title: "حركة الشركة — الأرباح والخسائر",
      company,
      currency: cur,
      periodLabel: periodLabel(period),
      columns: [
        { key: "label", label: "البند" },
        { key: "value", label: `المبلغ (${cur})`, num: true },
      ],
      rows: breakdown.map((b) => ({ label: b.label, value: b.value })),
      summary: [
        { label: "عدد فواتير البيع", value: s?.salesCount ?? 0 },
        { label: "عدد المرتجعات", value: s?.returnsCount ?? 0 },
        { label: "إجمالي المشتريات", value: s?.purchasesTotal ?? 0 },
        { label: "هامش الصافي %", value: s?.marginPercent != null ? `${s.marginPercent}%` : "—" },
        { label: "الربح الصافي", value: s?.netProfit ?? 0, emphasis: true },
      ],
      footerNote: "التكلفة على متوسط التكلفة المرجّح وقت البيع؛ المصروفات والعمولات نقدية ومستحقة بالفترة.",
    });
  };

  const csvRows = () =>
    breakdown.map((b) => ({ البند: b.label, المبلغ: b.value })) ?? [];

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-8">
      <AppHeader
        title="حركة الشركة"
        action={
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#34D399]/15 text-[#34D399]">
            <TrendingUp className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="px-3 pb-3">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </AppHeader>

      {/* ─── البلاطات ─── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile title="صافي الإيرادات" amount={s?.revenue ?? 0} currency={cur} loading={isLoading} icon={ShoppingBag} hint={`${s?.salesCount ?? 0} فاتورة بيع`} />
        <StatTile title="تكلفة المبيعات" amount={s?.cogs ?? 0} currency={cur} loading={isLoading} variant="neutral" icon={Coins} hint="متوسط مرجّح" />
        <StatTile title="الربح الإجمالي" amount={s?.grossProfit ?? 0} currency={cur} loading={isLoading} variant="pos" icon={TrendingUp} />
        <StatTile title="المصروفات" amount={s?.expenses ?? 0} currency={cur} loading={isLoading} variant="neg" icon={Calculator} />
      </div>

      {/* الربح الصافي — البطاقة الكبيرة */}
      <div className="bg-gradient-cyan relative overflow-hidden rounded-2xl p-4 text-[#06202B]">
        <div className="pointer-events-none absolute -left-8 -top-10 size-36 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-[13.5px] font-bold">
              <BadgeDollarSign className="size-4" aria-hidden />
              صافي الربح (بعد المصروفات والعمولات)
            </span>
            <span className="text-[11.5px] font-medium opacity-75">
              عمولات: {formatAmount(s?.commissions ?? 0, { currency: cur })}
              {s?.marginPercent != null ? ` • هامش ${s.marginPercent}%` : ""}
            </span>
          </div>
          <span dir="ltr" className="font-num text-[24px] font-extrabold leading-tight">
            {formatAmount(s?.netProfit ?? 0, { currency: cur })}
          </span>
        </div>
      </div>

      {/* ─── الرسم ─── */}
      {chartData.length > 0 && (
        <>
          <SectionTitle>الإيرادات والمصروفات والصافي</SectionTitle>
          <div className="rounded-2xl border border-border/60 bg-card p-3">
            <div dir="ltr" className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94A3B8" }} axisLine={{ stroke: "#334155" }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94A3B8" }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#1E293B",
                      border: "1px solid #334155",
                      borderRadius: 12,
                      fontSize: 12,
                      direction: "rtl",
                    }}
                    labelStyle={{ color: "#F1F5F9", fontWeight: 700 }}
                    formatter={(value: number | string, name: string) => [
                      formatAmount(Number(value)),
                      name,
                    ]}
                  />
                  <Bar dataKey="الايرادات" fill="#34D399" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="المصروفات" fill="#F87171" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Line type="monotone" dataKey="الصافي" stroke="#22D3EE" strokeWidth={2.5} dot={{ r: 3, fill: "#22D3EE" }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 text-[11.5px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#34D399]" /> إيرادات</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#F87171]" /> مصروفات + عمولات</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#22D3EE]" /> الصافي</span>
            </div>
          </div>
        </>
      )}

      {/* ─── التفكيك ─── */}
      <SectionTitle>تفكيك الأرباح والخسائر</SectionTitle>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        {breakdown.map((b, i) => (
          <div
            key={b.label}
            className={`flex items-center justify-between gap-2 px-4 py-3 ${i < breakdown.length - 1 ? "border-b border-border/40" : ""} ${b.strong ? "bg-primary/5" : ""}`}
          >
            <span className={`text-[13.5px] ${b.strong ? "font-extrabold text-foreground" : "text-muted-foreground"}`}>
              {b.label}
            </span>
            <AmountText
              value={b.value}
              currency={cur}
              size={b.strong ? "lg" : "md"}
              variant={b.strong ? "primary" : b.variant === "neg" ? "neg" : "pos"}
            />
          </div>
        ))}
      </div>

      {/* ─── مصروفات حسب الفئة ─── */}
      {(data?.expenseByCategory?.length ?? 0) > 0 && (
        <>
          <SectionTitle>المصروفات حسب الفئة</SectionTitle>
          <ReportTable
            columns={[
              { key: "name", label: "الفئة" },
              { key: "total", label: `المبلغ (${cur})`, num: true, fr: 1.2 },
            ]}
            amountKeys={["total"]}
            rows={data!.expenseByCategory}
            maxH="max-h-64"
          />
        </>
      )}

      {/* ─── أدوات ─── */}
      <ReportToolbar onPrint={doPrint} csvRows={csvRows} csvPrefix="profit-loss" disabled={!data} />
      <p className="text-center text-[11.5px] text-muted-foreground">
        تقرير من {formatDate(period.from)} إلى {formatDate(period.to)} — {(data?.series?.length ?? 0)} نقطة زمنية
        {s?.salesCount ? ` • ${s.salesCount} فاتورة` : ""}
      </p>
    </div>
  );
}
