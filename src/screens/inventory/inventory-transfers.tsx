"use client";

/**
 * تحويل المخازن (FR-01-09) — نموذج: من مخزن → إلى مخزن + منتقي صنف (بحث)
 * + كمية + ملاحظة → حفظ ذرّي (حركتا خروج/دخول) + سجل التحويلات السابقة.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeftRight, Loader2, PackageSearch, ArrowLeft, ArrowRight, X,
} from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDateDisplay } from "@/lib/format";
import type { ProductSearchItemDto } from "@/domain/dto";
import type { BootstrapData as BootType } from "@/lib/types";
import { AppHeader, ListRow, PrimaryButton, EmptyState, SectionTitle, SearchBar } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { CostItemPicker } from "@/components/inventory/cost-item-picker";
import { cn } from "@/lib/utils";

interface TransfersResponse {
  transfers: Array<{
    id: number;
    movedAt: string;
    productId: number;
    productName: string;
    unitName: string | null;
    qty: number;
    fromWarehouse: string;
    toWarehouse: string;
    notes: string | null;
  }>;
}

export default function InventoryTransfersScreen() {
  const qc = useQueryClient();
  const [fromWarehouseId, setFromWarehouseId] = useState<number | null>(null);
  const [toWarehouseId, setToWarehouseId] = useState<number | null>(null);
  const [product, setProduct] = useState<ProductSearchItemDto | null>(null);
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });
  const { data: transfersData, isLoading } = useQuery<TransfersResponse>({
    queryKey: ["stock", "transfers"],
    queryFn: () => getJson<TransfersResponse>("/api/stock/transfers"),
  });

  const warehouses = boot?.warehouses ?? [];
  const transfers = transfersData?.transfers ?? [];
  const fromStock = product && fromWarehouseId
    ? product.stockByWarehouse.find((w) => w.warehouseId === fromWarehouseId)?.qty ?? 0
    : 0;

  async function submit() {
    if (!fromWarehouseId || !toWarehouseId) {
      toast.error("اختر مخزن المصدر ومخزن الوجهة");
      return;
    }
    if (!product) {
      toast.error("اختر الصنف المراد تحويله");
      return;
    }
    if (!(Number(qty) > 0)) {
      toast.error("أدخل كمية صحيحة أكبر من صفر");
      return;
    }
    setBusy(true);
    try {
      await postJson("/api/stock/transfer", {
        productId: product.id,
        fromWarehouseId,
        toWarehouseId,
        qty: Number(qty),
        notes: notes.trim() || null,
      });
      toast.success(
        `تم تحويل ${formatAmount(Number(qty), { decimals: 3, showSymbol: false })} ${product.unitName ?? ""} من «${warehouses.find((w) => w.id === fromWarehouseId)?.name}» إلى «${warehouses.find((w) => w.id === toWarehouseId)?.name}»`
      );
      setProduct(null);
      setQty("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["stock", "transfers"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="تحويل المخازن" />

      <div className="flex flex-1 flex-col gap-3 p-3 pb-8">
        {/* المصدر والوجهة */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <SectionTitle className="mb-2">من مخزن → إلى مخزن</SectionTitle>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[12.5px] font-medium text-muted-foreground" htmlFor="t-from">
                المصدر
              </label>
              <select
                id="t-from"
                value={fromWarehouseId ?? ""}
                onChange={(e) => setFromWarehouseId(e.target.value ? Number(e.target.value) : null)}
                className="h-12 w-full rounded-xl border border-border bg-muted/60 px-2 text-[14px] text-foreground outline-none focus:border-primary/70"
              >
                <option value="">اختر</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <ArrowLeft className="mt-6 size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-[12.5px] font-medium text-muted-foreground" htmlFor="t-to">
                الوجهة
              </label>
              <select
                id="t-to"
                value={toWarehouseId ?? ""}
                onChange={(e) => setToWarehouseId(e.target.value ? Number(e.target.value) : null)}
                className="h-12 w-full rounded-xl border border-border bg-muted/60 px-2 text-[14px] text-foreground outline-none focus:border-primary/70"
              >
                <option value="">اختر</option>
                {warehouses
                  .filter((w) => w.id !== fromWarehouseId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
              </select>
            </div>
          </div>
        </div>

        {/* الصنف */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <SectionTitle className="mb-2">الصنف</SectionTitle>
          {product ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-bold text-foreground">{product.name}</p>
                <p className="font-num text-[12.5px] text-muted-foreground">
                  الرصيد في المصدر: {formatAmount(fromStock, { decimals: 3, showSymbol: false })}{" "}
                  {product.unitName ?? ""} • الكلي: {formatAmount(product.totalStock, { decimals: 0, showSymbol: false })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProduct(null)}
                aria-label="إزالة الصنف"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/40 hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <PrimaryButton block variant="outline" onClick={() => setPickerOpen(true)}>
              <PackageSearch className="size-5" aria-hidden /> اختيار صنف (بحث/باركود)
            </PrimaryButton>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="t-qty">
                الكمية
              </label>
              <input
                id="t-qty"
                type="number"
                inputMode="decimal"
                dir="ltr"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="0"
                className="font-num h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="t-notes">
                ملاحظة (اختياري)
              </label>
              <input
                id="t-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="سبب التحويل…"
                className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
              />
            </div>
          </div>
          {product && fromWarehouseId && Number(qty) > fromStock + 1e-6 && (
            <p className="mt-2 text-[13px] text-[#F87171]">
              الكمية تتجاوز رصيد المصدر — المتوفر: {formatAmount(fromStock, { decimals: 3, showSymbol: false })}
            </p>
          )}
        </div>

        <PrimaryButton
          block
          variant="primary"
          loading={busy}
          disabled={!product || !fromWarehouseId || !toWarehouseId}
          onClick={submit}
        >
          <ArrowLeftRight className="size-5" aria-hidden /> تنفيذ التحويل
        </PrimaryButton>

        {/* سجل التحويلات */}
        <div className="rounded-2xl border border-border/60 bg-card p-0">
          <div className="p-4 pb-2">
            <SectionTitle>سجل التحويلات</SectionTitle>
          </div>
          {isLoading ? (
            <p className="flex items-center justify-center gap-2 px-4 pb-4 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden /> جارٍ التحميل…
            </p>
          ) : transfers.length === 0 ? (
            <div className="px-4 pb-4">
              <EmptyState icon={ArrowLeftRight} message="لا تحويلات بعد" hint="نفّذ أول تحويل بين مخزنين" />
            </div>
          ) : (
            <div className="flex flex-col">
              {transfers.map((t) => (
                <ListRow
                  key={t.id}
                  onClick={() => {}}
                  leading={
                    <span className="flex size-11 items-center justify-center rounded-xl bg-[#22D3EE]/10 text-[#22D3EE]">
                      <ArrowLeftRight className="size-5" aria-hidden />
                    </span>
                  }
                  title={<span className="text-[14.5px]">{t.productName}</span>}
                  subtitle={
                    <span className="font-num">
                      {formatDateDisplay(t.movedAt)} • {t.fromWarehouse} ← {t.toWarehouse}
                    </span>
                  }
                  trailing={
                    <span className="font-num text-[15px] font-extrabold text-foreground">
                      {formatAmount(t.qty, { decimals: t.qty % 1 ? 3 : 0, showSymbol: false })}
                      {t.unitName ? ` ${t.unitName}` : ""}
                    </span>
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <CostItemPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode="cost"
        onAdd={(p) => {
          setProduct(p);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
