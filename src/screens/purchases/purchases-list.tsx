"use client";

/**
 * فواتير المشتريات — قائمة مع تبويبات (شراء / مرتجع شراء / مرتجع بيع)
 * + فلاتر دفع + بحث برقم المستند أو المورد + ترقيم صفحات + FAB فاتورة شراء جديدة.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ReceiptText, Truck, Undo2 } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatTime12 } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { InvoiceListResponse } from "@/domain/dto";
import { AppHeader, ListRow, StatusChip, AmountText, EmptyState, SearchBar, PrimaryButton } from "@/components/ds";
import { cn } from "@/lib/utils";

const DOC_TABS = [
  { id: "purchase", label: "فواتير الشراء", icon: Truck },
  { id: "purchase_return", label: "مرتجع شراء", icon: Undo2 },
  { id: "sale_return", label: "مرتجع بيع", icon: ReceiptText },
] as const;

const PAY_FILTERS = [
  { id: "", label: "الكل" },
  { id: "cash", label: "نقدي" },
  { id: "credit", label: "آجل" },
] as const;

export default function PurchasesListScreen() {
  const { push } = useNav();
  const [docType, setDocType] = useState<string>("purchase");
  const [payFilter, setPayFilter] = useState<string>("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const url = useMemo(() => {
    const params = new URLSearchParams({ docType, page: String(page) });
    if (payFilter) params.set("payStatus", payFilter);
    if (q) params.set("q", q);
    return `/api/invoices?${params.toString()}`;
  }, [docType, payFilter, q, page]);

  const { data, isLoading } = useQuery<InvoiceListResponse>({
    queryKey: ["invoices", "purchases-list", url],
    queryFn: () => getJson<InvoiceListResponse>(url),
  });

  const invoices = data?.invoices ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="فواتير المشتريات"
        action={
          <button
            type="button"
            onClick={() => push("purchases-new")}
            aria-label="فاتورة شراء جديدة"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3">
          <div className="flex gap-1.5">
            {DOC_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setDocType(t.id);
                  setPage(1);
                }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[13px] font-bold transition-colors",
                  docType === t.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}
              >
                <t.icon className="size-4" aria-hidden /> {t.label}
              </button>
            ))}
          </div>
          <SearchBar value={q} onChange={setQ} placeholder="بحث برقم المستند أو اسم المورد…" />
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
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
        ) : invoices.length === 0 ? (
          <EmptyState
            icon={Truck}
            message={
              docType === "purchase"
                ? "لا فواتير شراء بعد"
                : docType === "purchase_return"
                  ? "لا مرتجعات شراء بعد"
                  : "لا مرتجعات بيع بعد"
            }
            hint={
              docType === "purchase"
                ? "سجّل أول توريد بضاعة — يحدّث المخزون ومتوسط التكلفة تلقائياً"
                : "أنشئ مرتجعاً من تفاصيل الفاتورة أو شاشة المرتجعات"
            }
            actionLabel={docType === "purchase" ? "فاتورة شراء جديدة" : undefined}
            onAction={docType === "purchase" ? () => push("purchases-new") : undefined}
          />
        ) : (
          <div className="flex flex-col">
            {invoices.map((inv) => (
              <ListRow
                key={inv.id}
                onClick={() => push("purchases-details", { invoiceId: inv.id })}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {docType === "purchase" ? (
                      <Truck className="size-5" aria-hidden />
                    ) : (
                      <Undo2 className="size-5" aria-hidden />
                    )}
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
                    {inv.supplierName ?? inv.customerName ?? (docType === "purchase" ? "مورد نقدي" : "نقدي")}
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
                    {inv.dueAmount < 0 && (
                      <span className="text-[11px] font-bold text-[#34D399]">خصم من الحساب</span>
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
          <PrimaryButton variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            السابق
          </PrimaryButton>
          <span className="font-num text-[13px] text-muted-foreground">
            صفحة {data.page} من {data.pages} — {formatAmount(data.total, { decimals: 0, showSymbol: false })} مستند
          </span>
          <PrimaryButton variant="outline" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            التالي
          </PrimaryButton>
        </div>
      )}

      {/* FAB */}
      <button
        type="button"
        onClick={() => push("purchases-new")}
        aria-label="فاتورة شراء جديدة"
        className="bg-gradient-cyan fixed bottom-24 end-4 z-20 flex h-14 items-center gap-2 rounded-2xl px-5 text-[15px] font-extrabold text-[#06202B] shadow-[0_6px_20px_rgba(34,211,238,0.45)] transition-transform hover:scale-105 active:scale-95"
      >
        <Plus className="size-5" aria-hidden /> فاتورة شراء جديدة
      </button>
      <div className="h-6" />
    </div>
  );
}
