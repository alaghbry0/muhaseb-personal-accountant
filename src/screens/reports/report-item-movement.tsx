"use client";

/**
 * حركة صنف — FR-09-03: منتقي صنف (بحث) + فلتر مخزن + فترة + جدول الحركات
 * (التاريخ/النوع/الكمية ±/المرجع/الرصيد التراكمي) + إجماليات وارد/صادر/مرتجعات + طباعة/CSV.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Search } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDateDisplay } from "@/lib/format";
import type { BootstrapData } from "@/lib/types";
import { AppHeader, AmountText, EmptyState, SectionTitle, StatTile } from "@/components/ds";
import { PeriodPicker, makePeriodState, periodLabel, type PeriodState } from "@/components/reports/period-picker";
import { ReportTable, ReportToolbar } from "@/components/reports/report-table";
import { printReport } from "@/components/print/report-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { ItemMovementReport } from "@/domain/reports";
import { cn } from "@/lib/utils";

interface ProductSearchResponse {
  products: Array<{ id: number; name: string; barcode: string | null; totalStock: number }>;
}

export default function ReportItemMovementScreen() {
  const [q, setQ] = useState("");
  const [productId, setProductId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [period, setPeriod] = useState<PeriodState>(makePeriodState("month"));
  const { company } = usePrintCompany();

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60 * 1000,
  });

  const { data: search } = useQuery<ProductSearchResponse>({
    queryKey: ["products", "search-report", q],
    queryFn: () => getJson<ProductSearchResponse>(`/api/products/search?q=${encodeURIComponent(q)}&limit=15`),
  });

  const selectedProduct = useMemo(
    () => (search?.products ?? []).find((p) => p.id === productId) ?? null,
    [search, productId]
  );

  const url = productId
    ? `/api/reports/item-movement?productId=${productId}${warehouseId ? `&warehouseId=${warehouseId}` : ""}&from=${period.from}&to=${period.to}`
    : null;
  const { data, isLoading } = useQuery<ItemMovementReport>({
    queryKey: ["reports", "item-movement", url],
    queryFn: () => getJson<ItemMovementReport>(url as string),
    enabled: !!url,
  });

  const doPrint = () => {
    if (!data) return;
    printReport({
      title: `حركة صنف — ${data.productName}`,
      subtitle: [data.warehouseName, data.unitName ? `الوحدة: ${data.unitName}` : null].filter(Boolean).join(" • "),
      company,
      periodLabel: periodLabel(period),
      columns: [
        { key: "date", label: "التاريخ", num: true },
        { key: "type", label: "النوع" },
        { key: "qty", label: "الكمية ±" },
        { key: "ref", label: "المرجع" },
        { key: "balance", label: "الرصيد التراكمي" },
      ],
      rows: data.rows.map((r) => ({
        date: formatDateDisplay(r.date),
        type: r.typeLabel,
        qty: r.qty > 0 ? `+${formatAmount(r.qty, { decimals: 2, showSymbol: false })}` : formatAmount(r.qty, { decimals: 2, showSymbol: false }),
        ref: r.refType === "invoice" ? `فاتورة #${r.refId}` : r.refType === "transfer" ? `تحويل #${r.refId}` : r.refType ?? "—",
        balance: formatAmount(r.balance, { decimals: 2, showSymbol: false }),
      })),
      summary: [
        { label: "رصيد أول الفترة", value: data.openingQty },
        { label: "وارد", value: data.totals.in },
        { label: "صادر", value: data.totals.out },
        { label: "مرتجعات بيع", value: data.totals.saleReturns },
        { label: "الرصيد الختامي", value: data.closingQty, emphasis: true },
      ],
    });
  };

  const csvRows = () =>
    (data?.rows ?? []).map((r) => ({
      التاريخ: r.date,
      النوع: r.typeLabel,
      الكمية: r.qty,
      المرجع: `${r.refType ?? ""} ${r.refId ?? ""}`,
      "الرصيد التراكمي": r.balance,
    }));

  return (
    <div className="flex min-h-full flex-col gap-3 p-3 pb-8">
      <AppHeader
        title="حركة صنف"
        action={
          <span className="flex size-11 items-center justify-center rounded-xl bg-[#FB923C]/15 text-[#FB923C]">
            <Package className="size-5" aria-hidden />
          </span>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setProductId(null);
              }}
              placeholder="ابحث عن صنف بالاسم أو الباركود…"
              aria-label="البحث عن صنف"
              className="w-full bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          {(search?.products?.length ?? 0) > 0 && !productId && (
            <div className="scrollbar-slim max-h-40 overflow-y-auto rounded-xl border border-border/60 bg-card">
              {(search?.products ?? []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProductId(p.id)}
                  className="flex w-full items-center justify-between gap-2 border-b border-border/40 px-3.5 py-2.5 text-start text-[13.5px] last:border-0 hover:bg-accent/30"
                >
                  <span className="min-w-0 truncate font-medium">{p.name}</span>
                  <span className="shrink-0 font-num text-[12px] text-muted-foreground">
                    رصيد {formatAmount(p.totalStock, { decimals: 0, showSymbol: false })}
                  </span>
                </button>
              ))}
            </div>
          )}
          <PeriodPicker value={period} onChange={setPeriod} />
        </div>
      </AppHeader>

      {!productId ? (
        <EmptyState icon={Package} message="اختر صنفاً لعرض حركته" hint="ابحث بالاسم أو امسح الباركود بالأعلى" />
      ) : (
        <>
          {/* الصنف المختار + المخزن */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/60 bg-card p-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[#FB923C]/15 text-[#FB923C]">
                <Package className="size-5" aria-hidden />
              </span>
              <div className="flex flex-col">
                <span className="text-[14.5px] font-bold text-foreground">{selectedProduct?.name ?? data?.productName}</span>
                <span className="font-num text-[12px] text-muted-foreground">
                  {selectedProduct?.barcode ?? ""}
                </span>
              </div>
            </div>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              aria-label="فلتر المخزن"
              className="h-10 rounded-xl border border-border bg-background px-3 text-[13px] font-bold text-foreground outline-none"
            >
              <option value="">كل المخازن</option>
              {(boot?.warehouses ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          {/* الإجماليات */}
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile title="رصيد أول الفترة" amount={data?.openingQty ?? 0} plain loading={isLoading} />
            <StatTile title="الرصيد الختامي" amount={data?.closingQty ?? 0} plain loading={isLoading} variant="primary" />
            <StatTile title="وارد" amount={data?.totals.in ?? 0} plain loading={isLoading} variant="pos" hint="مشتريات + تحويلات + مرتجعات" />
            <StatTile title="صادر" amount={data?.totals.out ?? 0} plain loading={isLoading} variant="neg" hint={`مرتجعات بيع: ${formatAmount(data?.totals.saleReturns ?? 0, { decimals: 0, showSymbol: false })}`} />
          </div>

          {/* الجدول */}
          <SectionTitle>الحركات</SectionTitle>
          {isLoading ? (
            <p className="py-8 text-center text-[13.5px] text-muted-foreground">جارٍ التحميل…</p>
          ) : (data?.rows?.length ?? 0) === 0 ? (
            <EmptyState icon={Package} message="لا حركات في هذه الفترة" hint="جرّب توسيع الفترة" />
          ) : (
            <ReportTable
              columns={[
                { key: "date", label: "التاريخ", num: true, fr: 1 },
                { key: "type", label: "النوع", fr: 1 },
                { key: "qty", label: "الكمية", num: true, fr: 0.8 },
                { key: "balance", label: "الرصيد", num: true, fr: 0.9 },
              ]}
              rows={(data?.rows ?? []).map((r) => ({
                date: formatDateDisplay(r.date),
                type: (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11.5px] font-bold",
                      r.qty >= 0 ? "bg-[#34D399]/10 text-[#34D399]" : "bg-[#F87171]/10 text-[#F87171]"
                    )}
                  >
                    {r.typeLabel}
                  </span>
                ),
                qty: (
                  <AmountText value={r.qty} plain decimals={2} size="sm" variant={r.qty >= 0 ? "pos" : "neg"} signed />
                ),
                balance: <AmountText value={r.balance} plain decimals={2} size="sm" variant="primary" />,
              }))}
              maxH="max-h-[46vh]"
            />
          )}

          <ReportToolbar onPrint={doPrint} csvRows={csvRows} csvPrefix="item-movement" disabled={!data} />
        </>
      )}
    </div>
  );
}
