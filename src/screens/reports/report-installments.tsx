"use client";

/**
 * تقرير الأقساط — FR-05-05: ملخص (المحصّل/المستحق/المتأخر) + رسم توقع
 * التدفق النقدي 6 أشهر + جدول الخطط (العميل/المتبقي/القسط القادم/الحالة) + طباعة/CSV.
 */
import { useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { CalendarClock } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDateDisplay } from "@/lib/format";
import { useChartTheme } from "@/lib/chart-theme";
import { AppHeader, AmountText, EmptyState, SectionTitle, StatTile, StatusChip } from "@/components/ds";
import { ReportTable, ReportToolbar } from "@/components/reports/report-table";
import { printReport } from "@/components/print/report-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { InstallmentsReport } from "@/domain/reports";

export default function ReportInstallmentsScreen() {
  const { company, baseCurrency } = usePrintCompany();
  // ألوان الرسم حسب الثيم (داكن = الحالي حرفياً / فاتح = نظائر أدكن مقروءة)
  const ct = useChartTheme();
  const { data, isLoading } = useQuery<InstallmentsReport>({
    queryKey: ["reports", "installments"],
    queryFn: () => getJson<InstallmentsReport>("/api/reports/installments"),
  });

  const cur = data?.baseCurrency ?? baseCurrency;

  const chartData = (data?.forecast ?? []).map((f) => ({
    name: f.label.replace(" 2026", "").replace(" 2027", ""),
    "المتوقع": Math.round(f.expected),
    count: f.count,
  }));

  const doPrint = () => {
    if (!data) return;
    printReport({
      title: "تقرير الأقساط",
      company,
      currency: cur,
      periodLabel: `حتى ${formatDateDisplay(data.asOf)}`,
      columns: [
        { key: "customer", label: "العميل", fr: 1.5 },
        { key: "invoiceNo", label: "الفاتورة" },
        { key: "remaining", label: `المتبقي (${cur})`, num: true },
        { key: "nextDue", label: "القسط القادم", num: true },
        { key: "status", label: "الحالة" },
      ],
      rows: data.plans.map((p) => ({
        customer: p.customerName,
        invoiceNo: p.invoiceNo ?? "خطة مستقلة",
        remaining: p.remainingBase,
        nextDue: p.nextDue ? formatDateDisplay(p.nextDue) : "—",
        status: p.lateCount > 0 ? `متأخر (${p.lateCount})` : p.status === "completed" ? "مكتملة" : "منتظمة",
      })),
      summary: [
        { label: "المحصّل حتى تاريخه", value: data.summary.collected },
        { label: "المستحق المتبقي", value: data.summary.pending },
        { label: "منه متأخر عن الاستحقاق", value: data.summary.late },
        { label: "عدد الخطط النشطة", value: data.summary.activePlans, emphasis: true },
      ],
      footerNote: "التوقع النقدي: مبالغ الأقساط غير المسددة المستحقة في الأشهر الستة القادمة (محوّلة بالأسعار الحالية).",
    });
  };

  const csvRows = () =>
    (data?.plans ?? []).map((p) => ({
      العميل: p.customerName,
      الفاتورة: p.invoiceNo ?? "خطة مستقلة",
      الأصل: p.principal,
      المحصل: p.totalPaid,
      المتبقي: p.remaining,
      "المتبقي بالأساس": p.remainingBase,
      "القسط القادم": p.nextDue ?? "—",
      "أقساط متأخرة": p.lateCount,
      الحالة: p.status,
    }));

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-8">
      <AppHeader
        title="تقرير الأقساط"
        action={
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#34D399]/15 text-[#34D399]">
            <CalendarClock className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="px-3 pb-3">
          <p className="text-[12.5px] text-muted-foreground">
            المحصّل والمستحق والمتأخر + توقع التدفق النقدي — حتى {formatDateDisplay(data?.asOf ?? new Date())}
          </p>
        </div>
      </AppHeader>

      {/* ─── الملخص ─── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatTile title="المحصّل حتى تاريخه" amount={data?.summary.collected ?? 0} currency={cur} loading={isLoading} variant="pos" />
        <StatTile title="المستحق المتبقي" amount={data?.summary.pending ?? 0} currency={cur} loading={isLoading} variant="due" />
        <StatTile title="متأخر عن الاستحقاق" amount={data?.summary.late ?? 0} currency={cur} loading={isLoading} variant="neg" />
        <StatTile
          title="الخطط"
          amount={data?.summary.plansCount ?? 0}
          plain
          loading={isLoading}
          hint={`${data?.summary.activePlans ?? 0} نشطة • ${data?.summary.completedPlans ?? 0} مكتملة`}
        />
      </div>

      {/* ─── توقع 6 أشهر ─── */}
      {chartData.length > 0 && (
        <>
          <SectionTitle>التدفق النقدي المتوقع — 6 أشهر قادمة</SectionTitle>
          <div className="rounded-2xl border border-border/60 bg-card p-3">
            <div dir="ltr" className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={ct.grid} />
                  <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: ct.axisTick }} axisLine={{ stroke: ct.axisLine }} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 10, fill: ct.axisTick }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                  />
                  <Tooltip
                    contentStyle={{ background: ct.tooltipBg, border: `1px solid ${ct.tooltipBorder}`, borderRadius: 12, fontSize: 12, direction: "rtl", boxShadow: ct.tooltipShadow }}
                    labelStyle={{ color: ct.tooltipLabelStrong, fontWeight: 700 }}
                    formatter={(value: number | string, _name, item) => [
                      `${formatAmount(Number(value))} (${(item as { payload?: { count?: number } })?.payload?.count ?? 0} قسط)`,
                      "المتوقع",
                    ]}
                  />
                  <Bar dataKey="المتوقع" fill={ct.line1} radius={[4, 4, 0, 0]} maxBarSize={34} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {/* ─── الخطط ─── */}
      <SectionTitle>الخطط</SectionTitle>
      {isLoading ? (
        <p className="py-8 text-center text-[13.5px] text-muted-foreground">جارٍ التحميل…</p>
      ) : (data?.plans?.length ?? 0) === 0 ? (
        <EmptyState icon={CalendarClock} message="لا خطط تقسيط" />
      ) : (
        <ReportTable
          columns={[
            { key: "customer", label: "العميل", fr: 1.5 },
            { key: "remaining", label: "المتبقي", num: true, fr: 1.1 },
            { key: "nextDue", label: "القسط القادم", num: true, fr: 1 },
            { key: "status", label: "الحالة", fr: 0.9 },
          ]}
          amountKeys={["remaining"]}
          rows={(data?.plans ?? []).map((p) => ({
            customer: (
              <span className="flex flex-col">
                <span className="truncate font-medium">{p.customerName}</span>
                <span className="text-[11px] text-muted-foreground">{p.invoiceNo ?? "خطة مستقلة"}</span>
              </span>
            ),
            remaining:
              p.currencyCode === cur ? (
                p.remaining
              ) : (
                <span dir="ltr" className="font-num text-[12.5px]">
                  {formatAmount(p.remaining, { currency: p.currencyCode })}
                  <span className="ms-1 text-muted-foreground">≈ {formatAmount(p.remainingBase)}</span>
                </span>
              ),
            nextDue: p.nextDue ? (
              <span className={p.nextDue < (data?.asOf ?? "") ? "font-bold text-[#F87171]" : ""}>
                {formatDateDisplay(p.nextDue)}
              </span>
            ) : (
              "—"
            ),
            status:
              p.lateCount > 0 ? (
                <span className="rounded-full bg-[#F87171]/10 px-2 py-0.5 text-[11.5px] font-bold text-[#F87171]">
                  متأخر ×{p.lateCount}
                </span>
              ) : (
                <StatusChip status={p.status === "completed" ? "completed" : "pending"} />
              ),
          }))}
          maxH="max-h-[46vh]"
        />
      )}

      <ReportToolbar onPrint={doPrint} csvRows={csvRows} csvPrefix="installments" disabled={!data} />
    </div>
  );
}
