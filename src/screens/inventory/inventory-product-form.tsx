"use client";

/**
 * إضافة/تعديل صنف — دليل الشاشات 02/02 (FR-01-01):
 * اسم* + باركود (مع «توليد» EAN-13 تلقائي) + فئة (مع إدارة فئات) + وحدة قياس
 * + سعر التكلفة + أسعار البيع لكل عملة مفعّلة (باقتراح تلقائي من التكلفة والصرف)
 * + كمية افتتاحية ومخزنها + حد التنبيه الأدنى + ملاحظات.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Save, Sparkles, Plus, X, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { getJson, postJson, patchJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { generateEan13 } from "@/domain/inventory";
import type { BootstrapData as BootType } from "@/lib/types";
import { AppHeader, PrimaryButton, SectionTitle } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { cn } from "@/lib/utils";

interface CategoryRow {
  id: number;
  name: string;
  isArchived: boolean;
  productsCount: number;
}
interface UnitRow {
  id: number;
  name: string;
  factor: number;
  baseUnitName: string | null;
  isArchived: boolean;
  productsCount: number;
}

interface ProductDetailResponse {
  product: {
    id: number;
    name: string;
    barcode: string | null;
    categoryId: number | null;
    unitId: number | null;
    costPrice: number;
    minStock: number;
    notes: string | null;
    isArchived: boolean;
    prices: Array<{ currencyId: number; code: string; price: number }>;
  };
}

export default function InventoryProductFormScreen({
  id,
}: {
  id?: number | string;
}) {
  const editId = Number(id ?? 0);
  const isEdit = editId > 0;
  const { data: detail, isLoading } = useQuery<ProductDetailResponse>({
    queryKey: ["product", editId],
    queryFn: () => getJson<ProductDetailResponse>(`/api/products/${editId}`),
    enabled: isEdit,
  });

  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  if (isEdit && isLoading) {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader title="تعديل الصنف" />
        <p className="py-16 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
      </div>
    );
  }

  const product = detail?.product;
  return (
    <ProductFormBody
      key={isEdit ? `edit-${editId}-${product?.id ?? 0}` : "create"}
      isEdit={isEdit}
      editId={editId}
      boot={boot}
      initial={
        product
          ? {
              name: product.name,
              barcode: product.barcode ?? "",
              categoryId: product.categoryId,
              unitId: product.unitId,
              costPrice: String(product.costPrice || ""),
              minStock: String(product.minStock || ""),
              notes: product.notes ?? "",
              isArchived: product.isArchived,
              prices: Object.fromEntries(
                product.prices.map((pr) => [pr.code, String(pr.price || "")])
              ),
            }
          : undefined
      }
    />
  );
}

interface FormInitial {
  name: string;
  barcode: string;
  categoryId: number | null;
  unitId: number | null;
  costPrice: string;
  minStock: string;
  notes: string;
  isArchived: boolean;
  prices: Record<string, string>;
}

function ProductFormBody({
  isEdit,
  editId,
  boot,
  initial,
}: {
  isEdit: boolean;
  editId: number;
  boot: BootType | undefined;
  initial: FormInitial | undefined;
}) {
  const nav = useNav();
  const qc = useQueryClient();

  const [name, setName] = useState(initial?.name ?? "");
  const [barcode, setBarcode] = useState(initial?.barcode ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(initial?.categoryId ?? null);
  const [unitId, setUnitId] = useState<number | null>(initial?.unitId ?? null);
  const [costPrice, setCostPrice] = useState(initial?.costPrice ?? "");
  const [minStock, setMinStock] = useState(initial?.minStock ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [openingQty, setOpeningQty] = useState("");
  const [openingWarehouseId, setOpeningWarehouseId] = useState<number | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>(initial?.prices ?? {});
  const [saving, setSaving] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  const { data: catsData } = useQuery<{ categories: CategoryRow[] }>({
    queryKey: ["categories"],
    queryFn: () => getJson<{ categories: CategoryRow[] }>("/api/categories"),
  });
  const { data: unitsData } = useQuery<{ units: UnitRow[] }>({
    queryKey: ["units"],
    queryFn: () => getJson<{ units: UnitRow[] }>("/api/units"),
  });

  const allCurrencies = boot?.currencies ?? [];
  const activeCats = (catsData?.categories ?? []).filter((c) => !c.isArchived);
  const activeUnits = (unitsData?.units ?? []).filter((u) => !u.isArchived);
  const warehouses = boot?.warehouses ?? [];

  const cost = Number(costPrice) || 0;
  /** اقتراح سعر البيع: التكلفة + هامش 20% محوّلاً بسعر اليوم */
  const suggestPrice = (code: string): number => {
    const rate = code === boot?.baseCurrency?.code ? 1 : boot?.rates?.[code]?.rate ?? 1;
    return Math.round((cost * 1.2) / (rate || 1));
  };

  async function addCategory() {
    const trimmed = newCatName.trim();
    if (!trimmed) return;
    try {
      await postJson("/api/categories", { name: trimmed });
      toast.success(`تمت إضافة الفئة «${trimmed}»`);
      setNewCatName("");
      qc.invalidateQueries({ queryKey: ["categories"] });
    } catch {
      /* toast من api */
    }
  }

  async function save(archive = false) {
    if (!name.trim()) {
      toast.error("اسم الصنف إلزامي");
      return;
    }
    setSaving(true);
    try {
      const pricesOut: Record<string, number> = {};
      for (const c of allCurrencies) {
        const v = Number(prices[c.code]);
        if (prices[c.code] !== "" && Number.isFinite(v) && v >= 0) pricesOut[c.code] = v;
      }
      const payload: Record<string, unknown> = {
        name: name.trim(),
        barcode: barcode.trim() || null,
        categoryId,
        unitId,
        costPrice: cost,
        minStock: Number(minStock) || 0,
        notes: notes.trim() || null,
        prices: pricesOut,
        ...(archive ? { isArchived: true } : {}),
        ...(initial?.isArchived && !archive ? { isArchived: false } : {}),
      };
      if (!isEdit) {
        payload.openingQty = Number(openingQty) || 0;
        payload.openingWarehouseId = openingWarehouseId;
      }
      const result = isEdit
        ? await patchJson<{ productId: number }>(`/api/products/${editId}`, payload)
        : await postJson<{ productId: number; barcode: string | null }>("/api/products", payload);
      toast.success(isEdit ? "تم حفظ تعديلات الصنف" : `تم حفظ الصنف${result.barcode ? ` — باركود ${result.barcode}` : ""}`);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["product"] });
      if (isEdit) nav.pop();
      else nav.replace("inventory-product-card", { productId: result.productId });
    } catch {
      /* toast من api */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title={isEdit ? "تعديل الصنف" : "إضافة صنف جديد"} />
      <div className="flex flex-col gap-3 p-3 pb-8">
        {/* الأساسيات */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <SectionTitle className="mb-2">بيانات الصنف</SectionTitle>
          <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="p-name">
            اسم الصنف *
          </label>
          <input
            id="p-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: حليب بودرة 900 جرام"
            className="mb-3 h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />

          <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="p-barcode">
            الباركود (اتركه فارغاً للتوليد التلقائي)
          </label>
          <div className="mb-3 flex gap-2">
            <input
              id="p-barcode"
              type="text"
              dir="ltr"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value.replace(/[^\d-]/g, ""))}
              placeholder="628…"
              className="font-num h-12 min-w-0 flex-1 rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
            />
            <button
              type="button"
              onClick={() => setBarcode(generateEan13(Date.now()))}
              aria-label="توليد باركود"
              className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-4 text-[13.5px] font-bold text-primary hover:bg-primary/20 active:scale-95"
            >
              <Sparkles className="size-4" aria-hidden /> توليد
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="p-cat">
                الفئة
              </label>
              <div className="flex gap-1.5">
                <select
                  id="p-cat"
                  value={categoryId ?? ""}
                  onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
                  className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-muted/60 px-2 text-[14px] text-foreground outline-none focus:border-primary/70"
                >
                  <option value="">بدون فئة</option>
                  {activeCats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCatsOpen(true)}
                  aria-label="إدارة الفئات"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 text-muted-foreground hover:bg-accent/40"
                >
                  <Plus className="size-5" aria-hidden />
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="p-unit">
                وحدة القياس
              </label>
              <select
                id="p-unit"
                value={unitId ?? ""}
                onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}
                className="h-12 w-full rounded-xl border border-border bg-muted/60 px-2 text-[14px] text-foreground outline-none focus:border-primary/70"
              >
                <option value="">بدون</option>
                {activeUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.baseUnitName ? ` (×${u.factor} ${u.baseUnitName})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="p-cost">
            سعر التكلفة (بالعملة الأساسية — ر.ي)
          </label>
          <input
            id="p-cost"
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={costPrice}
            onChange={(e) => setCostPrice(e.target.value)}
            placeholder="0"
            className="font-num mb-3 h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />

          <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="p-min">
            حد التنبيه الأدنى (بوحدة الأساس)
          </label>
          <input
            id="p-min"
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={minStock}
            onChange={(e) => setMinStock(e.target.value)}
            placeholder="0"
            className="font-num h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />
        </div>

        {/* أسعار البيع */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <SectionTitle className="mb-1">أسعار البيع</SectionTitle>
          <p className="mb-3 text-[12.5px] text-muted-foreground">
            سعر لكل عملة مفعّلة — زر «اقترح» يحسب من التكلفة + هامش 20% بسعر صرف اليوم
          </p>
          <div className="flex flex-col gap-2">
            {allCurrencies.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span className={cn(
                  "w-14 shrink-0 rounded-lg border px-2 py-1.5 text-center text-[12.5px] font-bold",
                  c.isBase ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                )}>
                  {c.code}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  value={prices[c.code] ?? ""}
                  onChange={(e) => setPrices((p) => ({ ...p, [c.code]: e.target.value }))}
                  placeholder={c.isBase ? "سعر البيع بالأساس" : `سعر البيع بـ ${c.code}`}
                  aria-label={`سعر البيع بعملة ${c.code}`}
                  className="font-num h-12 min-w-0 flex-1 rounded-xl border border-border bg-muted/60 px-3 text-[15px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
                />
                <button
                  type="button"
                  onClick={() =>
                    setPrices((p) => ({ ...p, [c.code]: String(suggestPrice(c.code)) }))
                  }
                  aria-label={`اقتراح سعر ${c.code}`}
                  className="flex h-12 shrink-0 items-center gap-1 rounded-xl border border-[#22D3EE]/40 bg-[#22D3EE]/10 px-3 text-[12.5px] font-bold text-[#22D3EE] hover:bg-[#22D3EE]/20 active:scale-95"
                >
                  <Sparkles className="size-3.5" aria-hidden /> اقترح
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* الافتتاحي (إنشاء فقط) */}
        {!isEdit && (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <SectionTitle className="mb-1">الكمية الافتتاحية</SectionTitle>
            <p className="mb-3 text-[12.5px] text-muted-foreground">
              تُسجَّل كحركة افتتاحية في المخزن المحدد — يمكن تركها صفراً وإدخالها بفاتورة شراء
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="p-qty">
                  الكمية
                </label>
                <input
                  id="p-qty"
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  value={openingQty}
                  onChange={(e) => setOpeningQty(e.target.value)}
                  placeholder="0"
                  className="font-num h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
                />
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="p-wh">
                  المخزن
                </label>
                <select
                  id="p-wh"
                  value={openingWarehouseId ?? ""}
                  onChange={(e) => setOpeningWarehouseId(e.target.value ? Number(e.target.value) : null)}
                  className="h-12 w-full rounded-xl border border-border bg-muted/60 px-2 text-[14px] text-foreground outline-none focus:border-primary/70"
                >
                  <option value="">اختر المخزن</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ملاحظات */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <SectionTitle className="mb-2">ملاحظات</SectionTitle>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="ملاحظات إضافية عن الصنف…"
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-muted/60 px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />
        </div>

        {/* أزرار */}
        <PrimaryButton block variant="success" loading={saving} onClick={() => save(false)}>
          <Save className="size-5" aria-hidden /> {isEdit ? "حفظ التعديلات" : "حفظ البيانات"}
        </PrimaryButton>
        {isEdit && initial && !initial.isArchived && (
          <PrimaryButton block variant="outline" onClick={() => save(true)}>
            <Archive className="size-5" aria-hidden /> أرشفة الصنف
          </PrimaryButton>
        )}
        {isEdit && initial?.isArchived && (
          <PrimaryButton block variant="outline" onClick={() => save(false)}>
            <ArchiveRestore className="size-5" aria-hidden /> الصنف مؤرشف — حفظ للاستعادة
          </PrimaryButton>
        )}
        <PrimaryButton block variant="ghost" onClick={() => nav.pop()}>
          <X className="size-5" aria-hidden /> إلغاء
        </PrimaryButton>
        {isEdit && (
          <p className="text-center text-[12px] text-muted-foreground">
            <Pencil className="ms-0.5 me-1 inline size-3.5" aria-hidden />
            التكلفة تُحدَّث تلقائياً بالمتوسط المرجّح عند الشراء — التعديل اليدوي يتجاوز ذلك
          </p>
        )}
      </div>

      {/* لوحة إدارة الفئات السريعة */}
      <PosSheet open={catsOpen} onOpenChange={setCatsOpen} title="إدارة الفئات" description="أضف فئة جديدة أو انقر لإلغاء الأرشفة">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="اسم الفئة الجديدة"
              className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
            />
            <button
              type="button"
              onClick={addCategory}
              aria-label="إضافة فئة"
              className="flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-[14px] font-bold text-primary-foreground hover:bg-primary/90 active:scale-95"
            >
              <Plus className="size-4" aria-hidden /> إضافة
            </button>
          </div>
          <div className="flex flex-col">
            {(catsData?.categories ?? []).map((c) => (
              <div
                key={c.id}
                className="flex min-h-12 items-center justify-between border-b border-border/50 px-2 py-2 text-[14px]"
              >
                <span className={c.isArchived ? "text-muted-foreground line-through" : "text-foreground"}>
                  {c.name}
                </span>
                <span className="font-num text-[12px] text-muted-foreground">
                  {formatAmount(c.productsCount, { decimals: 0, showSymbol: false })} صنفاً
                </span>
              </div>
            ))}
          </div>
        </div>
      </PosSheet>
    </div>
  );
}
