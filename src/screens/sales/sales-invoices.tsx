"use client";

/**
 * قائمة فواتير المبيعات — دليل الشاشات: فلترة (الكل/نقدي/آجل/معلّق) + فترة
 * (اليوم/الأسبوع/الشهر/الكل) + بحث برقم الفاتورة أو اسم العميل + ترقيم صفحات.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ReceiptText } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatTime12, resolvePeriod, type PeriodId } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { InvoiceListResponse } from "@/domain/dto";
import {
  AppHeader, ListRow, StatusChip, AmountText, EmptyState, SearchBar, PrimaryButton,
} from "@/components/ds";
import { cn } from "@/lib/utils";

const PAY_FILTERS = [
  { id: "", label: "الكل" },
  { id: "cash", label: "نقدي" },
  { id: "credit", label: "آجل" },
  { id: "mixed", label: "مختلط" },
  { id: "held", label: "معلّق" },
] as const;

const PERIOD_FILTERS: Array<{ id: "" | "today" | "week" | "month"; label: string }> = [
  { id: "", label: "الكل" },
  { id: "today", label: "اليوم" },
  { id: "week", label: "آخر 7 أيام" },
  { id: "month", label: "هذا الشهر" },
];

export default function SalesInvoicesScreen() {
  const { push } = useNav();
  const [payFilter, setPayFilter] = useState<string>("");
  const [period, setPeriod] = useState<"" | "today" | "week" | "month">("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const range = useMemo(() => {
    if (!period) return { from: "", to: "" };
    const r = resolvePeriod(period as PeriodId);
    return { from: r.from, to: r.to };
  }, [period]);

  const url = useMemo(() => {
    const params = new URLSearchParams({ docType: "sale", page: String(page) });
    if (payFilter) params.set("payStatus", payFilter);
    if (q) params.set("q", q);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    return `/api/invoices?${params.toString()}`;
  }, [payFilter, q, range, page]);

  const { data, isLoading } = useQuery<InvoiceListResponse>({
    queryKey: ["invoices", "list", url],
    queryFn: () => getJson<InvoiceListResponse>(url),
  });

  const invoices = data?.invoices ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="فواتير المبيعات"
        action={
          <button
            type="button"
            onClick={() => push("sales-pos")}
            aria-label="فاتورة جديدة"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3">
          <SearchBar value={q} onChange={setQ} placeholder="بحث برقم الفاتورة أو اسم العميل…" />
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
            {PAY_FILTERS.map((f) => (
              <button
                key={f.id || "all"}
                type="button"
                onClick={() => {
                  setPayFilter(f.id);
                  setPage(1);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                  payFilter === f.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
            {PERIOD_FILTERS.map((f) => (
              <button
                key={f.id || "p-all"}
                type="button"
                onClick={() => {
                  setPeriod(f.id);
                  setPage(1);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  period === f.id
                    ? "border-[#22D3EE]/60 bg-[#22D3EE]/10 text-[#22D3EE]"
                    : "border-border/70 text-muted-foreground hover:bg-accent/30"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">
            جارٍ تحميل الفواتير…
          </p>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            message="لا فواتير بعد — أنشئ أول فاتورة"
            hint="افتح شاشة البيع وأضف الأصناف ثم احفظ نقدي أو آجل"
            actionLabel="فتح شاشة البيع"
            onAction={() => push("sales-pos")}
          />
        ) : (
          <div className="flex flex-col">
            {invoices.map((inv) => (
              <ListRow
                key={inv.id}
                onClick={() => push("sales-invoice-details", { invoiceId: inv.id })}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ReceiptText className="size-5" aria-hidden />
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className="font-num">{inv.invoiceNo}</span>
                    <StatusChip status={inv.payStatus} />
                  </span>
                }
                subtitle={
                  <span>
                    {inv.customerName ?? "نقدي"}
                    <span className="mx-1.5 text-border">•</span>
                    <span className="font-num">{formatTime12(inv.createdAt)}</span>
                    <span className="mx-1.5 text-border">•</span>
                    {inv.itemsCount} بنود
                  </span>
                }
                trailing={
                  <span className="flex flex-col items-end gap-0.5">
                    <AmountText value={inv.total} currency={inv.currencyCode} size="md" variant="neutral" />
                    {inv.dueAmount > 0 && (
                      <AmountText value={inv.dueAmount} currency={inv.currencyCode} size="sm" variant="due" />
                    )}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 p-3">
          <PrimaryButton
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            السابق
          </PrimaryButton>
          <span className="font-num text-[13px] text-muted-foreground">
            صفحة {data.page} من {data.pages} — {formatAmount(data.total, { decimals: 0, showSymbol: false })} فاتورة
          </span>
          <PrimaryButton
            variant="outline"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
          >
            التالي
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
