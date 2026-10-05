"use client";

/**
 * شاشة البيع (POS) ⭐ — أهم شاشة في التطبيق — SRS §6.5 + دليل الشاشات 04.
 * الرأس (رقم قابل للتعديل + ساعة حية) + شريط إعدادات (عميل/صندوق/مخزن/عملة/مندوب)
 * + بحث فوري وباركود (إضافة تلقائية بنبضة صوتية) + بنود بعدّاد كمية وأسعار قابلة للتعديل
 * + اللوحة السفلية (الإجمالي + خصم/ضريبة/دفع مختلط) + إجراءات الحفظ الأربعة
 * (نقدي/آجل/تعليق/عرض سعر) + شريط المعلّقات (FR-02-13).
 * الإجماليات تحدَّث لحظياً في العميل عبر دوال domain النقية.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowRight, Trash2, Plus, Minus, LayoutGrid, Pause, FileText,
  Users, Wallet, Warehouse, Coins, UserCheck, X, ReceiptText,
} from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDate, formatTime12 } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { calcInvoiceTotals } from "@/domain/invoice";
import type {
  InvoiceDetailDto,
  InvoiceListResponse,
  ProductSearchResponse,
  SaveInvoiceResponse,
} from "@/domain/dto";
import type { BootstrapData } from "@/lib/types";
import { PrimaryButton, SearchBar } from "@/components/ds";
import { usePosStore } from "@/components/pos/pos-store";
import { beep } from "@/components/pos/beep";
import { ItemPicker } from "@/components/pos/item-picker";
import { CustomerPicker, OptionPicker } from "@/components/pos/customer-picker";
import { DiscountSheet, TaxSheet } from "@/components/pos/adjust-sheets";
import { PaymentSheet } from "@/components/pos/payment-sheet";
import { SuccessSheet } from "@/components/pos/success-sheet";
import { printInvoice } from "@/components/print/receipt-print";
import { shareInvoiceWhatsApp } from "@/lib/share";
import { cn } from "@/lib/utils";

type SheetKind =
  | null | "customer" | "cashbox" | "warehouse" | "currency" | "rep"
  | "picker" | "discount" | "tax" | "payment";

interface RepDto {
  id: number
  name: string
  commissionType: string
  commissionPercent: number
}

export default function SalesPosScreen({ mode: modeParam }: { mode?: string }) {
  const { pop, canPop } = useNav();
  const qc = useQueryClient();
  const pos = usePosStore();

  const [mode, setMode] = useState<"invoice" | "quotation">(
    modeParam === "quotation" ? "quotation" : "invoice"
  );
  useEffect(() => {
    setMode(modeParam === "quotation" ? "quotation" : "invoice");
  }, [modeParam]);

  // ─── البيانات المرجعية ───
  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  const company = boot?.company;
  const currency = boot?.currencies.find((c) => c.id === pos.currencyId) ?? null;
  const currencyCode = pos.currencyCode || currency?.code || "YER";
  const rate = useMemo(() => {
    if (!currency || currency.isBase) return 1;
    return boot?.rates[currency.code]?.rate ?? 1;
  }, [currency, boot]);

  const { data: repsData } = useQuery<{ reps: RepDto[] }>({
    queryKey: ["pos-reps"],
    queryFn: () => getJson<{ reps: RepDto[] }>("/api/parties/reps?limit=50"),
    staleTime: 5 * 60_000,
  });

  // الإعدادات الافتراضية عند أول تحميل
  useEffect(() => {
    if (!boot) return;
    const s = usePosStore.getState();
    if (s.warehouseId == null) {
      const w = boot.warehouses.find((x) => x.isDefault) ?? boot.warehouses[0];
      if (w) s.setWarehouse(w.id);
    }
    if (s.currencyId == null && boot.baseCurrency) {
      s.setCurrency(boot.baseCurrency.id, boot.baseCurrency.code);
    }
    if (s.cashboxId == null) {
      const baseId = boot.baseCurrency?.id;
      const b = boot.cashboxes.find((x) => x.currencyId === baseId) ?? boot.cashboxes[0];
      if (b) s.setCashbox(b.id);
    }
  }, [boot]);

  // ─── الساعة الحية ───
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const dateLabel = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
  const timeLabel = formatTime12(now);

  // ─── الرقم التالي (معاينة لرأس الشاشة — الخادم يعيّنه عند الحفظ) ───
  const nextNoQ = useQuery<{ invoiceNo: string }>({
    queryKey: ["invoice-next-number"],
    queryFn: () => getJson<{ invoiceNo: string }>("/api/invoices/next-number?docType=sale"),
    staleTime: 0,
    enabled: mode === "invoice",
  });
  const [numberInput, setNumberInput] = useState<string | null>(null);
  const numberDisplay = numberInput ?? nextNoQ.data?.invoiceNo ?? "…";

  // ─── المعلّقات (FR-02-13) ───
  const heldQ = useQuery<InvoiceListResponse>({
    queryKey: ["invoices", "held"],
    queryFn: () => getJson<InvoiceListResponse>("/api/invoices?docType=sale&payStatus=held"),
    refetchInterval: 60_000,
  });
  const heldInvoices = (heldQ.data?.invoices ?? []).filter((h) => h.id !== pos.resumeHeldId);

  // ─── البحث الفوري + الباركود ───
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 150);
    return () => clearTimeout(t);
  }, [search]);

  const searchQ = useQuery<ProductSearchResponse>({
    queryKey: ["products-search", debounced],
    queryFn: () =>
      getJson<ProductSearchResponse>(
        `/api/products/search?q=${encodeURIComponent(debounced)}&limit=12`
      ),
    enabled: debounced.trim().length >= 2,
    staleTime: 15_000,
  });

  // مطابقة الباركود الكامل → إضافة تلقائية + بيب + تفريغ البحث
  useEffect(() => {
    const products = searchQ.data?.products;
    if (!products || !debounced) return;
    const exact = products.find((p) => p.barcode === debounced.trim());
    if (exact) {
      usePosStore.getState().addProduct(exact);
      beep(1046, 0.15);
      toast.success(`أُضيف للفاتورة: ${exact.name}`);
      setSearch("");
    }
  }, [searchQ.data, debounced]);

  // ─── الإجماليات لحظياً (دوال domain نقية في العميل) ───
  const totals = useMemo(
    () =>
      calcInvoiceTotals(
        pos.lines.map((l) => ({
          qty: l.qty,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
        })),
        { invoiceDiscount: pos.invoiceDiscount, taxRate: pos.taxRate, paidAmount: 0 }
      ),
    [pos.lines, pos.invoiceDiscount, pos.taxRate]
  );

  // ─── الحفظ ───
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<SaveInvoiceResponse | null>(null);

  function clientValidate(payMode: "cash" | "credit" | "mixed" | "held"): boolean {
    if (pos.lines.length === 0) {
      toast.error("أضف صنفاً واحداً على الأقل للفاتورة");
      return false;
    }
    if (pos.warehouseId == null) {
      toast.error("اختر المخزن أولاً");
      return false;
    }
    if ((payMode === "credit" || payMode === "mixed") && !pos.customerId) {
      toast.error("الفاتورة الآجلة تتطلب اختيار عميل");
      return false;
    }
    if (payMode !== "held" && pos.cashboxId == null) {
      toast.error("اختر الصندوق أولاً");
      return false;
    }
    return true;
  }

  function invalidateAfterSave() {
    qc.invalidateQueries({ queryKey: ["invoice-next-number"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["pos-customers"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["bootstrap"] });
  }

  async function saveInvoice(
    payMode: "cash" | "credit" | "mixed" | "held",
    paidAmount?: number
  ) {
    if (!clientValidate(payMode)) return;
    setSaving(payMode);
    try {
      const res = await postJson<SaveInvoiceResponse>("/api/invoices", {
        docType: "sale",
        issuedAt: formatDate(new Date()),
        customerId: pos.customerId,
        salesRepId: pos.salesRepId,
        cashboxId: pos.cashboxId,
        warehouseId: pos.warehouseId,
        currencyId: pos.currencyId,
        exchangeRate: rate,
        items: pos.lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
        })),
        invoiceDiscount: pos.invoiceDiscount,
        taxRate: pos.taxRate,
        payMode,
        paidAmount: paidAmount ?? null,
        replaceHeldId: pos.resumeHeldId,
      });
      beep(1568, 0.12);
      setSuccess(res);
      pos.clearAll();
      setNumberInput(null);
      setSearch("");
      invalidateAfterSave();
    } catch {
      // postJson يعرض رسالة الخطأ العربية
    } finally {
      setSaving(null);
    }
  }

  async function saveQuotation() {
    if (pos.lines.length === 0) {
      toast.error("أضف صنفاً واحداً على الأقل لعرض السعر");
      return;
    }
    if (pos.currencyId == null) {
      toast.error("اختر العملة أولاً");
      return;
    }
    setSaving("quote");
    try {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 7);
      const res = await postJson<{ quotation: { quoteNo: string } }>("/api/quotations", {
        customerId: pos.customerId,
        currencyId: pos.currencyId,
        exchangeRate: rate,
        items: pos.lines.map((l) => ({
          productId: l.productId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          discountPercent: l.discountPercent,
        })),
        invoiceDiscount: pos.invoiceDiscount,
        taxRate: pos.taxRate,
        validUntil: formatDate(validUntil),
      });
      toast.success(`تم حفظ عرض السعر ${res.quotation.quoteNo} — قابل للتحويل لفاتورة`);
      beep(1568, 0.12);
      pos.clearAll();
      setSearch("");
      setMode("invoice");
      qc.invalidateQueries({ queryKey: ["quotations"] });
    } catch {
      // الرسالة تُعرض من postJson
    } finally {
      setSaving(null);
    }
  }

  async function resumeHeld(id: number) {
    try {
      const res = await getJson<{ invoice: InvoiceDetailDto }>(`/api/invoices/${id}`);
      const inv = res.invoice;
      const ids = inv.items.map((i) => i.productId).join(",");
      const ps = await getJson<ProductSearchResponse>(
        `/api/products/search?ids=${ids}&limit=50`
      );
      const pmap = new Map(ps.products.map((p) => [p.id, p]));
      usePosStore.getState().loadLines(
        inv.items.map((it) => ({
          productId: it.productId,
          name: it.productName,
          barcode: it.barcode,
          unitName: it.unitName,
          qty: it.qty,
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent,
          prices: pmap.get(it.productId)?.prices ?? { [inv.currencyCode]: it.unitPrice },
          totalStock: pmap.get(it.productId)?.totalStock ?? 0,
        }))
      );
      const s = usePosStore.getState();
      s.setResumeHeld(id);
      if (inv.customer) s.setCustomer(inv.customer.id, inv.customer.name);
      s.setInvoiceDiscount(inv.discountAmount);
      s.setTaxRate(inv.taxRate);
      if (boot) {
        const cur = boot.currencies.find((c) => c.code === inv.currencyCode);
        if (cur) s.setCurrency(cur.id, cur.code);
        const box = boot.cashboxes.find((b) => b.currencyId === cur?.id);
        if (box) s.setCashbox(box.id);
        const wh = boot.warehouses.find((w) => w.name === inv.warehouseName);
        if (wh) s.setWarehouse(wh.id);
      }
      toast.info(`استُؤنفت الفاتورة المعلّقة ${inv.invoiceNo} — تحفظ الجديدة ويُحذف الأصل`);
    } catch {
      // getJson تعرض الرسالة
    }
  }

  // ─── الطباعة والمشاركة ───
  function doPrint(invoice: InvoiceDetailDto) {
    printInvoice(invoice, {
      paper: (boot?.settings?.["print.paper"] as "58" | "80") ?? "80",
      template:
        (boot?.settings?.["print.template"] as "receipt" | "a4") ?? "receipt",
      company: {
        name: company?.name ?? "المتجر",
        phone: company?.phone ?? null,
        address: company?.address ?? null,
        footerText: company?.footerText ?? null,
      },
    });
  }
  function doShare(invoice: InvoiceDetailDto) {
    shareInvoiceWhatsApp(invoice, company?.name ?? "المتجر");
  }

  // ─── بيانات القوائم ───
  const cashboxes = boot?.cashboxes ?? [];
  const warehouses = boot?.warehouses ?? [];
  const currencies = boot?.currencies.filter((c) => c.isActive) ?? [];
  const reps = repsData?.reps ?? [];
  const selectedRep = reps.find((r) => r.id === pos.salesRepId);
  const selectedCashbox = cashboxes.find((b) => b.id === pos.cashboxId);
  const selectedWarehouse = warehouses.find((w) => w.id === pos.warehouseId);

  const showBack = canPop();

  return (
    <div className="flex min-h-full flex-col">
      {/* ═══════════ الرأس ═══════════ */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 pt-safe backdrop-blur-md">
        <div className="flex min-h-14 items-center gap-2 px-2">
          {showBack ? (
            <button
              type="button"
              onClick={pop}
              aria-label="رجوع"
              className="flex size-11 items-center justify-center rounded-xl text-foreground hover:bg-accent/40 active:scale-95"
            >
              <ArrowRight className="size-5" aria-hidden />
            </button>
          ) : (
            <span className="w-2" aria-hidden />
          )}
          <h1 className="flex-1 truncate text-center text-[17px] font-bold text-foreground">
            {mode === "quotation" ? "عرض سعر جديد" : "فواتير المبيعات"}
          </h1>
          {mode === "invoice" ? (
            <input
              type="text"
              value={numberDisplay}
              onChange={(e) => setNumberInput(e.target.value)}
              aria-label="رقم الفاتورة (يعيّنه الخادم تلقائياً عند الحفظ)"
              dir="ltr"
              className="font-num h-9 w-[130px] rounded-full bg-white px-3 text-center text-[13px] font-bold text-[#0F172A] outline-none ring-primary/40 focus:ring-2"
            />
          ) : (
            <span className="w-2" aria-hidden />
          )}
          {pos.lines.length > 0 && (
            <button
              type="button"
              onClick={() => {
                pos.clearAll();
                setNumberInput(null);
                toast.info("تم تفريغ الفاتورة");
              }}
              aria-label="تفريغ الفاتورة"
              className="flex size-11 items-center justify-center rounded-xl text-[#F87171] hover:bg-accent/40 active:scale-95"
            >
              <Trash2 className="size-5" aria-hidden />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between px-4 pb-2 text-[12.5px] text-muted-foreground">
          <span className="font-num" dir="ltr">
            {dateLabel} | {timeLabel}
          </span>
          <span className="flex items-center gap-2">
            {mode === "quotation" && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 font-bold text-primary">
                وضع عرض السعر
              </span>
            )}
            {pos.resumeHeldId && (
              <span className="flex items-center gap-1 rounded-full bg-[#64748B]/20 px-2 py-0.5 font-bold text-[#94A3B8]">
                استئناف معلّقة
                <button
                  type="button"
                  aria-label="إلغاء الاستئناف"
                  onClick={() => pos.setResumeHeld(null)}
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </span>
            )}
            {!currency?.isBase && rate > 1 && (
              <span className="font-num text-primary">
                1 {currencyCode} = {formatAmount(rate, { decimals: 0, showSymbol: false })} ر.ي
              </span>
            )}
          </span>
        </div>
      </header>

      {/* ═══════════ شريط الإعدادات ═══════════ */}
      <div className="grid grid-cols-2 gap-2 p-3 pb-1">
        <SettingsChip
          icon={Users}
          label="العميل"
          value={pos.customerId ? pos.customerName : "نقدي"}
          highlight={!!pos.customerId}
          onClick={() => setSheet("customer")}
        />
        <SettingsChip
          icon={UserCheck}
          label="المندوب (اختياري)"
          value={selectedRep?.name ?? "بدون"}
          highlight={!!pos.salesRepId}
          onClick={() => setSheet("rep")}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 px-3 pb-2">
        <SettingsChip
          icon={Wallet}
          label="الصندوق"
          value={selectedCashbox?.name ?? "—"}
          highlight={!!pos.cashboxId}
          onClick={() => setSheet("cashbox")}
        />
        <SettingsChip
          icon={Warehouse}
          label="المخزن"
          value={selectedWarehouse?.name ?? "—"}
          highlight={!!pos.warehouseId}
          onClick={() => setSheet("warehouse")}
        />
        <SettingsChip
          icon={Coins}
          label="العملة"
          value={currencyCode}
          highlight={true}
          onClick={() => setSheet("currency")}
        />
      </div>

      {/* ═══════════ المعلّقات (FR-02-13) ═══════════ */}
      {mode === "invoice" && heldInvoices.length > 0 && (
        <div className="flex items-center gap-2 border-y border-[#64748B]/25 bg-[#64748B]/10 px-3 py-2">
          <span className="shrink-0 text-[12px] font-bold text-[#94A3B8]">المعلّقات:</span>
          <div className="scrollbar-slim flex flex-1 gap-1.5 overflow-x-auto">
            {heldInvoices.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => resumeHeld(h.id)}
                className="font-num shrink-0 rounded-full border border-[#64748B]/40 bg-card px-3 py-1 text-[12px] font-bold text-foreground transition-colors hover:border-primary/60 hover:text-primary"
              >
                {h.invoiceNo}
                <span className="ms-1 text-[11px] font-normal text-muted-foreground">
                  ({h.itemsCount} بنود)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════ البحث واختيار الأصناف ═══════════ */}
      <div className="relative p-3 pb-1">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="إبحث عن صنف — الاسم أو الباركود"
          onScan={() => setSheet("picker")}
        />
        {/* نتائج البحث الفوري */}
        {search.trim().length >= 2 && searchQ.data && !searchQ.data.products.some((p) => p.barcode === search.trim()) && (
          <div className="absolute inset-x-3 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-card shadow-xl">
            {searchQ.data.products.length === 0 ? (
              <p className="p-4 text-center text-[13px] text-muted-foreground">
                لا توجد أصناف مطابقة لـ «{search}»
              </p>
            ) : (
              searchQ.data.products.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    pos.addProduct(p);
                    beep(1318, 0.09);
                    setSearch("");
                  }}
                  className="flex w-full items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5 text-start last:border-0 hover:bg-accent/30"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-medium text-foreground">
                      {p.name}
                    </span>
                    <span
                      className={cn(
                        "block text-[11.5px] font-num",
                        p.totalStock <= 0 ? "text-[#F87171]" : "text-muted-foreground"
                      )}
                    >
                      الرصيد: {formatAmount(p.totalStock, { decimals: 0, showSymbol: false })}
                    </span>
                  </span>
                  <span className="font-num shrink-0 text-[14px] font-bold text-primary">
                    {p.prices[currencyCode] != null
                      ? formatAmount(p.prices[currencyCode], { currency: currencyCode })
                      : "—"}
                  </span>
                </button>
              ))
            )}
            <button
              type="button"
              onClick={() => {
                setSheet("picker");
              }}
              className="flex w-full items-center justify-center gap-1.5 border-t border-border bg-muted/40 py-2.5 text-[13px] font-bold text-primary hover:bg-accent/40"
            >
              <LayoutGrid className="size-4" aria-hidden /> فتح قائمة الأصناف الكاملة
            </button>
          </div>
        )}
      </div>

      {/* ═══════════ بنود الفاتورة ═══════════ */}
      <div className="flex-1 px-3 pb-2">
        {pos.lines.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <button
              type="button"
              onClick={() => setSheet("picker")}
              className="flex size-20 flex-col items-center justify-center gap-1 rounded-3xl border-2 border-dashed border-primary/40 bg-primary/5 text-primary transition-colors hover:bg-primary/10"
            >
              <LayoutGrid className="size-8" aria-hidden />
              <span className="text-[12px] font-bold">إضافة صنف</span>
            </button>
            <p className="text-[13.5px] text-muted-foreground">
              ابحث بالاسم أو امسح الباركود بالحقل أعلاه
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {pos.lines.map((l) => {
              const overStock = l.totalStock > 0 ? l.qty > l.totalStock : false;
              const lineTotal = calcInvoiceTotals(
                [{ qty: l.qty, unitPrice: l.unitPrice, discountPercent: l.discountPercent }],
                {}
              ).total;
              return (
                <li
                  key={l.productId}
                  className="rounded-xl border border-border/70 bg-card p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold text-foreground">
                        {l.name}
                        {l.unitName && (
                          <span className="ms-1.5 text-[12px] font-normal text-muted-foreground">
                            ({l.unitName})
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                        <span className={cn("font-num", l.totalStock <= 0 && "text-[#F87171]")}>
                          الرصيد: {formatAmount(l.totalStock, { decimals: 0, showSymbol: false })}
                        </span>
                        {l.discountPercent > 0 && (
                          <span className="text-[#F87171]">خصم {l.discountPercent}%</span>
                        )}
                        {overStock && (
                          <span className="font-bold text-[#F87171]">الكمية تتجاوز الرصيد!</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-num text-[16px] font-bold text-primary" dir="ltr">
                        {formatAmount(lineTotal, { currency: currencyCode })}
                      </span>
                      <button
                        type="button"
                        onClick={() => pos.removeLine(l.productId)}
                        aria-label={`حذف ${l.name}`}
                        className="flex size-9 items-center justify-center rounded-lg bg-[#F87171]/10 text-[#F87171] hover:bg-[#F87171]/20 active:scale-95"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    {/* عدّاد الكمية: − أحمر / + أخضر (كالتطبيق الأصلي) */}
                    <button
                      type="button"
                      onClick={() => pos.incQty(l.productId, -1)}
                      aria-label={`إنقاص كمية ${l.name}`}
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F87171] text-[#2b0707] transition-transform active:scale-90"
                    >
                      <Minus className="size-5" aria-hidden />
                    </button>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={l.qty}
                      onChange={(e) => pos.setQty(l.productId, Number(e.target.value) || 0)}
                      aria-label={`كمية ${l.name}`}
                      className={cn(
                        "font-num h-10 w-16 shrink-0 rounded-xl border bg-muted/60 text-center text-[16px] font-bold text-foreground outline-none focus:border-primary/70",
                        overStock ? "border-[#F87171]" : "border-border"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => pos.incQty(l.productId, 1)}
                      aria-label={`زيادة كمية ${l.name}`}
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#34D399] text-[#052e1c] transition-transform active:scale-90"
                    >
                      <Plus className="size-5" aria-hidden />
                    </button>
                    {/* السعر قابل للتعديل */}
                    <div className="flex h-10 flex-1 items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-2 focus-within:border-primary/70">
                      <span className="shrink-0 text-[11px] text-muted-foreground">السعر</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        value={l.unitPrice}
                        onChange={(e) => pos.setPrice(l.productId, Number(e.target.value) || 0)}
                        aria-label={`سعر ${l.name}`}
                        className="font-num h-full min-w-0 flex-1 bg-transparent text-[15px] font-bold text-foreground outline-none"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ═══════════ اللوحة السفلية ═══════════ */}
      <div className="sticky bottom-0 z-30 mt-auto border-t border-border/70 bg-card/95 pb-safe pt-2 backdrop-blur-md">
        <div className="px-4">
          <div className="flex items-end justify-between gap-2">
            <div className="flex flex-col gap-0.5">
              {(pos.invoiceDiscount > 0 || totals.taxAmount > 0 || totals.subtotal !== totals.total) && (
                <span className="font-num text-[12px] text-muted-foreground">
                  المجموع {formatAmount(totals.subtotal, { currency: currencyCode })}
                  {pos.invoiceDiscount > 0 && (
                    <span className="text-[#F87171]">
                      {" "}− خصم {formatAmount(pos.invoiceDiscount, { currency: currencyCode })}
                    </span>
                  )}
                  {totals.taxAmount > 0 && (
                    <span className="text-[#FBBF24]">
                      {" "}| ضريبة {formatAmount(totals.taxAmount, { currency: currencyCode })}
                    </span>
                  )}
                </span>
              )}
              <span className="text-[13px] font-bold text-muted-foreground">الإجمالي</span>
              <span className="font-num text-[30px] font-extrabold leading-none text-primary" dir="ltr">
                {formatAmount(totals.total, { currency: currencyCode })}
              </span>
            </div>
            {pos.lines.length > 0 && (
              <span className="font-num text-[12px] text-muted-foreground">
                {pos.lines.length} {pos.lines.length === 1 ? "صنف" : "أصناف"}
              </span>
            )}
          </div>

          {/* رقائق الإعداد السريع */}
          <div className="scrollbar-slim mt-2 flex gap-1.5 overflow-x-auto pb-1">
            <QuickChip
              label="خصم مبالغ"
              value={pos.invoiceDiscount > 0 ? formatAmount(pos.invoiceDiscount, { currency: currencyCode, showSymbol: false }) : undefined}
              active={pos.invoiceDiscount > 0}
              danger
              onClick={() => setSheet("discount")}
            />
            <QuickChip
              label="الضريبة"
              value={pos.taxRate > 0 ? `${pos.taxRate}%` : undefined}
              active={pos.taxRate > 0}
              warning
              onClick={() => setSheet("tax")}
            />
            {mode === "invoice" && (
              <QuickChip label="دفع جزئي (مختلط)" onClick={() => {
                if (!pos.customerId) {
                  toast.error("الدفع المختلط يتطلب اختيار عميل أولاً");
                  setSheet("customer");
                  return;
                }
                setSheet("payment");
              }} />
            )}
          </div>
        </div>

        {/* أزرار الحفظ */}
        {mode === "invoice" ? (
          <div className="grid grid-cols-2 gap-2 p-3 pt-1.5">
            <PrimaryButton
              variant="success"
              className="col-span-2"
              disabled={pos.lines.length === 0 || saving !== null}
              loading={saving === "cash"}
              onClick={() => saveInvoice("cash")}
            >
              <ReceiptText className="size-5" aria-hidden /> إتمام عملية البيع (نقدي)
            </PrimaryButton>
            <PrimaryButton
              variant="warning"
              disabled={pos.lines.length === 0 || saving !== null}
              loading={saving === "credit"}
              onClick={() => saveInvoice("credit")}
            >
              حفظ آجل
            </PrimaryButton>
            <PrimaryButton
              variant="outline"
              disabled={pos.lines.length === 0 || saving !== null}
              loading={saving === "held"}
              onClick={() => saveInvoice("held")}
            >
              <Pause className="size-5" aria-hidden /> تعليق
            </PrimaryButton>
            <PrimaryButton
              variant="ghost"
              className="col-span-2"
              disabled={pos.lines.length === 0 || saving !== null}
              loading={saving === "quote"}
              onClick={saveQuotation}
            >
              <FileText className="size-5" aria-hidden /> حفظ كعرض سعر
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-3 pt-1.5">
            <PrimaryButton
              disabled={pos.lines.length === 0 || saving !== null}
              loading={saving === "quote"}
              onClick={saveQuotation}
            >
              <FileText className="size-5" aria-hidden /> حفظ عرض السعر
            </PrimaryButton>
            <PrimaryButton variant="ghost" onClick={() => setMode("invoice")}>
              العودة لوضع الفاتورة
            </PrimaryButton>
          </div>
        )}
      </div>

      {/* ═══════════ اللوحات السفلية ═══════════ */}
      <ItemPicker
        open={sheet === "picker"}
        onOpenChange={(o) => setSheet(o ? "picker" : null)}
        currencyCode={currencyCode}
        initialQuery={search}
        onAdd={(p) => pos.addProduct(p)}
      />
      <CustomerPicker
        open={sheet === "customer"}
        onOpenChange={(o) => setSheet(o ? "customer" : null)}
        selectedId={pos.customerId}
        onSelect={(id, name) => pos.setCustomer(id, name)}
      />
      <OptionPicker
        open={sheet === "cashbox"}
        onOpenChange={(o) => setSheet(o ? "cashbox" : null)}
        title="اختر الصندوق"
        selectedId={pos.cashboxId}
        onSelect={(id) => pos.setCashbox(id)}
        options={cashboxes.map((b) => ({
          id: b.id,
          label: b.name,
          subtitle: b.currency?.code ?? "",
        }))}
      />
      <OptionPicker
        open={sheet === "warehouse"}
        onOpenChange={(o) => setSheet(o ? "warehouse" : null)}
        title="اختر المخزن"
        selectedId={pos.warehouseId}
        onSelect={(id) => pos.setWarehouse(id)}
        options={warehouses.map((w) => ({
          id: w.id,
          label: w.name,
          subtitle: w.location ?? "",
        }))}
      />
      <OptionPicker
        open={sheet === "currency"}
        onOpenChange={(o) => setSheet(o ? "currency" : null)}
        title="اختر العملة"
        selectedId={pos.currencyId}
        onSelect={(id) => {
          const c = currencies.find((x) => x.id === id)
          if (c) {
            pos.setCurrency(c.id, c.code)
            // اختيار صندوق مطابق للعملة تلقائياً
            const box = cashboxes.find((b) => b.currencyId === c.id)
            if (box) pos.setCashbox(box.id)
          }
        }}
        options={currencies.map((c) => ({
          id: c.id,
          label: `${c.name} (${c.code})`,
          subtitle: c.isBase
            ? "العملة الأساسية"
            : boot?.rates[c.code]
              ? `1 ${c.code} = ${formatAmount(boot.rates[c.code].rate, { decimals: 0, showSymbol: false })} ر.ي`
              : "بلا سعر صرف",
        }))}
      />
      <OptionPicker
        open={sheet === "rep"}
        onOpenChange={(o) => setSheet(o ? "rep" : null)}
        title="اختر المندوب (اختياري)"
        selectedId={pos.salesRepId}
        onSelect={(id) => pos.setSalesRep(id)}
        options={[
          { id: null, label: "بدون مندوب" },
          ...reps.map((r) => ({
            id: r.id,
            label: r.name,
            subtitle:
              r.commissionType === "sales"
                ? `عمولة مبيعات ${r.commissionPercent}%`
                : r.commissionType === "collection"
                  ? `عمولة تحصيل ${r.commissionPercent}%`
                  : `عمولة مبيعات وتحصيل ${r.commissionPercent}%`,
          })),
        ]}
      />
      <DiscountSheet
        open={sheet === "discount"}
        onOpenChange={(o) => setSheet(o ? "discount" : null)}
        subtotal={totals.subtotal}
        currencyCode={currencyCode}
        currentDiscount={pos.invoiceDiscount}
        onApply={(amount) => pos.setInvoiceDiscount(amount)}
      />
      <TaxSheet
        open={sheet === "tax"}
        onOpenChange={(o) => setSheet(o ? "tax" : null)}
        currentRate={pos.taxRate}
        onApply={(r) => pos.setTaxRate(r)}
      />
      <PaymentSheet
        open={sheet === "payment"}
        onOpenChange={(o) => setSheet(o ? "payment" : null)}
        total={totals.total}
        currencyCode={currencyCode}
        onConfirm={(paid) => saveInvoice("mixed", paid)}
      />
      <SuccessSheet
        open={!!success}
        onOpenChange={(o) => !o && setSuccess(null)}
        invoice={success?.invoice ?? null}
        customerBalance={success?.customerBalance ?? null}
        onPrint={doPrint}
        onShare={doShare}
        onDone={() => {
          setSuccess(null);
          nextNoQ.refetch();
        }}
      />
    </div>
  );
}

// ═══════════ مكونات مساعدة داخل الشاشة ═══════════

function SettingsChip({
  icon: Icon,
  label,
  value,
  onClick,
  highlight,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 items-center gap-2.5 rounded-xl border px-3 text-start transition-colors active:scale-[0.98]",
        highlight
          ? "border-primary/50 bg-primary/10"
          : "border-border/70 bg-card hover:bg-accent/30"
      )}
    >
      <Icon className="size-4.5 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-muted-foreground">{label}</span>
        <span className="block truncate text-[14px] font-bold text-foreground">{value}</span>
      </span>
    </button>
  );
}

function QuickChip({
  label,
  value,
  onClick,
  active,
  danger,
  warning,
}: {
  label: string;
  value?: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] font-bold transition-colors",
        active && danger
          ? "border-[#F87171]/50 bg-[#F87171]/10 text-[#F87171]"
          : active && warning
            ? "border-[#FBBF24]/50 bg-[#FBBF24]/10 text-[#FBBF24]"
            : active
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border bg-card text-foreground hover:bg-accent/40"
      )}
    >
      {label}
      {value && <span className="font-num text-[12px]">{value}</span>}
    </button>
  );
}
