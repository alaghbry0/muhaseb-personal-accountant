"use client";

/**
 * المصروفات — 08_المصروفات (FR-04-05): فترة + بطاقة الإجمالي (مع مقارنة
 * الفترة السابقة) + أعمدة الفئات النسبية + قائمة الحركات + FAB مصروف جديد
 * + إدارة الفئات + انتقال لتقرير المصروفات الكامل.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings2, BarChart3, Receipt } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDate } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { AppHeader, AmountText, EmptyState, ListRow, StatTile, TrendBadge } from "@/components/ds";
import { PeriodPicker, makePeriodState, type PeriodState } from "@/components/reports/period-picker";
import { cn } from "@/lib/utils";

interface ExpensesResponse {
  period: { from: string; to: string };
  baseCurrency: string;
  total: number;
  prevTotal: number;
  changePct: number | null;
  count: number;
  byCategory: Array<{ id: number | null; name: string; total: number; count: number; sharePct: number }>;
  rows: Array<{
    id: number;
    txDate: string;
    categoryName: string;
    description: string | null;
    amount: number;
    amountBase: number;
    currencyCode: string;
    cashboxName: string;
  }>;
}

const CAT_COLORS = ["#F87171", "#FB923C", "#FBBF24", "#34D399", "#22D3EE", "#A78BFA", "#F472B6", "#94A3B8"];

export default function CashExpensesScreen() {
  const { push } = useNav();
  const [period, setPeriod] = useState<PeriodState>(makePeriodState("month"));

  const url = useMemo(() => `/api/expenses?from=${period.from}&to=${period.to}`, [period]);
  const { data, isLoading } = useQuery<ExpensesResponse>({
    queryKey: ["expenses", url],
    queryFn: () => getJson<ExpensesResponse>(url),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="flex min-h-full flex-col pb-24">
      <AppHeader
        title="المصروفات"
        action={
          <button
            type="button"
            onClick={() => push("cash-expense-categories")}
            aria-label="إدارة الفئات"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Settings2 className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="px-3 pb-3">
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </AppHeader>

      <div className="flex flex-1 flex-col gap-3 p-3">
        {/* ─── الإجمالي ─── */}
        <div className="grid grid-cols-2 gap-2.5">
          <StatTile
            title="إجمالي المصروفات"
            amount={data?.total ?? 0}
            currency={data?.baseCurrency ?? "YER"}
            variant="neg"
            icon={Receipt}
            loading={isLoading}
            hint={`${data?.count ?? 0} حركة في الفترة`}
          />
          <div className="flex flex-col items-start gap-1.5 rounded-2xl border border-border/60 bg-card p-4 text-start shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
            <span className="text-[13px] font-medium text-muted-foreground">مقارنة بالفترة السابقة</span>
            <AmountText value={data?.prevTotal ?? 0} currency={data?.baseCurrency ?? "YER"} size="xl" variant="neutral" />
            {data?.changePct != null ? (
              <TrendBadge percent={data.changePct} goodWhenDown />
            ) : (
              <span className="font-num text-xs text-muted-foreground">لا مقارنة</span>
            )}
          </div>
        </div>

        {/* ─── الفئات ─── */}
        {(data?.byCategory?.length ?? 0) > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[14px] font-bold text-foreground">حسب الفئة</span>
              <button
                type="button"
                onClick={() => push("report-expenses")}
                className="flex items-center gap-1 text-[12.5px] font-bold text-primary"
              >
                <BarChart3 className="size-3.5" aria-hidden />
                التقرير الكامل
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              {data!.byCategory.map((c, i) => (
                <div key={c.name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="flex items-center gap-2">
                      <span dir="ltr" className="font-num text-muted-foreground">{formatAmount(c.total)}</span>
                      <span className="font-num text-[11.5px] text-muted-foreground">{c.sharePct}%</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(2, c.sharePct)}%`, backgroundColor: CAT_COLORS[i % CAT_COLORS.length] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── القائمة ─── */}
        {isLoading ? (
          <p className="py-8 text-center text-[13.5px] text-muted-foreground">جارٍ تحميل المصروفات…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Receipt}
            message="لا مصروفات في هذه الفترة"
            hint="سجّل مصروفك الأول من الزر العائم بالأسفل"
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => (
              <ListRow
                key={r.id}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[#FB923C]/15 text-[#FB923C]">
                    <Receipt className="size-5" aria-hidden />
                  </span>
                }
                title={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-[#FB923C]/10 px-2 py-0.5 text-[11.5px] font-bold text-[#FB923C]">
                      {r.categoryName}
                    </span>
                  </span>
                }
                subtitle={
                  <span className="line-clamp-1">
                    {r.description ?? "—"} • {formatDate(r.txDate)} • {r.cashboxName}
                  </span>
                }
                trailing={
                  r.currencyCode === (data?.baseCurrency ?? "YER") ? (
                    <AmountText value={r.amount} currency={r.currencyCode} size="md" variant="neg" />
                  ) : (
                    <span className="flex flex-col items-end">
                      <AmountText value={r.amount} currency={r.currencyCode} size="md" variant="neg" />
                      <span dir="ltr" className="font-num text-[11px] text-muted-foreground">
                        ≈ {formatAmount(r.amountBase, { currency: data?.baseCurrency })}
                      </span>
                    </span>
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* ─── FAB ─── */}
      <button
        type="button"
        onClick={() => push("cash-tx-new", { type: "expense" })}
        aria-label="مصروف جديد"
        className={cn(
          "fixed bottom-24 left-1/2 z-20 flex h-14 -translate-x-1/2 items-center gap-2 rounded-full",
          "bg-gradient-cyan px-6 text-[15px] font-extrabold text-[#06202B] shadow-lg shadow-primary/30",
          "transition-transform active:scale-95"
        )}
      >
        <Plus className="size-5" aria-hidden />
        مصروف جديد
      </button>
    </div>
  );
}
