"use client";

/**
 * بطاقة صنف — رأس (اسم + شارة فئة) + قسم الباركود (SVG Code128 + نسخ + طباعة ملصقات)
 * + شبكة أرصدة لكل مخزن + بطاقات أسعار البيع لكل عملة + التكلفة (WAC) + مبيعات 30 يوماً
 * + آخر 10 حركات + إجراءات: تعديل / أرشفة / جرد سريع.
 * لوحة «طباعة الملصقات»: منتقي صيغة (A4 / حراري 58مم / حراري 80مم) + منتقي رمز
 * (Code128 / QR معاين حياً) + معاينة ملصق بنسب الصيغة (Task 10-a).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy, Pencil, Archive, ClipboardCheck, Printer, Boxes, Loader2,
  TrendingDown, Warehouse as WarehouseIcon, Coins, Barcode as BarcodeIcon,
  QrCode as QrCodeIcon,
} from "lucide-react";
import { getJson, postJson, patchJson } from "@/lib/api";
import { formatAmount, formatDateDisplay, formatTime12 } from "@/lib/format";
import { code128Svg, barcodeDisplayText } from "@/lib/barcode";
import { qrSvg, qrPayload } from "@/lib/qr";
import {
  printLabelSheet, labelPriceText, LABELS_MAX, LABELS_MAX_THERMAL,
  type LabelFormat, type LabelCode,
} from "@/components/print/label-print";
import { useNav } from "@/lib/nav";
import type { BootstrapData as BootType } from "@/lib/types";
import {
  AppHeader, AppCard, SectionTitle, KeyValueRow, PrimaryButton, StatusChip, EmptyState,
} from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { cn } from "@/lib/utils";

interface ProductCardResponse {
  product: {
    id: number;
    name: string;
    barcode: string | null;
    categoryName: string | null;
    unitName: string | null;
    costPrice: number;
    minStock: number;
    notes: string | null;
    isArchived: boolean;
    prices: Array<{ currencyId: number; code: string; price: number }>;
    stockByWarehouse: Array<{ warehouseId: number; name: string; qty: number }>;
  };
  totalStock: number;
  isLowStock: boolean;
  soldLast30: number;
  movements: Array<{
    id: number;
    movedAt: string;
    createdAt: string;
    movementType: string;
    qty: number;
    unitCost: number | null;
    warehouseName: string;
    refType: string | null;
    refNo: string | null;
    notes: string | null;
  }>;
  suggestedBarcode: string;
}

export const MOVEMENT_LABELS: Record<string, string> = {
  purchase: "شراء",
  sale: "بيع",
  sale_return: "مرتجع بيع",
  purchase_return: "مرتجع شراء",
  adjustment: "جرد",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  opening: "افتتاحي",
};

export const MOVEMENT_COLORS: Record<string, string> = {
  purchase: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30",
  sale: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30",
  sale_return: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30",
  purchase_return: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30",
  adjustment: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30",
  transfer_in: "bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/30",
  transfer_out: "bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/30",
  opening: "bg-[#64748B]/20 text-[#94A3B8] border-[#64748B]/30",
};

/** خيارات منتقي صيغة الملصق (Task 10-a) */
const LABEL_FORMATS: Array<{ id: LabelFormat; title: string; sub: string }> = [
  { id: "a4", title: "ورق A4", sub: "24 ملصقاً/صفحة" },
  { id: "t58", title: "حراري 58مم", sub: "58×32مم" },
  { id: "t80", title: "حراري 80مم", sub: "80×50مم" },
];

/** خيارات منتقي رمز الملصق */
const LABEL_CODES: Array<{ id: LabelCode; title: string }> = [
  { id: "code128", title: "باركود Code128" },
  { id: "qr", title: "رمز QR" },
];

