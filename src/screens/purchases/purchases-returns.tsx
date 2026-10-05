"use client";

/**
 * شاشة المرتجعات (بيع SRN / شراء PRN) — Task 3-a:
 * • مرتجع مرتبط بفاتورة أصلية (من تفاصيل الفاتورة أو زر «مرتجع بيع» في فاتورة المبيعات):
 *   بنود الفاتورة مع مربعات اختيار وكميات (لا تتجاوز الأصل) + «تحديد الكل» لمرتجع كامل
 *   + طريقة رد المبلغ (نقدي من الصندوق / خصم من الحساب).
 * • مرتجع حر (بلا فاتورة أصلية): منتقي أصناف + كمية وقيمة الاسترداد.
 * نمط الحالة: Body يُركَّب بkey عند جاهزية البيانات (تهيئة نظيفة بلا effects).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Undo2, Loader2, Trash2, PackageSearch, Wallet, UserRound, CheckSquare, Square,
  Info, Save,
} from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDateDisplay } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { calcInvoiceTotals } from "@/domain/invoice";
import type { InvoiceDetailDto, ProductSearchItemDto } from "@/domain/dto";
import type { BootstrapData as BootType } from "@/lib/types";
import { AppHeader, PrimaryButton, EmptyState, SectionTitle, KeyValueRow, AmountText, AppCard } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { CostItemPicker } from "@/components/inventory/cost-item-picker";
import { DocSuccessSheet } from "@/components/inventory/doc-success-sheet";
import { printDocument } from "@/components/print/receipt-print";
import { cn } from "@/lib/utils";

interface ReturnLine {
  productId: number;
  name: string;
  unitName: string | null;
  qty: number;
  maxQty?: number;
  unitPrice: number;
  checked: boolean;
}

type Mode = "sale_return" | "purchase_return";

export default function PurchasesReturnsScreen({
  mode: modeParam,
  originalInvoiceId,
  full,
}: {
  mode?: string;
  originalInvoiceId?: number | string;
  full?: boolean;
}) {
  const mode: Mode = modeParam === "purchase_return" ? "purchase_return" : "sale_return";
  const originalId = Number(originalInvoiceId ?? 0) || null;
  const isLinked = originalId != null;
  const title = mode === "sale_return" ? "مرتجع بيع" : "مرتجع شراء";

  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });
  const { data: originalData, isLoading: originalLoading } = useQuery<{
    invoice: InvoiceDetailDto;
  }>({
    queryKey: ["invoice", originalId],
    queryFn: () => getJson<{ invoice: InvoiceDetailDto }>(`/api/invoices/${originalId}`),
    enabled: isLinked,
  });

  const original = originalData?.invoice ?? null;
  const wrongType =
    original &&
    ((mode === "sale_return" && original.docType !== "sale") ||
      (mode === "purchase_return" && original.docType !== "purchase"));

  if (isLinked && originalLoading) {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader title={title} />
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-[14px] text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden /> جارٍ تحميل الفاتورة الأصلية…
        </div>
      </div>
    );
  }

  if (isLinked && (wrongType || !original)) {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader title={title} />
        <EmptyState
          icon={Undo2}
          message={wrongType ? "نوع الفاتورة الأصلية غير مطابق" : "الفاتورة الأصلية غير موجودة"}
          hint={
            wrongType
              ? mode === "sale_return"
                ? "مرتجع البيع يرتبط بفواتير المبيعات فقط"
                : "مرتجع الشراء يرتبط بفواتير المشتريات فقط"
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <ReturnsBody
      key={`${mode}-${originalId ?? "free"}-${original?.id ?? 0}`}
      mode={mode}
      isLinked={isLinked}
      original={original}
      full={Boolean(full)}
      boot={boot}
    />
  );
}

function ReturnsBody({
  mode,
  isLinked,
  original,
  full,
  boot,
}: {
  mode: Mode;
  isLinked: boolean;
  original: InvoiceDetailDto | null;
  full: boolean;
  boot: BootType | undefined;
}) {
  const nav = useNav();
  const qc = useQueryClient();

  const [lines, setLines] = useState<ReturnLine[]>(() =>
    original
      ? original.items.map((it) => ({
          productId: it.productId,
          name: it.productName,
          unitName: it.unitName,
          qty: full ? it.qty : 0,
          maxQty: it.qty,
          unitPrice: it.unitPrice,
          checked: Boolean(full),
        }))
      : []
  );
  const [refundMethod, setRefundMethod] = useState<"cash" | "credit">(() =>
    original ? (original.payStatus === "credit" ? "credit" : "cash") : "credit"
  );
  const [cashboxId, setCashboxId] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState<InvoiceDetailDto | null>(null);
  const [savedBalance, setSavedBalance] = useState<number | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const currencyId = original?.currencyId ?? boot?.baseCurrency?.id ?? null;
  const selectedCurrency = (boot?.currencies ?? []).find((c) => c.id === currencyId);
  const curCode = selectedCurrency?.code ?? "YER";
  const cashboxes = (boot?.cashboxes ?? []).filter(
    (b) => b.currencyId === currencyId && !b.isArchived
  );

  const activeLines = lines.filter((l) => l.checked && l.qty > 0);
  const totals = useMemo(
    () =>
      calcInvoiceTotals(
        activeLines.map((l) => ({ qty: l.qty, unitPrice: l.unitPrice })),
        { paidAmount: 0 }
      ),
    [activeLines]
  );

  const party = mode === "sale_return" ? original?.customer : original?.supplier;
  const needsParty = refundMethod === "credit" && !party;

  function toggleLine(i: number) {
    setLines((ls) =>
      ls.map((l, idx) =>
        idx === i
          ? { ...l, checked: !l.checked, qty: !l.checked ? (l.maxQty ?? l.qty) : 0 }
          : l
      )
    );
  }

  function updateLine(i: number, patch: Partial<ReturnLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function addFreeProduct(p: ProductSearchItemDto) {
    setLines((ls) => {
      if (ls.some((x) => x.productId === p.id)) return ls;
      const price = mode === "sale_return" ? p.prices[curCode] ?? p.costPrice : p.costPrice;
      return [
        ...ls,
        {
          productId: p.id,
          name: p.name,
          unitName: p.unitName,
          qty: 1,
          maxQty: undefined,
          unitPrice: price,
          checked: true,
        },
      ];
    });
  }

  const title = mode === "sale_return" ? "مرتجع بيع" : "مرتجع شراء";
  const allChecked = lines.length > 0 && lines.every((l) => l.checked);

  async function save() {
    if (activeLines.length === 0) {
      toast.error("اختر صنفاً واحداً على الأقل بكمية أكبر من صفر");
      return;
    }
    if (refundMethod === "cash" && !cashboxId) {
      toast.error("اختر الصندوق لرد المبلغ نقدياً");
      return;
    }
    if (needsParty) {
      toast.error(
        mode === "sale_return" ? "خصم الحساب يتطلب عميلاً للفاتورة" : "خصم الحساب يتطلب مورداً للفاتورة"
      );
      return;
    }
    setSaving(true);
    try {
      const result = await postJson<{
        invoice: InvoiceDetailDto;
        customerBalance: number | null;
        supplierBalance: number | null;
      }>("/api/invoices", {
        docType: mode,
        originalInvoiceId: isLinked ? original!.id : null,
        customerId: mode === "sale_return" ? original?.customer?.id ?? null : null,
        supplierId: mode === "purchase_return" ? original?.supplier?.id ?? null : null,
        warehouseId: original?.warehouseId ?? boot?.warehouses?.[0]?.id,
        currencyId,
        cashboxId: refundMethod === "cash" ? cashboxId : null,
        refundMethod,
        items: activeLines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
        })),
        notesPrinted: isLinked ? `مرتجع عن ${original!.invoiceNo}` : null,
      });
      setSavedInvoice(result.invoice);
      setSavedBalance(mode === "sale_return" ? result.customerBalance : result.supplierBalance);
      setSuccessOpen(true);
      setLines([]);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      /* toast من api */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title={title} />

      <div className="flex flex-1 flex-col gap-3 p-3 pb-4">
        {/* الفاتورة الأصلية */}
        {original ? (
          <AppCard className="flex flex-col gap-1.5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">مرتجع عن فاتورة</span>
              <span className="font-num text-[15px] font-extrabold text-foreground">
                {original.invoiceNo}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12.5px] text-muted-foreground">
              <span>{formatDateDisplay(original.issuedAt)}</span>
              <span>{party?.name ?? (mode === "sale_return" ? "عميل نقدي" : "مورد نقدي")}</span>
            </div>
            {refundMethod === "cash" && original.payStatus === "credit" && (
              <p className="rounded-lg bg-[#FBBF24]/10 px-2.5 py-1.5 text-[12px] text-[#FBBF24]">
                الفاتورة الأصلية آجلة — الرد النقدي يتطلب صندوقاً برصيد كافٍ
              </p>
            )}
          </AppCard>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <SectionTitle className="mb-1">مرتجع حر (بلا فاتورة أصلية)</SectionTitle>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              {mode === "sale_return"
                ? "استرداد أصناف من عميل بلا فاتورة مرجعية — الكميات تعود للمخزون والمبلغ يُرد للعميل."
                : "إرجاع أصناف للمورد بلا فاتورة مرجعية — الكميات تخرج من المخزون والمبلغ يُسترد."}
            </p>
          </div>
        )}

        {/* البنود */}
        <div className="rounded-2xl border border-border/60 bg-card p-0">
          <div className="flex items-center justify-between p-4 pb-2">
            <SectionTitle>البنود ({lines.length})</SectionTitle>
            {!isLinked && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2 text-[13px] font-bold text-primary hover:bg-primary/20"
              >
                <PackageSearch className="size-4" aria-hidden /> إضافة صنف
              </button>
            )}
          </div>
          {isLinked && lines.length > 0 && (
            <div className="px-4 pb-1">
              <button
                type="button"
                onClick={() =>
                  setLines((ls) =>
                    ls.map((l) => ({
                      ...l,
                      checked: !allChecked,
                      qty: !allChecked ? (l.maxQty ?? l.qty) : 0,
                    }))
                  )
                }
                className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-1.5 text-[12.5px] font-bold text-foreground hover:bg-accent/40"
              >
                <CheckSquare className="size-4 text-primary" aria-hidden />
                {allChecked ? "إلغاء تحديد الكل" : "تحديد الكل (مرتجع كامل)"}
              </button>
            </div>
          )}
          {lines.length === 0 ? (
            <div className="px-4 pb-4">
              <EmptyState
                icon={Undo2}
                message={isLinked ? "لا بنود في الفاتورة الأصلية" : "أضف أصنافاً للمرتجع"}
                hint={isLinked ? undefined : "ابحث عن الأصناف المرتجعة وأدخل كمياتها"}
              />
            </div>
          ) : (
            <div className="flex flex-col px-2 pb-2">
              {lines.map((l, i) => (
                <div
                  key={`${l.productId}-${i}`}
                  className={cn(
                    "border-b border-border/50 py-2.5 last:border-0",
                    !l.checked && "opacity-55"
                  )}
                >
                  <div className="flex items-center gap-2.5 px-2">
                    {isLinked || l.maxQty != null ? (
                      <button
                        type="button"
                        onClick={() => toggleLine(i)}
                        aria-label={`تحديد ${l.name}`}
                        className="flex size-8 shrink-0 items-center justify-center text-primary"
                      >
                        {l.checked ? (
                          <CheckSquare className="size-6" aria-hidden />
                        ) : (
                          <Square className="size-6" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}
                        aria-label={`حذف ${l.name}`}
                        className="flex size-8 shrink-0 items-center justify-center text-[#F87171] hover:bg-[#F87171]/10"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-bold text-foreground">{l.name}</p>
                      {l.maxQty != null && (
                        <p className="font-num text-[11.5px] text-muted-foreground">
                          الحد الأقصى: {formatAmount(l.maxQty, { decimals: l.maxQty % 1 ? 3 : 0, showSymbol: false })}
                        </p>
                      )}
                    </div>
                  </div>
                  {(l.checked || !isLinked) && (
                    <div className="mt-2 flex items-center gap-2 px-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => updateLine(i, { qty: Math.max(0, l.qty - 1) })}
                          aria-label="إنقاص"
                          className="flex size-10 items-center justify-center rounded-full border border-[#F87171]/40 bg-[#F87171]/10 text-[16px] font-bold text-[#F87171] active:scale-90"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          dir="ltr"
                          value={l.qty || ""}
                          onChange={(e) => {
                            let v = Number(e.target.value) || 0;
                            if (l.maxQty != null) v = Math.min(v, l.maxQty);
                            updateLine(i, { qty: v });
                          }}
                          aria-label={`كمية ${l.name}`}
                          className="font-num h-10 w-16 rounded-xl border border-border bg-muted/60 px-1 text-center text-[15px] font-bold text-foreground outline-none focus:border-primary/70"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const v = l.qty + 1;
                            updateLine(i, { qty: l.maxQty != null ? Math.min(v, l.maxQty) : v });
                          }}
                          aria-label="زيادة"
                          className="flex size-10 items-center justify-center rounded-full border border-[#34D399]/40 bg-[#34D399]/10 text-[16px] font-bold text-[#34D399] active:scale-90"
                        >
                          +
                        </button>
                      </div>
                      <input
                        type="number"
                        inputMode="decimal"
                        dir="ltr"
                        value={l.unitPrice || ""}
                        onChange={(e) => updateLine(i, { unitPrice: Number(e.target.value) || 0 })}
                        aria-label={`قيمة الاسترداد لـ ${l.name}`}
                        className="font-num h-10 min-w-0 flex-1 rounded-xl border border-border bg-muted/60 px-2 text-center text-[14px] font-bold text-foreground outline-none focus:border-primary/70"
                      />
                      <span className="font-num shrink-0 text-[14px] font-extrabold text-primary" dir="ltr">
                        {formatAmount(l.qty * l.unitPrice, { currency: curCode })}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* طريقة رد المبلغ */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <SectionTitle className="mb-2">طريقة رد المبلغ</SectionTitle>
          <div className="mb-2 flex gap-2">
            {(
              [
                { id: "cash", label: "نقدي من الصندوق", icon: Wallet },
                { id: "credit", label: "خصم من الحساب", icon: UserRound },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setRefundMethod(o.id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-[13px] font-bold transition-colors",
                  refundMethod === o.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}
              >
                <o.icon className="size-4" aria-hidden /> {o.label}
              </button>
            ))}
          </div>
          {refundMethod === "cash" && (
            <select
              value={cashboxId ?? ""}
              onChange={(e) => setCashboxId(e.target.value ? Number(e.target.value) : null)}
              aria-label="الصندوق"
              className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[14px] font-bold text-foreground outline-none focus:border-primary/70"
            >
              <option value="">اختر الصندوق…</option>
              {cashboxes.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          {refundMethod === "credit" && (
            <p className="flex items-start gap-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {needsParty
                ? "لا يوجد طرف مرتبط — خصم الحساب يتطلب فاتورة أصلية بعميل/مورد."
                : mode === "sale_return"
                  ? "سيُخصم إجمالي المرتجع من رصيد العميل المدين (قد يصبح دائناً — إشعار دائن)."
                  : "سيُخصم إجمالي المرتجع من المستحق للمورد."}
            </p>
          )}
        </div>

        {/* الإجماليات */}
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <KeyValueRow label="عدد البنود" value={<span className="font-num font-bold">{activeLines.length}</span>} />
          <KeyValueRow
            label="إجمالي المسترد"
            value={<AmountText value={totals.total} currency={curCode} size="lg" />}
          />
        </div>

        <PrimaryButton
          block
          variant={mode === "sale_return" ? "warning" : "danger"}
          loading={saving}
          disabled={
            activeLines.length === 0 ||
            (refundMethod === "cash" && !cashboxId) ||
            needsParty
          }
          onClick={save}
        >
          <Save className="size-5" aria-hidden /> حفظ {title}
        </PrimaryButton>
        <PrimaryButton block variant="ghost" onClick={() => nav.pop()}>
          رجوع
        </PrimaryButton>
      </div>

      {/* منتقي أصناف (مرتجع حر) */}
      <CostItemPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        mode={mode === "sale_return" ? "sale" : "cost"}
        currencyCode={curCode}
        onAdd={addFreeProduct}
      />

      {/* لوحة النجاح */}
      <DocSuccessSheet
        open={successOpen}
        onOpenChange={setSuccessOpen}
        invoice={savedInvoice}
        partyBalance={savedBalance}
        partyLabel={
          savedInvoice?.docType === "sale_return"
            ? savedInvoice?.customer?.name ?? "العميل"
            : savedInvoice?.supplier?.name ?? "المورد"
        }
        onPrint={(inv) =>
          printDocument(
            inv,
            inv.docType === "purchase" ? "purchase" : inv.docType === "purchase_return" ? "purchase_return" : "sale_return",
            {
              paper: (boot?.settings?.["print.paper"] as "58" | "80") ?? "80",
              company: {
                name: boot?.company?.name ?? "المتجر",
                phone: boot?.company?.phone ?? null,
                address: boot?.company?.address ?? null,
                footerText: boot?.company?.footerText ?? null,
              },
            }
          )
        }
        onDone={() => {
          setSuccessOpen(false);
          if (savedInvoice) nav.replace("purchases-details", { invoiceId: savedInvoice.id });
        }}
      />
    </div>
  );
}
