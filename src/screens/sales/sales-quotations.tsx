"use client";

/**
 * عروض الأسعار — FR-02-11: قائمة + إنشاء (يفتح POS بوضع عرض السعر) +
 * تفاصيل في لوحة سفلية + تحويل لفاتورة حقيقية (نقدي/آجل/مختلط).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, FileText, ArrowRightLeft, Loader2 } from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDate } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type {
  QuotationListResponse,
  QuotationDetailDto,
} from "@/domain/dto";
import type { BootstrapData } from "@/lib/types";
import {
  AppHeader, ListRow, StatusChip, AmountText, EmptyState, SearchBar, PrimaryButton, SectionTitle,
} from "@/components/ds";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

const STATUS_FILTERS = [
  { id: "", label: "الكل" },
  { id: "open", label: "مفتوح" },
  { id: "converted", label: "محوّل" },
  { id: "rejected", label: "مرفوض" },
] as const;

type ConvertPay = "cash" | "credit" | "mixed";

export default function SalesQuotationsScreen() {
  const { push } = useNav();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<QuotationDetailDto | null>(null);
  const [convertPay, setConvertPay] = useState<ConvertPay>("cash");
  const [convertPaid, setConvertPaid] = useState("");
  const [converting, setConverting] = useState(false);

  const url = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (statusFilter) params.set("status", statusFilter);
    if (q) params.set("q", q);
    return `/api/quotations?${params.toString()}`;
  }, [statusFilter, q, page]);

  const { data, isLoading } = useQuery<QuotationListResponse>({
    queryKey: ["quotations", "list", url],
    queryFn: () => getJson<QuotationListResponse>(url),
  });

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  const quotations = data?.quotations ?? [];

  async function openDetail(id: number) {
    try {
      const res = await getJson<{ quotation: QuotationDetailDto }>(`/api/quotations/${id}`);
      setDetail(res.quotation);
      setConvertPay("cash");
      setConvertPaid("");
    } catch {
      // getJson تعرض الرسالة
    }
  }

  async function convertToInvoice() {
    if (!detail) return;
    const warehouseId =
      (boot?.warehouses.find((w) => w.isDefault) ?? boot?.warehouses[0])?.id ?? null;
    if (!warehouseId) {
      toast.error("لا يوجد مخزن معرّف");
      return;
    }
    const cashboxId =
      boot?.cashboxes.find(
        (b) => b.currencyId === boot?.currencies.find((c) => c.code === detail.currencyCode)?.id
      )?.id ?? null;
    if (convertPay !== "credit" && !cashboxId) {
      toast.error("اختر الصندوق أولاً");
      return;
    }
    setConverting(true);
    try {
      const res = await postJson<{ invoice: { id: number; invoiceNo: string } }>(
        `/api/quotations/${detail.id}/to-invoice`,
        {
          warehouseId,
          cashboxId,
          payMode: convertPay,
          paidAmount:
            convertPay === "mixed"
              ? Math.min(Math.max(0, Number(convertPaid) || 0), detail.total)
              : null,
        }
      );
      toast.success(`تم إنشاء الفاتورة ${res.invoice.invoiceNo} من عرض السعر`);
      setDetail(null);
      qc.invalidateQueries({ queryKey: ["quotations"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      push("sales-invoice-details", { invoiceId: res.invoice.id });
    } catch {
      // postJson تعرض الرسالة
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="عروض الأسعار"
        action={
          <button
            type="button"
            onClick={() => push("sales-pos", { mode: "quotation" })}
            aria-label="عرض سعر جديد"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3">
          <SearchBar value={q} onChange={setQ} placeholder="بحث برقم العرض أو اسم العميل…" />
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id || "all"}
                type="button"
                onClick={() => {
                  setStatusFilter(f.id);
                  setPage(1);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                  statusFilter === f.id
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
          <div className="flex items-center justify-center gap-2 py-10 text-[14px] text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden /> جارٍ التحميل…
          </div>
        ) : quotations.length === 0 ? (
          <EmptyState
            icon={FileText}
            message="لا توجد عروض أسعار بعد"
            hint="أنشئ عرض سعر من شاشة البيع (وضع عرض السعر) ثم حوّله لفاتورة بضغطة"
            actionLabel="عرض سعر جديد"
            onAction={() => push("sales-pos", { mode: "quotation" })}
          />
        ) : (
          <div className="flex flex-col">
            {quotations.map((qt) => (
              <ListRow
                key={qt.id}
                onClick={() => openDetail(qt.id)}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <FileText className="size-5" aria-hidden />
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className="font-num">{qt.quoteNo}</span>
                    <StatusChip status={qt.status} />
                  </span>
                }
                subtitle={
                  <span>
                    {qt.customerName ?? "بدون عميل"}
                    <span className="mx-1.5 text-border">•</span>
                    <span className="font-num">{formatDate(qt.issuedAt)}</span>
                    <span className="mx-1.5 text-border">•</span>
                    {qt.itemsCount} بنود
                    {qt.validUntil && (
                      <span className="text-muted-foreground"> • صالح حتى {formatDate(qt.validUntil)}</span>
                    )}
                  </span>
                }
                trailing={
                  <AmountText value={qt.total} currency={qt.currencyCode} size="md" />
                }
              />
            ))}
          </div>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 p-3">
          <PrimaryButton variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            السابق
          </PrimaryButton>
          <span className="font-num text-[13px] text-muted-foreground">
            صفحة {data.page} من {data.pages}
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

      {/* لوحة تفاصيل العرض + التحويل */}
      <Drawer open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DrawerContent className="rounded-t-2xl">
          <DrawerHeader className="text-start">
            <DrawerTitle className="flex items-center gap-2 text-base font-bold">
              <span className="font-num">{detail?.quoteNo}</span>
              {detail && <StatusChip status={detail.status} />}
            </DrawerTitle>
            <DrawerDescription>
              {detail
                ? `${detail.customer?.name ?? "بدون عميل"} — ${formatDate(detail.issuedAt)}${
                    detail.validUntil ? ` — صالح حتى ${formatDate(detail.validUntil)}` : ""
                  }`
                : ""}
            </DrawerDescription>
          </DrawerHeader>
          {detail && (
            <div className="scrollbar-slim max-h-[64vh] overflow-y-auto px-4 pb-6">
              <SectionTitle className="mb-1">البنود</SectionTitle>
              <ul className="mb-3 flex flex-col">
                {detail.items.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-start justify-between gap-3 border-b border-border/50 py-2.5 last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-foreground">
                        {it.productName}
                      </p>
                      <p className="font-num mt-0.5 text-[12px] text-muted-foreground" dir="ltr">
                        {formatAmount(it.qty, { decimals: it.qty % 1 ? 3 : 0, showSymbol: false })} ×{" "}
                        {formatAmount(it.unitPrice, { currency: detail.currencyCode })}
                      </p>
                    </div>
                    <AmountText value={it.lineTotal} currency={detail.currencyCode} size="sm" />
                  </li>
                ))}
              </ul>

              <div className="mb-4 rounded-xl bg-muted/40 p-3 text-[13.5px]">
                <div className="flex justify-between py-0.5">
                  <span className="text-muted-foreground">الإجمالي</span>
                  <span className="font-num font-bold">
                    {formatAmount(detail.subtotal, { currency: detail.currencyCode })}
                  </span>
                </div>
                {detail.discountAmount > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">الخصم</span>
                    <span className="font-num font-bold text-[#F87171]">
                      − {formatAmount(detail.discountAmount, { currency: detail.currencyCode })}
                    </span>
                  </div>
                )}
                {detail.taxAmount > 0 && (
                  <div className="flex justify-between py-0.5">
                    <span className="text-muted-foreground">الضريبة</span>
                    <span className="font-num font-bold">
                      {formatAmount(detail.taxAmount, { currency: detail.currencyCode })}
                    </span>
                  </div>
                )}
                <div className="mt-1 flex justify-between border-t border-border/60 pt-1.5">
                  <span className="font-bold text-foreground">الصافي</span>
                  <span className="font-num text-[16px] font-extrabold text-primary">
                    {formatAmount(detail.total, { currency: detail.currencyCode })}
                  </span>
                </div>
              </div>

              {detail.status === "converted" ? (
                <div className="flex flex-col gap-2">
                  <p className="text-center text-[13.5px] text-[#34D399]">
                    محوّل لفاتورة — عرض السعر منتهٍ
                  </p>
                  {detail.invoiceId && (
                    <PrimaryButton
                      variant="outline"
                      onClick={() => {
                        setDetail(null);
                        push("sales-invoice-details", { invoiceId: detail.invoiceId });
                      }}
                    >
                      عرض الفاتورة الناتجة
                    </PrimaryButton>
                  )}
                </div>
              ) : (
                <>
                  <SectionTitle className="mb-2">تحويل لفاتورة</SectionTitle>
                  <div className="flex gap-2">
                    {(
                      [
                        { id: "cash", label: "نقدي" },
                        { id: "credit", label: "آجل" },
                        { id: "mixed", label: "مختلط" },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setConvertPay(o.id)}
                        className={cn(
                          "flex-1 rounded-xl border px-3 py-2.5 text-[14px] font-bold transition-colors",
                          convertPay === o.id
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent/30"
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  {convertPay === "mixed" && (
                    <div className="mt-2 flex h-12 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3">
                      <input
                        type="number"
                        inputMode="decimal"
                        value={convertPaid}
                        onChange={(e) => setConvertPaid(e.target.value)}
                        placeholder={`المدفوع من ${formatAmount(detail.total, { currency: detail.currencyCode })}`}
                        aria-label="المبلغ المدفوع"
                        className="font-num h-full min-w-0 flex-1 bg-transparent text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none"
                      />
                    </div>
                  )}
                  {convertPay === "credit" && !detail.customer && (
                    <p className="mt-2 text-[13px] text-[#F87171]">
                      الفاتورة الآجلة تتطلب اختيار عميل — العرض الحالي بلا عميل
                    </p>
                  )}
                  <PrimaryButton
                    block
                    className="mt-3"
                    variant="success"
                    loading={converting}
                    disabled={convertPay === "credit" && !detail.customer}
                    onClick={convertToInvoice}
                  >
                    <ArrowRightLeft className="size-5" aria-hidden /> تحويل لفاتورة الآن
                  </PrimaryButton>
                </>
              )}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
