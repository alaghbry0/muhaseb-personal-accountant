"use client";

/**
 * منتقي أصناف بأسعار التكلفة (شاشة فاتورة الشراء/المرتجع الحر) — Task 3-a.
 * مثل منتقي شاشة البيع لكن يعرض التكلفة (بالعملة الأساسية) بدل سعر البيع.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, PackageX } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import type { ProductSearchResponse, ProductSearchItemDto } from "@/domain/dto";
import { PosSheet } from "@/components/pos/pos-sheet";
import { beep } from "@/components/pos/beep";
import { cn } from "@/lib/utils";
import { PrimaryButton } from "@/components/ds";

interface CostItemPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** السعر المعروض لكل صنف: cost (شراء) أو prices[currency] (مرتجع حر) */
  mode: "cost" | "sale"
  currencyCode?: string
  onAdd: (p: ProductSearchItemDto) => void
}

export function CostItemPicker({
  open,
  onOpenChange,
  mode,
  currencyCode,
  onAdd,
}: CostItemPickerProps) {
  return (
    <PosSheet
      open={open}
      onOpenChange={onOpenChange}
      title="اختر الصنف"
      description="ابحث بالاسم أو امسح الباركود — انقر الصنف لإضافته"
    >
      {open && (
        <CostItemPickerBody
          mode={mode}
          currencyCode={currencyCode}
          onAdd={onAdd}
          onClose={() => onOpenChange(false)}
        />
      )}
    </PosSheet>
  )
}

function CostItemPickerBody({
  mode,
  currencyCode,
  onAdd,
  onClose,
}: {
  mode: "cost" | "sale"
  currencyCode?: string
  onAdd: (p: ProductSearchItemDto) => void
  onClose: () => void
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [addedIds, setAddedIds] = useState<number[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 150);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading } = useQuery<ProductSearchResponse>({
    queryKey: ["products-search", debouncedQ, categoryId ?? "all"],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (categoryId) params.set("categoryId", String(categoryId));
      return getJson<ProductSearchResponse>(`/api/products/search?${params.toString()}`);
    },
    staleTime: 30_000,
  });

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];

  function handleAdd(p: ProductSearchItemDto) {
    onAdd(p);
    beep(1318, 0.09);
    setAddedIds((ids) => [...ids, p.id]);
  }

  return (
    <>
      <div className="sticky top-0 z-10 -mx-4 mt-1 bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 focus-within:border-primary/70">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث عن صنف… (الاسم أو الباركود)"
            autoFocus
            aria-label="بحث الأصناف"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none"
          />
        </div>
        <div className="scrollbar-slim mt-2 flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategoryId(null)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
              categoryId === null
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/30"
            )}
          >
            جميع الأصناف
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                categoryId === c.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/30"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-col gap-2 pt-1">
        {isLoading && products.length === 0 && (
          <p className="py-8 text-center text-[13px] text-muted-foreground">جارٍ البحث…</p>
        )}
        {!isLoading && products.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <PackageX className="size-8 text-muted-foreground" aria-hidden />
            <p className="text-[14px] text-foreground">لا توجد أصناف مطابقة</p>
          </div>
        )}
        {products.map((p) => {
          const price = mode === "cost" ? p.costPrice : (currencyCode ? p.prices[currencyCode] : undefined)
          const stockColor =
            p.totalStock <= 0
              ? "text-[#F87171] bg-[#F87171]/10 border-[#F87171]/30"
              : p.isLowStock
                ? "text-[#FBBF24] bg-[#FBBF24]/10 border-[#FBBF24]/30"
                : "text-[#34D399] bg-[#34D399]/10 border-[#34D399]/30"
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleAdd(p)}
              className={cn(
                "flex min-h-16 items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-start transition-colors",
                "hover:border-primary/50 hover:bg-accent/30 active:scale-[0.99]",
                addedIds.includes(p.id) && "border-[#34D399]/60 bg-[#34D399]/5"
              )}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-[14.5px] font-medium text-foreground">
                  {p.name}
                </span>
                <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className={cn("rounded-md border px-1.5 py-0.5 font-num", stockColor)}>
                    الرصيد: {formatAmount(p.totalStock, { decimals: 0, showSymbol: false })}
                  </span>
                  {p.unitName && <span>{p.unitName}</span>}
                </span>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="font-num text-[15px] font-bold text-primary">
                  {price != null ? formatAmount(price, { currency: mode === "cost" ? "YER" : currencyCode }) : "—"}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {mode === "cost" ? "التكلفة (ر.ي)" : "سعر البيع"}
                </span>
              </div>
            </button>
          )
        })}
      </div>

      <PrimaryButton block className="mt-3" onClick={onClose}>
        تم — {addedIds.length > 0 ? `أُضيف ${addedIds.length} صنفاً` : "إغلاق"}
      </PrimaryButton>
    </>
  )
}
