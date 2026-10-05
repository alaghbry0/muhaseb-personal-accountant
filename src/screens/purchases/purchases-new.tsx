"use client";

/**
 * فاتورة شراء جديدة — شاشة POS للمشتريات: المورد (إلزامي للآجل) + الصندوق + المخزن
 * + العملة/الصرف + بنود بسعر التكلفة (الشراء) + لوحة سفلية (الإجمالي + نقدي/آجل/مختلط)
 * + «حفظ فاتورة الشراء» مع تلميح تحديث متوسط التكلفة WAC تلقائياً.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Truck, PackageSearch, Trash2, Minus, Plus, Loader2, Coins, Warehouse as WarehouseIcon,
  Wallet, UserRound, Save, Info,
} from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDateDisplay, formatTime12 } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { calcInvoiceTotals } from "@/domain/invoice";
import type { ProductSearchItemDto, InvoiceDetailDto } from "@/domain/dto";
import type { BootstrapData as BootType } from "@/lib/types";
import { AppHeader, PrimaryButton, EmptyState } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { CostItemPicker } from "@/components/inventory/cost-item-picker";
import { DocSuccessSheet } from "@/components/inventory/doc-success-sheet";
import { printDocument } from "@/components/print/receipt-print";
import { cn } from "@/lib/utils";

interface SupplierRow {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
}

interface PurchaseLine {
  productId: number;
  name: string;
  unitName: string | null;
  unitId: number | null;
  costPrice: number;
  qty: number;
}

type PayMode = "cash" | "credit" | "mixed";

export default function PurchasesNewScreen({
  preselectProductId,
}: {
  preselectProductId?: number | string;
}) {
  const nav = useNav();
  const qc = useQueryClient();

  const [supplier, setSupplier] = useState<SupplierRow | null>(null);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [currencyId, setCurrencyId] = useState<number | null>(null);
  const [cashboxId, setCashboxId] = useState<number | null>(null);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [paidInput, setPaidInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedInvoice, setSavedInvoice] = useState<InvoiceDetailDto | null>(null);
  const [savedBalance, setSavedBalance] = useState<number | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);

  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });
  const { data: nextNo } = useQuery<{ invoiceNo: string }>({
    queryKey: ["next-number", "purchase"],
    queryFn: () => getJson<{ invoiceNo: string }>("/api/invoices/next-number?docType=purchase"),
  });

  const base = boot?.baseCurrency ?? null;
  const currencies = boot?.currencies ?? [];
  const selectedCurrency = currencies.find((c) => c.id === currencyId) ?? base;
  const curCode = selectedCurrency?.code ?? "YER";
  const exchangeRate =
    selectedCurrency?.id === base?.id || !selectedCurrency
      ? 1
      : boot?.rates?.[curCode]?.rate ?? 1;

  // تهيئة المخزن/العملة/الصندوق مرة واحدة
  useEffect(() => {
    if (!boot || warehouseId) return;
    setWarehouseId((boot.warehouses.find((w) => w.isDefault) ?? boot.warehouses[0])?.id ?? null);
    if (base) setCurrencyId(base.id);
  }, [boot?.warehouses.length, base?.id]);

  // الصندوق يتبع العملة المختارة
  useEffect(() => {
    if (!boot || !currencyId) return;
    const matched = boot.cashboxes.find((b) => b.currencyId === currencyId);
    setCashboxId(matched?.id ?? null);
  }, [boot, currencyId]);

  // صنف محضور من شاشة التنبيهات
  const preselectId = Number(preselectProductId ?? 0);
  useEffect(() => {
    if (!preselectId || lines.length > 0) return;
    let alive = true;
    getJson<{ products: ProductSearchItemDto[] }>(`/api/products/search?ids=${preselectId}`).then(
      (d) => {
        if (!alive) return;
        const p = d.products[0];
        if (p) {
          setLines((ls) =>
            ls.some((x) => x.productId === p.id)
              ? ls
              : [
                  ...ls,
                  {
                    productId: p.id,
                    name: p.name,
                    unitName: p.unitName,
                    unitId: null,
                    costPrice: p.costPrice,
                    qty: 1,
                  },
                ]
          );
        }
      }
    ).catch(() => {});
    return () => {
      alive = false;
    };
  }, [preselectId]);

  const totals = useMemo(
    () =>
      calcInvoiceTotals(
        lines.map((l) => ({ qty: l.qty, unitPrice: l.costPrice })),
        { invoiceDiscount: Number(invoiceDiscount) || 0, taxRate: 0, paidAmount: 0 }
      ),
    [lines, invoiceDiscount]
  );

  const paidAmount =
    payMode === "cash"
      ? totals.total
      : payMode === "credit"
        ? 0
        : Math.min(Math.max(0, Number(paidInput) || 0), totals.total);

  function addProduct(p: ProductSearchItemDto) {
    setLines((ls) => {
      const existing = ls.find((x) => x.productId === p.id);
      if (existing) {
        return ls.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x));
      }
      return [
        ...ls,
        {
          productId: p.id,
          name: p.name,
          unitName: p.unitName,
          unitId: null,
          costPrice: p.costPrice || 0,
          qty: 1,
        },
      ];
    });
  }

  function updateLine(productId: number, patch: Partial<PurchaseLine>) {
    setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  async function save() {
    if (lines.length === 0) {
      toast.error("أضف صنفاً واحداً على الأقل");
      return;
    }
    if (payMode !== "cash" && !supplier) {
      toast.error("فاتورة الشراء الآجلة تتطلب اختيار مورد");
      return;
    }
    if (payMode !== "credit" && !cashboxId) {
      toast.error("اختر صندوقاً لتسجيل الدفع النقدي للمورد");
      return;
    }
    setSaving(true);
    try {
      const result = await postJson<{
        invoice: InvoiceDetailDto;
        supplierBalance: number | null;
      }>("/api/invoices", {
        docType: "purchase",
        supplierId: supplier?.id ?? null,
        cashboxId,
        warehouseId,
        currencyId,
        exchangeRate,
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty, unitPrice: l.costPrice })),
        invoiceDiscount: Number(invoiceDiscount) || 0,
        payMode,
        paidAmount: payMode === "mixed" ? paidAmount : null,
      });
      setSavedInvoice(result.invoice);
      setSavedBalance(result.supplierBalance);
      setSuccessOpen(true);
      setLines([]);
      setInvoiceDiscount("");
      setPaidInput("");
      setPayMode("cash");
      qc.invalidateQueries({ queryKey: ["next-number"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["stock", "alerts"] });
    } catch {
      /* toast من api */
    } finally {
      setSaving(false);
    }
  }

  const warehouses = boot?.warehouses ?? [];
  const matchedCashbox = (boot?.cashboxes ?? []).find((b) => b.id === cashboxId);

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="فاتورة شراء">
        <div className="flex flex-col gap-1 px-3 pb-2">
          <div className="flex items-center justify-between gap-2">
            <span className="font-num rounded-full border border-border bg-muted/40 px-3 py-1 text-[12.5px] font-bold text-foreground">
              {nextNo?.invoiceNo ?? "…"}
            </span>
            <span className="font-num text-[12px] text-muted-foreground">
              {formatDateDisplay(new Date())} | {formatTime12(new Date())}
            </span>
            {exchangeRate !== 1 && (
              <span className="font-num rounded-full bg-[#22D3EE]/10 px-2.5 py-1 text-[11.5px] font-bold text-[#22D3EE]">
                {curCode} = {formatAmount(exchangeRate, { decimals: 0, showSymbol: false })} ر.ي
              </span>
            )}
          </div>
        </div>
      </AppHeader>

      {/* إعدادات 2×2 */}
      <div className="grid grid-cols-2 gap-2 px-3 pb-2">
        <button
          type="button"
          onClick={() => setSupplierOpen(true)}
          className={cn(
            "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-start text-[13.5px] transition-colors",
            supplier ? "border-primary/40 bg-primary/5 text-foreground" : "border-border bg-muted/40 text-muted-foreground"
          )}
        >
          <UserRound className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-bold">
            {supplier ? supplier.name : "المورد (نقدي)"}
          </span>
        </button>
        <select
          value={warehouseId ?? ""}
          onChange={(e) => setWarehouseId(Number(e.target.value))}
          aria-label="المخزن"
          className="h-12 min-w-0 rounded-xl border border-border bg-muted/40 px-2 text-[13.5px] font-bold text-foreground outline-none focus:border-primary/70"
        >
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              <WarehouseIcon className="size-4" /> {w.name}
            </option>
          ))}
        </select>
        <select
          value={currencyId ?? ""}
          onChange={(e) => setCurrencyId(Number(e.target.value))}
          aria-label="العملة"
          className="h-12 min-w-0 rounded-xl border border-border bg-muted/40 px-2 text-[13.5px] font-bold text-foreground outline-none focus:border-primary/70"
        >
          {currencies.map((c) => (
            <option key={c.id} value={c.id}>{c.code}</option>
          ))}
        </select>
        <select
          value={cashboxId ?? ""}
          onChange={(e) => setCashboxId(Number(e.target.value))}
          aria-label="الصندوق"
          className="h-12 min-w-0 rounded-xl border border-border bg-muted/40 px-2 text-[13.5px] font-bold text-foreground outline-none focus:border-primary/70"
        >
          <option value="">بلا صندوق (آجل)</option>
          {(boot?.cashboxes ?? []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* بحث الأصناف */}
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex h-12 w-full items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3 text-[14px] font-bold text-primary hover:bg-primary/10 active:scale-[0.99]"
        >
          <PackageSearch className="size-5" aria-hidden />
          ابحث عن صنف لإضافته (بالاسم أو الباركود)…
        </button>
      </div>

      {/* البنود */}
      <div className="flex-1 px-3">
        {lines.length === 0 ? (
          <EmptyState
            icon={Truck}
            message="الفاتورة فارغة"
            hint="أضف الأصناف المشتراة بسعر تكلفتها — يحدّث المخزون ومتوسط التكلفة تلقائياً عند الحفظ"
          />
        ) : (
          <div className="flex flex-col gap-2 pb-2">
            {lines.map((l) => {
              const lineTotal = l.qty * l.costPrice;
              return (
                <div key={l.productId} className="rounded-2xl border border-border/70 bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-foreground">{l.name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        سعر التكلفة {l.unitName ? `(${l.unitName})` : ""} — {curCode}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}
                      aria-label={`حذف ${l.name}`}
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[#F87171] hover:bg-[#F87171]/10"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          updateLine(l.productId, { qty: Math.max(1, l.qty - 1) })
                        }
                        aria-label="إنقاص الكمية"
                        className="flex size-11 items-center justify-center rounded-full border border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171] active:scale-90"
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <span className="font-num w-14 text-center text-[17px] font-extrabold text-foreground">
                        {formatAmount(l.qty, { decimals: l.qty % 1 ? 3 : 0, showSymbol: false })}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateLine(l.productId, { qty: l.qty + 1 })}
                        aria-label="زيادة الكمية"
                        className="flex size-11 items-center justify-center rounded-full border border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399] active:scale-90"
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      dir="ltr"
                      value={l.costPrice || ""}
                      onChange={(e) =>
                        updateLine(l.productId, { costPrice: Number(e.target.value) || 0 })
                      }
                      aria-label={`سعر تكلفة ${l.name}`}
                      className="font-num h-11 min-w-0 flex-1 rounded-xl border border-border bg-muted/60 px-2 text-center text-[15px] font-bold text-foreground outline-none focus:border-primary/70"
                    />
                    <span className="font-num shrink-0 text-[15px] font-extrabold text-primary" dir="ltr">
                      {formatAmount(lineTotal, { currency: curCode })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* لوحة سفلية */}
      <div className="sticky bottom-0 z-10 border-t border-border/60 bg-card/95 p-3 backdrop-blur">
        <div className="mb-2 flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <Info className="size-4 shrink-0 text-primary" aria-hidden />
          سيتم تحديث متوسط التكلفة (WAC) تلقائياً لكل صنف عند الحفظ
        </div>
        <div className="mb-2 flex justify-between text-[14px]">
          <span className="text-muted-foreground">الإجمالي</span>
          <span className="font-num text-[18px] font-extrabold text-primary" dir="ltr">
            {formatAmount(totals.total, { currency: curCode })}
          </span>
        </div>
        <div className="mb-2 flex gap-1.5">
          {(
            [
              { id: "cash", label: "نقدي (سداد كامل)" },
              { id: "credit", label: "آجل (على المورد)" },
              { id: "mixed", label: "مختلط" },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setPayMode(o.id)}
              className={cn(
                "flex-1 rounded-xl border px-2 py-2.5 text-[12.5px] font-bold transition-colors",
                payMode === o.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/30"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {payMode === "mixed" && (
          <div className="mb-2 flex h-12 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3">
            <Wallet className="size-4 text-muted-foreground" aria-hidden />
            <input
              type="number"
              inputMode="decimal"
              dir="ltr"
              value={paidInput}
              onChange={(e) => setPaidInput(e.target.value)}
              placeholder={`المدفوع الآن من ${formatAmount(totals.total, { currency: curCode })}`}
              aria-label="المبلغ المدفوع"
              className="font-num h-full min-w-0 flex-1 bg-transparent text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none"
            />
            <span className="text-[13px] text-muted-foreground">{curCode}</span>
          </div>
        )}
        {payMode === "credit" && !supplier && (
          <p className="mb-2 text-[13px] text-[#F87171]">الفاتورة الآجلة تتطلب اختيار مورد</p>
        )}
        {payMode !== "credit" && !matchedCashbox && (
          <p className="mb-2 text-[13px] text-[#F87171]">
            لا صندوق بعملة {curCode} — اختر صندوقاً أو حوّل الفاتورة آجلة
          </p>
        )}
        <PrimaryButton
          block
          variant="primary"
          loading={saving}
          disabled={
            lines.length === 0 ||
            (payMode !== "cash" && !supplier) ||
            (payMode !== "credit" && !cashboxId)
          }
          onClick={save}
        >
          <Save className="size-5" aria-hidden /> حفظ فاتورة الشراء
        </PrimaryButton>
      </div>

      {/* منتقي الأصناف */}
      <CostItemPicker open={pickerOpen} onOpenChange={setPickerOpen} mode="cost" onAdd={addProduct} />

      {/* منتقي الموردين */}
      <PosSheet open={supplierOpen} onOpenChange={setSupplierOpen} title="اختر المورد" description="إلزامي للفاتورة الآجلة — الرصيد دائن (مستحق له)">
        <SupplierPickerBody
          onPick={(s) => {
            setSupplier(s);
            setSupplierOpen(false);
          }}
        />
      </PosSheet>

      {/* لوحة النجاح */}
      <DocSuccessSheet
        open={successOpen}
        onOpenChange={setSuccessOpen}
        invoice={savedInvoice}
        partyBalance={savedBalance}
        partyLabel={savedInvoice?.supplier?.name ?? "المورد"}
        onPrint={(inv) =>
          printDocument(inv, "purchase", {
            paper: (boot?.settings?.["print.paper"] as "58" | "80") ?? "80",
            company: {
              name: boot?.company?.name ?? "المتجر",
              phone: boot?.company?.phone ?? null,
              address: boot?.company?.address ?? null,
              footerText: boot?.company?.footerText ?? null,
            },
          })
        }
        onDone={() => {
          setSuccessOpen(false);
          nav.replace("purchases-details", { invoiceId: savedInvoice?.id });
        }}
      />
    </div>
  );
}

function SupplierPickerBody({ onPick }: { onPick: (s: SupplierRow | null) => void }) {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery<{ suppliers: SupplierRow[] }>({
    queryKey: ["suppliers", q],
    queryFn: () => getJson<{ suppliers: SupplierRow[] }>(`/api/suppliers?q=${encodeURIComponent(q)}`),
  });
  const suppliers = data?.suppliers ?? [];

  return (
    <div className="flex flex-col gap-2 pb-2">
      <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 focus-within:border-primary/70">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث عن مورد…"
          autoFocus
          aria-label="بحث الموردين"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => onPick(null)}
        className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-[14px] font-bold text-foreground hover:bg-accent/30"
      >
        <Coins className="size-4 text-muted-foreground" aria-hidden /> مورد نقدي — بلا حساب
      </button>
      {isLoading && (
        <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> جارٍ التحميل…
        </p>
      )}
      {suppliers.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onPick(s)}
          className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 text-start hover:border-primary/50 hover:bg-accent/30"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-bold text-foreground">{s.name}</p>
            {s.phone && (
              <p className="font-num text-[12px] text-muted-foreground" dir="ltr">{s.phone}</p>
            )}
          </div>
          <span
            className={cn(
              "font-num shrink-0 text-[13px] font-bold",
              s.balance > 0 ? "text-[#FBBF24]" : "text-[#34D399]"
            )}
            dir="ltr"
          >
            {formatAmount(s.balance, { currency: "YER", decimals: 0 })}
          </span>
        </button>
      ))}
    </div>
  );
}
