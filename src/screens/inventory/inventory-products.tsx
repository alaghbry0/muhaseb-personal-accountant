"use client";

/**
 * الأصناف المتوفرة (جذر تبويب المخزون) — دليل الشاشات 02/03:
 * بحث بالاسم/الباركود + رقائق فئات + فلتر مخزن + إحصائيات (عدد الأصناف وقيمة
 * المخزون بالتكلفة) + صفوف الأصناف (باركود + شارة رصيد + سعر) + FAB صنف جديد
 * + أدوات إدارة المخزن (الجرد/التحويلات/التنبيهات/الحركات/المرجعيات).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, PackageSearch, AlertTriangle, ArrowLeftRight, ClipboardList,
  History, Tags, Ruler, Warehouse as WarehouseIcon, Boxes,
} from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { ProductSearchItemDto } from "@/domain/dto";
import type { BootstrapData as BootType } from "@/lib/types";
import {
  AppHeader, ListRow, SearchBar, EmptyState, StatTile,
} from "@/components/ds";
import { cn } from "@/lib/utils";

interface ProductsResponse {
  products: ProductSearchItemDto[];
  total: number;
  page: number;
  pages: number;
  stats: { productsCount: number; stockValueBase: number; lowStockCount: number };
}

const TOOLS = [
  { screen: "inventory-alerts", label: "تنبيهات المخزون", icon: AlertTriangle, color: "#FBBF24" },
  { screen: "inventory-stocktake", label: "الجرد الذكي", icon: ClipboardList, color: "#34D399" },
  { screen: "inventory-transfers", label: "تحويل المخازن", icon: ArrowLeftRight, color: "#22D3EE" },
  { screen: "inventory-movements", label: "سجل الحركات", icon: History, color: "#94A3B8" },
  { screen: "inventory-categories", label: "الفئات", icon: Tags, color: "#F472B6" },
  { screen: "inventory-units", label: "الوحدات", icon: Ruler, color: "#A78BFA" },
  { screen: "inventory-warehouses", label: "المخازن", icon: WarehouseIcon, color: "#FDBA74" },
] as const;

export default function InventoryProductsScreen() {
  const { push } = useNav();
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);

  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (categoryId) params.set("categoryId", String(categoryId));
    if (warehouseId) params.set("warehouseId", String(warehouseId));
    return `/api/products?${params.toString()}`;
  }, [q, categoryId, warehouseId]);

  const { data, isLoading } = useQuery<ProductsResponse>({
    queryKey: ["products", "list", url],
    queryFn: () => getJson<ProductsResponse>(url),
  });

  const { data: searchData } = useQuery<{ categories: Array<{ id: number; name: string }> }>({
    queryKey: ["products-search", ""],
    queryFn: () =>
      getJson<{ categories: Array<{ id: number; name: string }> }>(
        "/api/products/search?limit=1"
      ),
    staleTime: 60_000,
  });

  const products = data?.products ?? [];
  const categories = searchData?.categories ?? [];
  const warehouses = boot?.warehouses ?? [];
  const stats = data?.stats;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="الأصناف المتوفرة في المخزن"
        action={
          <button
            type="button"
            onClick={() => push("inventory-product-form")}
            aria-label="صنف جديد"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3">
          <SearchBar
            value={q}
            onChange={setQ}
            placeholder="ابحث عن اسم أو باركود…"
          />
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                categoryId === null
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/30"
              )}
            >
              كل الفئات
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                  categoryId === c.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setWarehouseId(null)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                warehouseId === null
                  ? "border-[#22D3EE]/60 bg-[#22D3EE]/10 text-[#22D3EE]"
                  : "border-border/70 text-muted-foreground hover:bg-accent/30"
              )}
            >
              <Boxes className="size-3.5" aria-hidden /> كل المخازن
            </button>
            {warehouses.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWarehouseId(warehouseId === w.id ? null : w.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                  warehouseId === w.id
                    ? "border-[#22D3EE]/60 bg-[#22D3EE]/10 text-[#22D3EE]"
                    : "border-border/70 text-muted-foreground hover:bg-accent/30"
                )}
              >
                {w.name}
              </button>
            ))}
          </div>
        </div>
      </AppHeader>

      <div className="flex-1 px-3">
        {/* إحصائيات الرأس */}
        <div className="mb-3 grid grid-cols-3 gap-2">
          <StatTile
            title="عدد الأصناف"
            amount={stats?.productsCount ?? 0}
            plain
            loading={!stats}
          />
          <StatTile
            title="قيمة المخزون"
            amount={stats?.stockValueBase ?? 0}
            hint="بالتكلفة — ر.ي"
            plain
            loading={!stats}
          />
          <button
            type="button"
            onClick={() => push("inventory-alerts")}
            aria-label="أصناف تنفذ قريباً"
            className="flex flex-col justify-between rounded-2xl border border-[#FBBF24]/30 bg-[#FBBF24]/10 p-3 text-start transition-colors hover:bg-[#FBBF24]/20"
          >
            <span className="text-[12px] font-medium text-[#FBBF24]/90">تحت الحد الأدنى</span>
            <span className="font-num text-[20px] font-extrabold text-[#FBBF24]">
              {stats?.lowStockCount ?? 0}
            </span>
          </button>
        </div>

        {/* أدوات إدارة المخزن */}
        <div className="scrollbar-slim mb-3 flex gap-2 overflow-x-auto pb-1">
          {TOOLS.map((t) => (
            <button
              key={t.screen}
              type="button"
              onClick={() => push(t.screen)}
              className="flex shrink-0 flex-col items-center gap-1.5 rounded-2xl border border-border/70 bg-card px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent/30 active:scale-95"
              style={{ minWidth: 88 }}
            >
              <span
                className="flex size-9 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${t.color}1F`, color: t.color }}
              >
                <t.icon className="size-5" aria-hidden />
              </span>
              <span className="text-[11.5px] font-bold text-foreground">{t.label}</span>
            </button>
          ))}
        </div>

        {/* القائمة */}
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الأصناف…</p>
        ) : products.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            message={q ? "لا توجد أصناف مطابقة" : "لا أصناف بعد"}
            hint={q ? "جرّب كلمة بحث أخرى أو غيّر الفئة/المخزن" : "أضف أول صنف لتبدأ البيع والشراء"}
            actionLabel="صنف جديد"
            onAction={() => push("inventory-product-form")}
          />
        ) : (
          <div className="flex flex-col">
            {products.map((p) => {
              const stockQty = warehouseId
                ? p.stockByWarehouse.find((w) => w.warehouseId === warehouseId)?.qty ?? 0
                : p.totalStock;
              const low = stockQty < p.minStock;
              const stockColor = stockQty <= 0
                ? "text-[#F87171] bg-[#F87171]/10 border-[#F87171]/30"
                : low
                  ? "text-[#FBBF24] bg-[#FBBF24]/10 border-[#FBBF24]/30"
                  : "text-[#34D399] bg-[#34D399]/10 border-[#34D399]/30";
              return (
                <ListRow
                  key={p.id}
                  onClick={() => push("inventory-product-card", { productId: p.id })}
                  leading={
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Boxes className="size-5" aria-hidden />
                    </span>
                  }
                  title={
                    <span className="flex items-center gap-2">
                      {p.name}
                      {p.isLowStock && (
                        <AlertTriangle className="size-4 shrink-0 text-[#FBBF24]" aria-label="تحت الحد الأدنى" />
                      )}
                    </span>
                  }
                  subtitle={
                    <span className="flex items-center gap-2">
                      {p.barcode && (
                        <span className="font-num text-[11.5px] tracking-wide text-muted-foreground" dir="ltr">
                          {p.barcode}
                        </span>
                      )}
                      {p.categoryName && (
                        <span className="text-[11.5px] text-muted-foreground">• {p.categoryName}</span>
                      )}
                    </span>
                  }
                  trailing={
                    <span className="flex flex-col items-end gap-1">
                      <span className={cn("rounded-md border px-2 py-0.5 font-num text-[12.5px] font-bold", stockColor)}>
                        {formatAmount(stockQty, { decimals: stockQty % 1 ? 3 : 0, showSymbol: false })}
                        {p.unitName ? ` ${p.unitName}` : ""}
                      </span>
                      <span className="font-num text-[13px] font-bold text-foreground">
                        {formatAmount(p.prices["YER"] ?? 0, { currency: "YER" })}
                      </span>
                    </span>
                  }
                />
              );
            })}
            {data && data.pages > 1 && (
              <p className="font-num py-3 text-center text-[12.5px] text-muted-foreground">
                صفحة {data.page} من {data.pages}
              </p>
            )}
          </div>
        )}
      </div>

      {/* FAB صنف جديد */}
      <button
        type="button"
        onClick={() => push("inventory-product-form")}
        aria-label="صنف جديد"
        className="bg-gradient-cyan fixed bottom-24 end-4 z-20 flex h-14 items-center gap-2 rounded-2xl px-5 text-[15px] font-extrabold text-[#06202B] shadow-[0_6px_20px_rgba(34,211,238,0.45)] transition-transform hover:scale-105 active:scale-95"
      >
        <Plus className="size-5" aria-hidden /> صنف جديد
      </button>
      <div className="h-6" />
    </div>
  );
}
