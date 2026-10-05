"use client";

/**
 * الجرد الذكي (FR-01-08) — اختر المخزن → الرصيد الدفتري + إدخال الفعلي لكل صنف
 * → مراجعة الفروقات (كمية وقيمة بالتكلفة) → اعتماد الجرد (تسويات ذرّية)
 * + سجل جلسات الجرد السابقة.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ClipboardList, ClipboardCheck, Loader2, CheckCircle2, History } from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDate } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { ProductSearchItemDto } from "@/domain/dto";
import type { BootstrapData as BootType } from "@/lib/types";
import {
  AppHeader, ListRow, PrimaryButton, EmptyState, SectionTitle, StatusChip, AmountText,
} from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { cn } from "@/lib/utils";

interface StocktakeListResponse {
  stocktakes: Array<{
    id: number;
    countedAt: string;
    warehouseName: string;
    totalDiff: number;
    linesCount: number;
    notes: string | null;
  }>;
}

export default function InventoryStocktakeScreen() {
  const nav = useNav();
  const qc = useQueryClient();
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });
  const { data: productsData } = useQuery<{ products: ProductSearchItemDto[] }>({
    queryKey: ["products", "stocktake-pool"],
    queryFn: () => getJson<{ products: ProductSearchItemDto[] }>("/api/products?pageSize=200"),
  });
  const { data: sessionsData } = useQuery<StocktakeListResponse>({
    queryKey: ["stock", "stocktakes"],
    queryFn: () => getJson<StocktakeListResponse>("/api/stock/stocktake"),
  });

  const warehouses = boot?.warehouses ?? [];
  const products = productsData?.products ?? [];
  const sessions = sessionsData?.stocktakes ?? [];

  /** الأصناف ذات الرصيد في المخزن المحدد (أو الكل إن لم يُحدد) */
  const pool = useMemo(() => {
    if (!warehouseId) return [];
    return products.filter((p) =>
      p.stockByWarehouse.some((w) => w.warehouseId === warehouseId && w.qty > 0)
    );
  }, [products, warehouseId]);

  const bookQty = (p: ProductSearchItemDto): number =>
    p.stockByWarehouse.find((w) => w.warehouseId === warehouseId)?.qty ?? 0;

  /** بنود الفروقات: الأصناف التي أُدخل لها فعلي مختلف عن الدفتري */
  const diffs = useMemo(() => {
    return pool
      .map((p) => {
        const raw = counts[p.id];
        const counted = raw === "" || raw == null ? null : Number(raw);
        const book = bookQty(p);
        return counted == null || !Number.isFinite(counted) || counted < 0
          ? null
          : { product: p, book, counted, diff: Math.round((counted - book) * 1000) / 1000 };
      })
      .filter((x): x is { product: ProductSearchItemDto; book: number; counted: number; diff: number } =>
        x != null && Math.abs(x.diff) > 1e-6
      );
  }, [pool, counts, warehouseId]);

  const enteredCount = Object.values(counts).filter((v) => v !== "" && v != null).length;
  const totalDiffValue = diffs.reduce(
    (s, d) => s + d.diff * d.product.costPrice,
    0
  );

  async function submit() {
    if (!warehouseId || diffs.length === 0) return;
    setBusy(true);
    try {
      const result = await postJson<{ stocktakeId: number; linesCount: number; totalDiff: number }>(
        "/api/stock/stocktake",
        {
          warehouseId,
          notes: `جرد ${warehouses.find((w) => w.id === warehouseId)?.name ?? ""}`,
          lines: diffs.map((d) => ({ productId: d.product.id, countedQty: d.counted })),
        }
      );
      toast.success(
        `تم اعتماد الجرد — ${result.linesCount} تسوية، قيمة الفرق ${formatAmount(result.totalDiff, { currency: "YER", decimals: 0 })}`
      );
      setCounts({});
      setReviewOpen(false);
      qc.invalidateQueries({ queryKey: ["stock", "stocktakes"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      nav.replace("inventory-movements", { productId: diffs[0].product.id });
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="الجرد الذكي" />

      <div className="flex flex-1 flex-col gap-3 p-3 pb-8">
        {/* اختيار المخزن */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <SectionTitle className="mb-2">المخزن</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {warehouses.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWarehouseId(w.id)}
                className={cn(
                  "rounded-xl border px-4 py-2.5 text-[14px] font-bold transition-colors",
                  warehouseId === w.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}
              >
                {w.name}
              </button>
            ))}
          </div>
        </div>

        {!warehouseId ? (
          <EmptyState
            icon={ClipboardList}
            message="اختر مخزناً لبدء الجرد"
            hint="تُعرض الأصناف ذات الأرصدة مع رصيدها الدفتري لتعديد الرصيد الفعلي"
          />
        ) : pool.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            message="لا أصناف ذات رصيد في هذا المخزن"
            hint="جرّب مخزناً آخر أو أضف أصنافاً بفواتير شراء"
          />
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2">
              <span className="text-[12.5px] text-muted-foreground">
                عُدِّد <span className="font-num font-bold text-foreground">{enteredCount}</span> من{" "}
                <span className="font-num font-bold text-foreground">{pool.length}</span> صنفاً —
                الفروقات: <span className="font-num font-bold text-[#FBBF24]">{diffs.length}</span>
              </span>
            </div>
            <div className="flex flex-col">
              {pool.map((p) => {
                const book = bookQty(p);
                const raw = counts[p.id] ?? "";
                const counted = raw === "" ? null : Number(raw);
                const diff = counted != null && Number.isFinite(counted)
                  ? Math.round((counted - book) * 1000) / 1000
                  : null;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 border-b border-border/60 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-medium text-foreground">{p.name}</p>
                      <p className="font-num text-[12.5px] text-muted-foreground">
                        دفتري: {formatAmount(book, { decimals: book % 1 ? 3 : 0, showSymbol: false })}
                        {p.unitName ? ` ${p.unitName}` : ""}
                        {diff != null && Math.abs(diff) > 1e-6 && (
                          <span className={diff > 0 ? "text-[#34D399]" : "text-[#F87171]"}>
                            {" "}({diff > 0 ? "+" : "−"}
                            {formatAmount(Math.abs(diff), { decimals: 3, showSymbol: false })})
                          </span>
                        )}
                      </p>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      dir="ltr"
                      value={raw}
                      onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                      placeholder={String(book)}
                      aria-label={`الرصيد الفعلي لـ ${p.name}`}
                      className="font-num h-12 w-24 shrink-0 rounded-xl border border-border bg-muted/60 px-2 text-center text-[15px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 outline-none focus:border-primary/70"
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* سجل جلسات الجرد */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <SectionTitle className="mb-2">
            <span className="flex items-center gap-1.5">
              <History className="size-4 text-muted-foreground" aria-hidden /> جلسات الجرد السابقة
            </span>
          </SectionTitle>
          {sessions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">لا جلسات جرد بعد</p>
          ) : (
            <div className="flex flex-col">
              {sessions.slice(0, 10).map((s) => (
                <ListRow
                  key={s.id}
                  onClick={() => nav.push("inventory-movements", { type: "adjustment" })}
                  title={
                    <span className="flex items-center gap-2">
                      <span className="text-[14px]">{s.warehouseName}</span>
                      <StatusChip status={s.totalDiff < 0 ? "due" : "completed"} label={s.totalDiff < 0 ? "نقص" : "زيادة"} />
                    </span>
                  }
                  subtitle={
                    <span className="font-num">
                      {formatDate(s.countedAt)} • {s.linesCount} تسوية
                    </span>
                  }
                  trailing={
                    <AmountText
                      value={s.totalDiff}
                      currency="YER"
                      size="sm"
                      variant={s.totalDiff < 0 ? "neg" : "pos"}
                    />
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* زر الاعتماد */}
      {warehouseId && diffs.length > 0 && (
        <div className="sticky bottom-0 border-t border-border/60 bg-card/95 p-3 backdrop-blur">
          <PrimaryButton block variant="warning" onClick={() => setReviewOpen(true)}>
            <ClipboardCheck className="size-5" aria-hidden /> مراجعة الفروقات ({diffs.length})
          </PrimaryButton>
        </div>
      )}

      {/* لوحة المراجعة والاعتماد */}
      <PosSheet
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title="مراجعة فروقات الجرد"
        description="قيمة الفرق محسوبة بالتكلفة (المتوسط المرجّح)"
      >
        <div className="flex flex-col gap-2 pb-2">
          {diffs.map((d) => (
            <div
              key={d.product.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-foreground">{d.product.name}</p>
                <p className="font-num text-[12px] text-muted-foreground">
                  دفتري {formatAmount(d.book, { decimals: 3, showSymbol: false })} → فعلي{" "}
                  {formatAmount(d.counted, { decimals: 3, showSymbol: false })}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className={cn(
                  "font-num text-[15px] font-extrabold",
                  d.diff > 0 ? "text-[#34D399]" : "text-[#F87171]"
                )} dir="ltr">
                  {d.diff > 0 ? "+" : "−"}
                  {formatAmount(Math.abs(d.diff), { decimals: 3, showSymbol: false })}
                </p>
                <p className="font-num text-[11.5px] text-muted-foreground">
                  {formatAmount(d.diff * d.product.costPrice, { currency: "YER" })}
                </p>
              </div>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between rounded-xl border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-3 py-3">
            <span className="text-[14px] font-bold text-[#FBBF24]">إجمالي قيمة الفرق</span>
            <AmountText value={totalDiffValue} currency="YER" size="lg" variant={totalDiffValue < 0 ? "neg" : "pos"} />
          </div>
          <PrimaryButton block variant="success" loading={busy} onClick={submit}>
            <CheckCircle2 className="size-5" aria-hidden /> اعتماد الجرد ({diffs.length} تسوية)
          </PrimaryButton>
        </div>
      </PosSheet>
    </div>
  );
}