export default function InventoryProductCardScreen({
  productId: pid,
}: {
  productId?: number | string;
}) {
  const id = Number(pid ?? 0);
  const nav = useNav();
  const qc = useQueryClient();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [stocktakeOpen, setStocktakeOpen] = useState(false);
  const [stocktakeWh, setStocktakeWh] = useState<number | null>(null);
  const [countedQty, setCountedQty] = useState("");
  const [busy, setBusy] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [labelCount, setLabelCount] = useState("24");
  const [labelFormat, setLabelFormat] = useState<LabelFormat>("a4");
  const [labelCode, setLabelCode] = useState<LabelCode>("code128");
  const [previewQr, setPreviewQr] = useState("");
  const [printing, setPrinting] = useState(false);

  const { data, isLoading } = useQuery<ProductCardResponse>({
    queryKey: ["product", id],
    queryFn: () => getJson<ProductCardResponse>(`/api/products/${id}`),
    enabled: id > 0,
  });
  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  // مدخلات معاينة QR تُشتق قبل أي return مبكر (الـhook لا يجوز بعد return)
  const qrName = data?.product?.name;
  const qrBarcode = data?.product?.barcode;
  const qrPrice = data?.product?.prices.find(
    (pr) => pr.code === boot?.baseCurrency?.code
  )?.price;

  // معاينة QR حية: تُجلب عند اختيار QR (qrSvg واعد — JSON عربي مضغوط كحمولة)
  useEffect(() => {
    if (labelCode !== "qr" || !qrName || !qrBarcode) return;
    let cancelled = false;
    void qrSvg(qrPayload({ name: qrName, barcode: qrBarcode, price: qrPrice })).then((svg) => {
      if (!cancelled) setPreviewQr(svg);
    });
    return () => {
      cancelled = true;
    };
  }, [labelCode, qrName, qrBarcode, qrPrice]);

  if (isLoading || !data) {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader title="بطاقة الصنف" />
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-[14px] text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden /> جارٍ التحميل…
        </div>
      </div>
    );
  }

  const p = data.product;
  const company = boot?.company;
  const basePrice = p.prices.find((pr) => pr.code === boot?.baseCurrency?.code)?.price;
  const baseCurrencyCode = boot?.baseCurrency?.code;

  const isThermal = labelFormat !== "a4";
  const labelMax = isThermal ? LABELS_MAX_THERMAL : LABELS_MAX;
  const labelCountNum = Math.min(labelMax, Math.max(1, Math.floor(Number(labelCount)) || 0));

  async function copyBarcode() {
    if (!p.barcode) return;
    try {
      await navigator.clipboard.writeText(p.barcode);
      toast.success("تم نسخ الباركود");
    } catch {
      toast.error("تعذر النسخ");
    }
  }

  async function doArchive() {
    setBusy(true);
    try {
      await patchJson(`/api/products/${p.id}`, { isArchived: !p.isArchived });
      toast.success(p.isArchived ? "تمت استعادة الصنف" : "تمت أرشفة الصنف — يختفي من القوائم ويبقى في التقارير");
      setArchiveOpen(false);
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function doQuickStocktake() {
    const qty = Number(countedQty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.error("أدخل الكمية الفعلية");
      return;
    }
    if (!stocktakeWh) {
      toast.error("اختر المخزن");
      return;
    }
    setBusy(true);
    try {
      const result = await postJson<{ stocktakeId: number; diffQty: number }>(
        "/api/stock/stocktake",
        {
          warehouseId: stocktakeWh,
          notes: "جرد سريع من بطاقة الصنف",
          lines: [{ productId: p.id, countedQty: qty }],
        }
      );
      toast.success(
        result.diffQty === 0
          ? "الرصيد مطابق — لا تسوية"
          : `تم اعتماد الجرد — تسوية ${formatAmount(Math.abs(result.diffQty), { decimals: 3, showSymbol: false })} ${p.unitName ?? ""}`
      );
      setStocktakeOpen(false);
      setCountedQty("");
      qc.invalidateQueries({ queryKey: ["product", id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock", "stocktakes"] });
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function doPrintLabels() {
    if (!p.barcode) return;
    setPrinting(true);
    try {
      await printLabelSheet({
        company: company
          ? {
              name: company.name,
              phone: company.phone,
              address: company.address,
              footerText: company.footerText,
            }
          : null,
        product: {
          name: p.name,
          barcode: p.barcode,
          price: basePrice,
          currencyCode: baseCurrencyCode ?? undefined,
        },
        count: labelCountNum,
        format: labelFormat,
        codeType: labelCode,
      });
    } finally {
      setPrinting(false);
    }
  }

  const bookQty = stocktakeWh
    ? p.stockByWarehouse.find((w) => w.warehouseId === stocktakeWh)?.qty ?? 0
    : data.totalStock;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="بطاقة الصنف"
        action={
          <button
            type="button"
            onClick={() => nav.push("inventory-product-form", { id: p.id })}
            aria-label="تعديل الصنف"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Pencil className="size-5" aria-hidden />
          </button>
        }
      />

      <div className="flex flex-col gap-3 p-3 pb-8">
        {/* رأس الصنف */}
        <AppCard className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-[19px] font-extrabold leading-snug text-foreground">{p.name}</h1>
            {p.isArchived && <StatusChip status="void" label="مؤرشف" />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {p.categoryName && <StatusChip status="completed" label={p.categoryName} />}
            {p.unitName && <span className="text-[12px] text-muted-foreground">وحدة: {p.unitName}</span>}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/50 p-3">
              <span className="text-[12px] text-muted-foreground">الرصيد الكلي</span>
              <p className={cn(
                "font-num text-[20px] font-extrabold",
                data.totalStock <= 0 ? "text-[#F87171]" : data.isLowStock ? "text-[#FBBF24]" : "text-[#34D399]"
              )}>
                {formatAmount(data.totalStock, { decimals: data.totalStock % 1 ? 3 : 0, showSymbol: false })}
                {p.unitName ? ` ${p.unitName}` : ""}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <span className="text-[12px] text-muted-foreground">مبيعات 30 يوماً</span>
              <p className="font-num flex items-center gap-1 text-[20px] font-extrabold text-foreground">
                <TrendingDown className="size-4 text-primary" aria-hidden />
                {formatAmount(data.soldLast30, { decimals: 0, showSymbol: false })}
              </p>
            </div>
          </div>
          {data.isLowStock && (
            <p className="rounded-lg bg-[#FBBF24]/10 px-3 py-2 text-[12.5px] font-medium text-[#FBBF24]">
              تحت الحد الأدنى ({formatAmount(p.minStock, { decimals: 0, showSymbol: false })}) — راجع التنبيهات أو أنشئ فاتورة شراء
            </p>
          )}
        </AppCard>

        {/* الباركود */}
        <AppCard className="p-4">
          <SectionTitle className="mb-2">
            <span className="flex items-center gap-1.5">
              <BarcodeIcon className="size-4 text-muted-foreground" aria-hidden /> الباركود
            </span>
          </SectionTitle>
          {p.barcode ? (
            <>
              <div className="rounded-xl border border-border bg-card p-3">
                {/* SVG حقيقي Code128 — الأعمدة currentColor فتتبع الثيم تلقائياً */}
                <div
                  dir="ltr"
                  className="text-foreground [&>svg]:mx-auto [&>svg]:block"
                  dangerouslySetInnerHTML={{
                    __html: code128Svg(p.barcode, { height: 64, showText: true }),
                  }}
                />
                {/* استثناء مقصود لشكل الأرقام (FR-13-05): أرقام الباركود تبقى غربية دائماً
                    حتى في الوضع الهندي — واقع المسح الضوئي — لذا بلا formatAmount */}
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span
                    dir="ltr"
                    className="font-num text-[13.5px] font-bold tracking-widest text-muted-foreground"
                  >
                    {barcodeDisplayText(p.barcode)}
                  </span>
                  <button
                    type="button"
                    onClick={copyBarcode}
                    aria-label="نسخ الباركود"
                    className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Copy className="size-3.5" aria-hidden /> نسخ
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <PrimaryButton block onClick={() => setLabelOpen(true)}>
                  <Printer className="size-5" aria-hidden /> طباعة ملصقات
                </PrimaryButton>
              </div>
            </>
          ) : (
            <EmptyState
              icon={BarcodeIcon}
              message="لا باركود لهذا الصنف"
              hint="يُولَّد تلقائياً عند حفظ صنف جديد"
              className="py-8"
            />
          )}
        </AppCard>

        {/* الأرصدة لكل مخزن */}
        <AppCard className="p-4">
          <SectionTitle className="mb-2">
            <span className="flex items-center gap-1.5">
              <WarehouseIcon className="size-4 text-muted-foreground" aria-hidden /> الأرصدة بالمخازن
            </span>
          </SectionTitle>
          {p.stockByWarehouse.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">لا أرصدة بعد — أدخل افتتاحي أو فاتورة شراء</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {p.stockByWarehouse.map((w) => (
                <div key={w.warehouseId} className="rounded-xl border border-border/70 bg-muted/40 p-3">
                  <span className="block truncate text-[12.5px] text-muted-foreground">{w.name}</span>
                  <span className={cn(
                    "font-num text-[17px] font-extrabold",
                    w.qty <= 0 ? "text-[#F87171]" : "text-foreground"
                  )}>
                    {formatAmount(w.qty, { decimals: w.qty % 1 ? 3 : 0, showSymbol: false })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </AppCard>

        {/* الأسعار */}
        <AppCard className="p-4">
          <SectionTitle className="mb-2">
            <span className="flex items-center gap-1.5">
              <Coins className="size-4 text-muted-foreground" aria-hidden /> الأسعار
            </span>
          </SectionTitle>
          <div className="mb-2 grid grid-cols-2 gap-2">
            {p.prices.map((pr) => (
              <div key={pr.currencyId} className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                <span className="text-[12px] font-bold text-primary/80">{pr.code}</span>
                <p className="font-num text-[17px] font-extrabold text-foreground">
                  {formatAmount(pr.price, { currency: pr.code })}
                </p>
              </div>
            ))}
            {p.prices.length === 0 && (
              <p className="text-[13px] text-muted-foreground">لم تُحدَّد أسعار بيع بعد</p>
            )}
          </div>
          <KeyValueRow
            label="سعر التكلفة (متوسط مرجّح)"
            value={
              <span className="font-num text-[14px] font-bold text-foreground">
                {formatAmount(p.costPrice, { currency: "YER" })}
              </span>
            }
          />
          {basePrice != null && p.costPrice > 0 && (
            <KeyValueRow
              label="هامش الربح (بالأساس)"
              value={
                <span className="font-num text-[13px] text-muted-foreground">
                  {formatAmount(Math.round(((basePrice - p.costPrice) / p.costPrice) * 100), { decimals: 0, showSymbol: false })}%
                </span>
              }
            />
          )}
        </AppCard>

        {/* آخر الحركات */}
        <AppCard className="p-0">
          <div className="p-4 pb-2">
            <SectionTitle>آخر الحركات</SectionTitle>
          </div>
          {data.movements.length === 0 ? (
            <p className="px-4 pb-4 text-[13px] text-muted-foreground">لا حركات بعد</p>
          ) : (
            <ul className="px-2 pb-2">
              {data.movements.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-3 border-b border-border/50 px-2 py-2.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[11px] font-bold",
                        MOVEMENT_COLORS[m.movementType] ?? "bg-muted text-muted-foreground border-border"
                      )}>
                        {MOVEMENT_LABELS[m.movementType] ?? m.movementType}
                      </span>
                      <span className="font-num text-[12px] text-muted-foreground" dir="ltr">
                        {formatDateDisplay(m.movedAt)} · {formatTime12(m.createdAt)}
                      </span>
                    </div>
                    <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                      {m.warehouseName}
                      {m.refNo && <span className="font-num"> — {m.refNo}</span>}
                    </span>
                  </div>
                  <span className={cn(
                    "font-num shrink-0 text-[15px] font-extrabold",
                    m.qty >= 0 ? "text-[#34D399]" : "text-[#F87171]"
                  )} dir="ltr">
                    {m.qty >= 0 ? "+" : "−"}
                    {formatAmount(Math.abs(m.qty), { decimals: Math.abs(m.qty % 1) ? 3 : 0, showSymbol: false })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 pb-4">
            <PrimaryButton
              block
              variant="ghost"
              onClick={() => nav.push("inventory-movements", { productId: p.id })}
            >
              <Boxes className="size-4" aria-hidden /> كل حركات الصنف
            </PrimaryButton>
          </div>
        </AppCard>

        {/* الإجراءات */}
        <div>
          <PrimaryButton
            block
            variant="outline"
            onClick={() => setStocktakeOpen(true)}
          >
            <ClipboardCheck className="size-5" aria-hidden /> جرد سريع
          </PrimaryButton>
        </div>
        <PrimaryButton
          block
          variant={p.isArchived ? "success" : "danger"}
          onClick={() => setArchiveOpen(true)}
        >
          <Archive className="size-5" aria-hidden /> {p.isArchived ? "استعادة من الأرشيف" : "أرشفة الصنف"}
        </PrimaryButton>
        <PrimaryButton block variant="ghost" onClick={() => nav.pop()}>
          رجوع
        </PrimaryButton>
        {p.notes && (
          <p className="text-[12.5px] text-muted-foreground">ملاحظات: {p.notes}</p>
        )}
      </div>

      {/* لوحة الأرشفة */}
      <PosSheet open={archiveOpen} onOpenChange={setArchiveOpen} title={p.isArchived ? "استعادة الصنف" : "أرشفة الصنف"}>
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-[14px] leading-relaxed text-foreground">
            {p.isArchived
              ? `سيُستعاد «${p.name}» إلى قوائم الأصناف والبيع.`
              : `سيُؤرشف «${p.name}» — يختفي من قوائم الأصناف الجديدة (البيع/الشراء) وتبقى كل حركاته وتقاريره سارية. لا يمكن حذف صنف له حركات.`}
          </p>
          <PrimaryButton block variant={p.isArchived ? "success" : "danger"} loading={busy} onClick={doArchive}>
            {p.isArchived ? "استعادة" : "تأكيد الأرشفة"}
          </PrimaryButton>
          <PrimaryButton block variant="ghost" onClick={() => setArchiveOpen(false)}>
            إلغاء
          </PrimaryButton>
        </div>
      </PosSheet>

      {/* لوحة الجرد السريع */}
      <PosSheet
        open={stocktakeOpen}
        onOpenChange={setStocktakeOpen}
        title="جرد سريع"
        description="أدخل الرصيد الفعلي بالمخزن — يُنشئ تسوية جرد ذرّية"
      >
        <div className="flex flex-col gap-3 pb-2">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="st-wh">
              المخزن
            </label>
            <select
              id="st-wh"
              value={stocktakeWh ?? ""}
              onChange={(e) => setStocktakeWh(e.target.value ? Number(e.target.value) : null)}
              className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[14px] text-foreground outline-none focus:border-primary/70"
            >
              <option value="">اختر المخزن</option>
              {(boot?.warehouses ?? []).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 text-[13.5px]">
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">الرصيد الدفتري</span>
              <span className="font-num font-bold">
                {formatAmount(bookQty, { decimals: bookQty % 1 ? 3 : 0, showSymbol: false })} {p.unitName ?? ""}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-muted-foreground">الفرق المتوقع</span>
              <span className="font-num font-bold text-[#FBBF24]">
                {formatAmount((Number(countedQty) || 0) - bookQty, { decimals: 3, showSymbol: false })}
              </span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="st-qty">
              الرصيد الفعلي (الكمية المعدودة)
            </label>
            <input
              id="st-qty"
              type="number"
              inputMode="decimal"
              dir="ltr"
              value={countedQty}
              onChange={(e) => setCountedQty(e.target.value)}
              placeholder={String(bookQty)}
              className="font-num h-14 w-full rounded-xl border border-border bg-muted/60 px-3 text-[18px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
            />
          </div>
          <PrimaryButton block variant="success" loading={busy} onClick={doQuickStocktake}>
            اعتماد الجرد
          </PrimaryButton>
        </div>
      </PosSheet>

      {/* لوحة طباعة الملصقات */}
      <PosSheet
        open={labelOpen}
        onOpenChange={setLabelOpen}
        title="طباعة الملصقات"
        description={
          p.barcode
            ? labelFormat === "a4"
              ? `ملصقات رف «${p.name}» — شبكة A4 بقياس 63×25مم`
              : `ملصقات رف «${p.name}» — حراري ${labelFormat === "t58" ? "58×32" : "80×50"}مم`
            : undefined
        }
      >
        {p.barcode ? (
          <div className="flex flex-col gap-3 pb-2">
            {/* منتقي الصيغة */}
            <div>
              <span className="mb-1 block text-[13px] font-medium text-muted-foreground">صيغة الورق</span>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="صيغة الملصق">
                {LABEL_FORMATS.map((o) => {
                  const active = labelFormat === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setLabelFormat(o.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1.5 py-2 text-center transition-all active:scale-[0.98]",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-card hover:border-primary/40"
                      )}
                    >
                      <span className="text-[12.5px] font-bold text-foreground">{o.title}</span>
                      <span className="text-[10.5px] text-muted-foreground">{o.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* منتقي الرمز */}
            <div>
              <span className="mb-1 block text-[13px] font-medium text-muted-foreground">رمز الملصق</span>
              <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="رمز الملصق">
                {LABEL_CODES.map((o) => {
                  const active = labelCode === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setLabelCode(o.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center transition-all active:scale-[0.98]",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-card hover:border-primary/40"
                      )}
                    >
                      {o.id === "code128" ? (
                        <BarcodeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <QrCodeIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      <span className="text-[12.5px] font-bold text-foreground">{o.title}</span>
                    </button>
                  );
                })}
              </div>
              {labelCode === "qr" && (
                <p className="mt-1 text-[11.5px] leading-4 text-muted-foreground">
                  يحتوي الاسم والباركود والسعر — يقرأه أي قارئ
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="label-count">
                عدد الملصقات
              </label>
              <input
                id="label-count"
                type="number"
                inputMode="numeric"
                min={1}
                max={labelMax}
                dir="ltr"
                value={labelCount}
                onChange={(e) => setLabelCount(e.target.value.replace(/\D/g, "").slice(0, 3))}
                className="font-num h-14 w-full rounded-xl border border-border bg-muted/60 px-3 text-[18px] font-bold text-foreground outline-none focus:border-primary/70"
              />
              <p className="mt-1 text-[11.5px] text-muted-foreground">
                {labelFormat === "a4"
                  ? `كل صفحة A4 تتسع لـ 24 ملصقاً (3×8) — حتى ${LABELS_MAX} ملصقاً`
                  : `كل ملصق يُطبع بصفحة مستقلة — حتى ${LABELS_MAX_THERMAL} ملصقاً`}
              </p>
            </div>

            {/* معاينة ملصق واحد — أبيض دائماً (حبر على ورق/حراري) في الوضعين،
                وأبعاد البطاقة بنسب الصيغة: A4 كما كان، t58 بنسبة 58:32، t80 بنسبة 80:50 */}
            <div>
              <span className="mb-1 block text-[13px] font-medium text-muted-foreground">معاينة الملصق</span>
              <div
                dir="rtl"
                className={cn(
                  "mx-auto flex w-[240px] flex-col items-center bg-white p-2 text-[#0F172A] shadow-sm",
                  labelFormat === "a4"
                    ? "gap-0.5 rounded-md border border-dashed border-[#94A3B8]"
                    : "justify-between overflow-hidden rounded-md border border-[#94A3B8]",
                  labelFormat === "t58" && "h-[132px]",
                  labelFormat === "t80" && "h-[150px]"
                )}
              >
                <span
                  className={cn(
                    "max-w-full truncate leading-tight text-[#475569]",
                    labelFormat === "t80" ? "text-[9px]" : "text-[8.5px]"
                  )}
                >
                  {company?.name ?? "المتجر"}
                </span>
                <span
                  className={cn(
                    "max-w-full text-center font-extrabold leading-snug",
                    labelFormat === "a4" && "line-clamp-2 text-[10px]",
                    labelFormat === "t58" && "line-clamp-1 text-[10.5px]",
                    labelFormat === "t80" && "line-clamp-1 text-[12px]"
                  )}
                >
                  {p.name}
                </span>
                {labelCode === "qr" ? (
                  // QR مربع بعرض كامل — SVG من qrSvg (viewBox + path stroke)
                  previewQr ? (
                    <div
                      dir="ltr"
                      className={cn(
                        "[&>svg]:block [&>svg]:h-full [&>svg]:w-full",
                        labelFormat === "a4" && "size-[46px]",
                        labelFormat === "t58" && "size-[64px]",
                        labelFormat === "t80" && "size-[84px]"
                      )}
                      aria-label="معاينة رمز QR للصنف"
                      role="img"
                      dangerouslySetInnerHTML={{ __html: previewQr }}
                    />
                  ) : (
                    <div
                      aria-hidden
                      className={cn(
                        "flex items-center justify-center rounded-sm border border-dashed border-[#94A3B8] bg-white",
                        labelFormat === "a4" && "size-[46px]",
                        labelFormat === "t58" && "size-[64px]",
                        labelFormat === "t80" && "size-[84px]"
                      )}
                    >
                      <Loader2 className="size-4 animate-spin text-[#94A3B8]" />
                    </div>
                  )
                ) : (
                  <>
                    <div
                      dir="ltr"
                      className={cn(
                        "w-full text-black [&>svg]:block [&>svg]:h-full [&>svg]:w-full",
                        labelFormat === "a4" && "mt-0.5 h-7",
                        labelFormat === "t58" && "h-6",
                        labelFormat === "t80" && "h-8"
                      )}
                      dangerouslySetInnerHTML={{
                        __html: code128Svg(p.barcode, { showText: false }),
                      }}
                    />
                    {/* أرقام الباركود غربية دائماً (استثناء المسح الضوئي) — بلا formatAmount */}
                    <span
                      dir="ltr"
                      className={cn(
                        "font-num font-bold tracking-widest",
                        labelFormat === "t80" ? "text-[10px]" : "text-[9.5px]"
                      )}
                    >
                      {barcodeDisplayText(p.barcode)}
                    </span>
                  </>
                )}
                {basePrice != null && (
                  <span
                    className={cn(
                      "font-num font-extrabold",
                      labelFormat === "a4" && "text-[11px]",
                      labelFormat === "t58" && "text-[11.5px]",
                      labelFormat === "t80" && "text-[13.5px]"
                    )}
                  >
                    {labelPriceText(basePrice, baseCurrencyCode)}
                  </span>
                )}
              </div>
            </div>

            <PrimaryButton block loading={printing} disabled={labelCountNum < 1} onClick={doPrintLabels}>
              <Printer className="size-5" aria-hidden /> طباعة
            </PrimaryButton>
          </div>
        ) : (
          <EmptyState
            icon={BarcodeIcon}
            message="لا باركود لهذا الصنف"
            hint="يُولَّد تلقائياً عند حفظ صنف جديد"
            className="py-8"
          />
        )}
      </PosSheet>
    </div>
  );
}
