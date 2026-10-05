"use client";

/**
 * سجل الحركات (FR-01-07) — سجل دائم لكل حركات المخزون مع فلاتر:
 * صنف (بحث) + مخزن + نوع (شراء/بيع/مرتجعات/جرد/تحويل/افتتاحي) + فترة. صفحات 30.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, PackageSearch } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatDate, formatTime12 } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { ProductSearchItemDto } from "@/domain/dto";
import type { BootstrapData as BootType } from "@/lib/types";
import { AppHeader, ListRow, EmptyState, PrimaryButton, SearchBar } from "@/components/ds";
import { MOVEMENT_LABELS, MOVEMENT_COLORS } from "./inventory-product-card";
import { PosSheet } from "@/components/pos/pos-sheet";
import { cn } from "@/lib/utils";

interface MovementsResponse {
  movements: Array<{
    id: number;
    movedAt: string;
    createdAt: string;
    movementType: string;
    typeLabel: string;
    qty: number;
    unitCost: number | null;
    productId: number;
    productName: string;
    warehouseName: string;
    refType: string | null;
    refNo: string | null;
    notes: string | null;
  }>;
  total: number;
  page: number;
  pages: number;
}

const TYPE_FILTERS = [
  { id: "", label: "الكل" },
  { id: "purchase", label: "شراء" },
  { id: "sale", label: "بيع" },
  { id: "sale_return", label: "مرتجع بيع" },
  { id: "purchase_return", label: "مرتجع شراء" },
  { id: "adjustment", label: "جرد" },
  { id: "transfer", label: "تحويل" },
  { id: "opening", label: "افتتاحي" },
] as const;

export default function InventoryMovementsScreen({
  productId: pid,
  type: initialType,
}: {
  productId?: number | string;
  type?: string;
}) {
  const nav = useNav();
  const presetProductId = Number(pid ?? 0) || null;
  const [productId, setProductId] = useState<number | null>(presetProductId);
  const [productLabel, setProductLabel] = useState<string>(presetProductId ? "" : "كل الأصناف");
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [type, setType] = useState<string>(initialType ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pickerOpen, setPickerOpen] = useState(false);

  // اسم الصنف المحدد مسبقاً
  useEffect(() => {
    if (!presetProductId) return;
    let alive = true;
    getJson<{ product: { name: string } }>(`/api/products/${presetProductId}`).then((d) => {
      if (alive) setProductLabel(d.product.name);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [presetProductId]);

  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  const url = useMemo(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (productId) params.set("productId", String(productId));
    if (warehouseId) params.set("warehouseId", String(warehouseId));
    if (type) params.set("type", type);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/stock/movements?${params.toString()}`;
  }, [productId, warehouseId, type, from, to, page]);

  const { data, isLoading } = useQuery<MovementsResponse>({
    queryKey: ["stock", "movements", url],
    queryFn: () => getJson<MovementsResponse>(url),
  });

  const movements = data?.movements ?? [];
  const warehouses = boot?.warehouses ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="سجل الحركات">
        <div className="flex flex-col gap-2 px-3 pb-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex h-12 items-center justify-between gap-2 rounded-xl border border-border bg-muted/60 px-3 text-start hover:border-primary/50"
          >
            <span className="flex items-center gap-2 text-[14px] text-foreground">
              <PackageSearch className="size-4 text-muted-foreground" aria-hidden />
              {productLabel}
            </span>
            <span className="text-[12px] text-muted-foreground">تغيير</span>
          </button>
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.id || "all"}
                type="button"
                onClick={() => {
                  setType(f.id);
                  setPage(1);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                  type === f.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <select
              value={warehouseId ?? ""}
              onChange={(e) => {
                setWarehouseId(e.target.value ? Number(e.target.value) : null);
                setPage(1);
              }}
              aria-label="فلتر المخزن"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-muted/60 px-2 text-[13.5px] text-foreground outline-none focus:border-primary/70"
            >
              <option value="">كل المخازن</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              aria-label="من تاريخ"
              className="font-num h-11 w-36 rounded-xl border border-border bg-muted/60 px-2 text-[13px] text-foreground outline-none focus:border-primary/70"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              aria-label="إلى تاريخ"
              className="font-num h-11 w-36 rounded-xl border border-border bg-muted/60 px-2 text-[13px] text-foreground outline-none focus:border-primary/70"
            />
          </div>
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
        ) : movements.length === 0 ? (
          <EmptyState
            icon={History}
            message="لا حركات مطابقة"
            hint="غيّر الفلاتر أو أضف حركات بالبيع والشراء"
          />
        ) : (
          <div className="flex flex-col">
            {movements.map((m) => (
              <ListRow
                key={m.id}
                onClick={() =>
                  m.refType === "invoice"
                    ? nav.push(
                        m.movementType === "sale" ? "sales-invoice-details" : "purchases-details",
                        { invoiceId: m.refId }
                      )
                    : nav.push("inventory-product-card", { productId: m.productId })
                }
                leading={
                  <span className={cn(
                    "flex size-11 items-center justify-center rounded-xl border text-[11px] font-extrabold",
                    MOVEMENT_COLORS[m.movementType] ?? "bg-muted text-muted-foreground border-border"
                  )}>
                    {m.typeLabel}
                  </span>
                }
                title={<span className="text-[14.5px]">{m.productName}</span>}
                subtitle={
                  <span className="font-num">
                    {formatDate(m.movedAt)} · {formatTime12(m.createdAt)} • {m.warehouseName}
                    {m.refNo && <span className="text-primary"> — {m.refNo}</span>}
                  </span>
                }
                trailing={
                  <span className={cn(
                    "font-num text-[16px] font-extrabold",
                    m.qty >= 0 ? "text-[#34D399]" : "text-[#F87171]"
                  )} dir="ltr">
                    {m.qty >= 0 ? "+" : "−"}
                    {Math.abs(m.qty % 1) > 1e-9
                      ? Math.abs(m.qty).toFixed(3)
                      : Math.abs(m.qty)}
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

      {/* منتقي الصنف */}
      <ProductPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(p: ProductSearchItemDto | null) => {
          setProductId(p?.id ?? null);
          setProductLabel(p?.name ?? "كل الأصناف");
          setPage(1);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}

function ProductPickerSheet({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onPick: (p: ProductSearchItemDto | null) => void;
}) {
  const [q, setQ] = useState("");
  const { data } = useQuery<{ products: ProductSearchItemDto[] }>({
    queryKey: ["products-search", q],
    queryFn: () =>
      getJson<{ products: ProductSearchItemDto[] }>(
        `/api/products/search?q=${encodeURIComponent(q)}&limit=30`
      ),
    enabled: open,
  });
  const products = data?.products ?? [];

  return (
    <PosSheet open={open} onOpenChange={onOpenChange} title="فلترة بصنف">
      <div className="flex flex-col gap-2 pb-2">
        <SearchBar value={q} onChange={setQ} placeholder="ابحث عن اسم أو باركود…" autoFocus />
        <button
          type="button"
          onClick={() => onPick(null)}
          className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-[14px] font-bold text-foreground hover:bg-accent/30"
        >
          كل الأصناف
        </button>
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-start hover:border-primary/50 hover:bg-accent/30"
          >
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
              {p.name}
            </span>
            <span className="font-num shrink-0 text-[12.5px] text-muted-foreground" dir="ltr">
              {p.barcode}
            </span>
          </button>
        ))}
      </div>
    </PosSheet>
  );
}
