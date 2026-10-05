"use client";

/**
 * تفاصيل فاتورة المبيعات — عرض كامل: رأس + بيانات العميل (واتساب) + البنود
 * + الإجماليات + بطاقة الربح (تطبيق المالك) + الملاحظات + إجراءات
 * (طباعة إيصال/A4، مشاركة واتساب، إتمام المعلّقة، مرتجع معطّل للمرحلة القادمة).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Printer, MessageCircle, Undo2, CheckCircle2, UserRound, TrendingUp, Package,
  Wallet, UserCheck, Coins, Loader2, Phone,
} from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDateDisplay, formatTime12 } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { InvoiceDetailDto } from "@/domain/dto";
import type { BootstrapData as BootType } from "@/lib/types";
import {
  AppHeader, StatusChip, AmountText, KeyValueRow, PrimaryButton, SectionTitle, AppCard,
} from "@/components/ds";
import { printInvoice } from "@/components/print/receipt-print";
import { shareInvoiceWhatsApp, normalizeYemeniPhone } from "@/lib/share";
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

type ConvertPay = "cash" | "credit" | "mixed";

export default function SalesInvoiceDetailsScreen({
  invoiceId,
}: {
  invoiceId?: number | string;
}) {
  const id = Number(invoiceId ?? 0);
  const qc = useQueryClient();
  const { pop, push } = useNav();
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertPay, setConvertPay] = useState<ConvertPay>("cash");
  const [convertPaid, setConvertPaid] = useState("");
  const [converting, setConverting] = useState(false);

  const { data, isLoading } = useQuery<{ invoice: InvoiceDetailDto }>({
    queryKey: ["invoice", id],
    queryFn: () => getJson<{ invoice: InvoiceDetailDto }>(`/api/invoices/${id}`),
    enabled: Number.isFinite(id) && id > 0,
  });

  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader title="تفاصيل الفاتورة" />
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-[14px] text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden /> جارٍ التحميل…
        </div>
      </div>
    );
  }

  const inv = data.invoice;
  const cur = inv.currencyCode;
  const company = boot?.company;
  const isHeld = inv.payStatus === "held" && inv.status === "draft";

  function doPrint() {
    printInvoice(inv, {
      paper: (boot?.settings?.["print.paper"] as "58" | "80") ?? "80",
      template: (boot?.settings?.["print.template"] as "receipt" | "a4") ?? "receipt",
      company: {
        name: company?.name ?? "المتجر",
        phone: company?.phone ?? null,
        address: company?.address ?? null,
        footerText: company?.footerText ?? null,
      },
    });
  }

  async function doConvert() {
    setConverting(true);
    try {
      const cashboxId = (boot?.cashboxes ?? []).find(
        (b) => b.currencyId === boot?.currencies.find((c) => c.code === cur)?.id
      )?.id ?? null;
      await postJson(`/api/invoices/${inv.id}/convert`, {
        payMode: convertPay,
        paidAmount:
          convertPay === "mixed"
            ? Math.min(Math.max(0, Number(convertPaid) || 0), inv.total)
            : null,
        cashboxId,
      });
      toast.success(`تم إتمام البيع — الفاتورة ${inv.invoiceNo} مكتملة الآن`);
      setConvertOpen(false);
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      // postJson تعرض رسالة الخطأ
    } finally {
      setConverting(false);
    }
  }

  const customerPhone = inv.customer?.whatsapp || inv.customer?.phone;
  const waNumber = normalizeYemeniPhone(customerPhone);

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="تفاصيل الفاتورة" />

      <div className="flex flex-col gap-3 p-3 pb-6">
        {/* رأس الفاتورة */}
        <AppCard className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-num text-[19px] font-extrabold text-foreground">
              {inv.invoiceNo}
            </span>
            <StatusChip status={inv.payStatus} />
          </div>
          <span className="font-num text-[13px] text-muted-foreground">
            {formatDateDisplay(inv.issuedAt)} — {formatTime12(inv.createdAt)}
          </span>

          {inv.customer ? (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-muted/50 p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <UserRound className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold text-foreground">
                    {inv.customer.name}
                  </span>
                  {inv.customer.phone && (
                    <span className="font-num block text-[12.5px] text-muted-foreground" dir="ltr">
                      {inv.customer.phone}
                    </span>
                  )}
                </span>
              </div>
              {waNumber && (
                <a
                  href={`https://wa.me/${waNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="مراسلة العميل واتساب"
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#34D399]/15 text-[#34D399] hover:bg-[#34D399]/25"
                >
                  <Phone className="size-5" aria-hidden />
                </a>
              )}
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-[13.5px] text-muted-foreground">
              <UserRound className="size-4" aria-hidden /> عميل نقدي — زبون عابر
            </div>
          )}
        </AppCard>

        {/* بطاقة الربح (تطبيق المالك) */}
        {inv.profit != null && (
          <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/10 p-4">
            <span className="flex items-center gap-2 text-[14px] font-bold text-primary">
              <TrendingUp className="size-5" aria-hidden /> ربح الفاتورة (ريال يمني)
            </span>
            <AmountText value={inv.profit} currency="YER" size="lg" variant="primary" />
          </div>
        )}

        {/* بيانات مرجعية */}
        <AppCard className="p-4">
          <SectionTitle className="mb-1">بيانات الفاتورة</SectionTitle>
          {inv.salesRepName && (
            <KeyValueRow
              label="المندوب"
              value={
                <span className="flex items-center gap-1.5">
                  <UserCheck className="size-4 text-muted-foreground" aria-hidden /> {inv.salesRepName}
                </span>
              }
            />
          )}
          <KeyValueRow
            label="المخزن"
            value={
              <span className="flex items-center gap-1.5">
                <Package className="size-4 text-muted-foreground" aria-hidden /> {inv.warehouseName}
              </span>
            }
          />
          {inv.cashboxName && (
            <KeyValueRow
              label="الصندوق"
              value={
                <span className="flex items-center gap-1.5">
                  <Wallet className="size-4 text-muted-foreground" aria-hidden /> {inv.cashboxName}
                </span>
              }
            />
          )}
          <KeyValueRow
            label="العملة"
            value={
              <span className="font-num flex items-center gap-1.5">
                <Coins className="size-4 text-muted-foreground" aria-hidden /> {cur}
                {!inv.exchangeRate || inv.exchangeRate === 1 ? "" : ` (سعر الصرف: ${formatAmount(inv.exchangeRate, { decimals: 0, showSymbol: false })})`}
              </span>
            }
          />
        </AppCard>

        {/* البنود */}
        <AppCard className="p-0">
          <div className="p-4 pb-2">
            <SectionTitle>البنود ({inv.items.length})</SectionTitle>
          </div>
          <ul className="px-2 pb-2">
            {inv.items.map((it) => (
              <li
                key={it.id}
                className="flex items-start justify-between gap-3 border-b border-border/50 px-2 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-medium text-foreground">
                    {it.productName}
                    {it.unitName && (
                      <span className="ms-1 text-[12px] text-muted-foreground">({it.unitName})</span>
                    )}
                  </p>
                  <p className="font-num mt-0.5 text-[12.5px] text-muted-foreground" dir="ltr">
                    {formatAmount(it.qty, { decimals: it.qty % 1 ? 3 : 0, showSymbol: false })} ×{" "}
                    {formatAmount(it.unitPrice, { currency: cur })}
                    {it.discountPercent > 0 && ` − ${it.discountPercent}%`}
                  </p>
                </div>
                <AmountText value={it.lineTotal} currency={cur} size="md" />
              </li>
            ))}
          </ul>
        </AppCard>

        {/* الإجماليات */}
        <AppCard className="p-4">
          <SectionTitle className="mb-1">الإجماليات</SectionTitle>
          <KeyValueRow label="الإجمالي (قبل الخصم)" value={<AmountText value={inv.subtotal} currency={cur} />} />
          {inv.discountAmount > 0 && (
            <KeyValueRow
              label="الخصم"
              value={<AmountText value={-inv.discountAmount} currency={cur} variant="neg" />}
            />
          )}
          {inv.taxAmount > 0 && (
            <KeyValueRow
              label={`الضريبة (${inv.taxRate}%)`}
              value={<AmountText value={inv.taxAmount} currency={cur} variant="due" />}
            />
          )}
          <KeyValueRow
            label="الصافي"
            value={<AmountText value={inv.total} currency={cur} size="lg" variant="neutral" />}
          />
          {isHeld ? (
            <KeyValueRow
              label="الحالة"
              value={<span className="text-[13.5px] text-[#94A3B8]">معلّقة — بلا أثر مخزني/نقدي بعد</span>}
            />
          ) : (
            <>
              <KeyValueRow
                label="المدفوع"
                value={<AmountText value={inv.paidAmount} currency={cur} variant="pos" />}
              />
              <KeyValueRow
                label="المتبقي (آجل)"
                value={<AmountText value={inv.dueAmount} currency={cur} variant="due" />}
              />
            </>
          )}
          {inv.payments.length > 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              {inv.payments
                .map(
                  (p) =>
                    `قبض ${formatAmount(p.amount, { currency: cur })}${p.cashboxName ? ` — ${p.cashboxName}` : ""}`
                )
                .join(" • ")}
            </p>
          )}
        </AppCard>

        {/* الملاحظات */}
        {(inv.notesPrinted || inv.notesInternal) && (
          <AppCard className="p-4">
            <SectionTitle className="mb-1">ملاحظات</SectionTitle>
            {inv.notesPrinted && (
              <p className="text-[13.5px] text-foreground">
                <span className="text-muted-foreground">تُطبع: </span>
                {inv.notesPrinted}
              </p>
            )}
            {inv.notesInternal && (
              <p className="mt-1 text-[13.5px] text-foreground">
                <span className="text-muted-foreground">داخلية (لا تُطبع): </span>
                {inv.notesInternal}
              </p>
            )}
          </AppCard>
        )}

        {/* الإجراءات */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <PrimaryButton onClick={doPrint}>
              <Printer className="size-5" aria-hidden /> طباعة
            </PrimaryButton>
            <PrimaryButton variant="outline" onClick={() => shareInvoiceWhatsApp(inv, company?.name ?? "المتجر")}>
              <MessageCircle className="size-5" aria-hidden /> مشاركة واتساب
            </PrimaryButton>
          </div>

          {isHeld ? (
            <PrimaryButton variant="success" onClick={() => setConvertOpen(true)}>
              <CheckCircle2 className="size-5" aria-hidden /> إتمام البيع (تحويل المعلّقة)
            </PrimaryButton>
          ) : (
            <PrimaryButton
              variant="warning"
              onClick={() =>
                push("purchases-returns", { mode: "sale_return", originalInvoiceId: inv.id })
              }
            >
              <Undo2 className="size-5" aria-hidden /> مرتجع بيع
            </PrimaryButton>
          )}

          <PrimaryButton variant="ghost" onClick={pop}>
            رجوع
          </PrimaryButton>
        </div>
      </div>

      {/* لوحة إتمام المعلّقة */}
      <Drawer open={convertOpen} onOpenChange={setConvertOpen}>
        <DrawerContent className="rounded-t-2xl">
          <DrawerHeader className="text-start">
            <DrawerTitle className="text-base font-bold">إتمام البيع — {inv.invoiceNo}</DrawerTitle>
            <DrawerDescription>
              سيُخصم المخزون ويُسجَّل القبض في الصندوق داخل معاملة ذرّية واحدة
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <div className="flex gap-2">
              {(
                [
                  { id: "cash", label: "نقدي" },
                  { id: "credit", label: "آجل" },
                  { id: "mixed", label: "مختلط" },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setConvertPay(o.id)}
                  className={cn(
                    "flex-1 rounded-xl border px-3 py-2.5 text-[14px] font-bold transition-colors",
                    convertPay === o.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent/30"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {convertPay === "mixed" && (
              <div className="flex h-12 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3">
                <input
                  type="number"
                  inputMode="decimal"
                  value={convertPaid}
                  onChange={(e) => setConvertPaid(e.target.value)}
                  placeholder={`المدفوع من ${formatAmount(inv.total, { currency: cur })}`}
                  aria-label="المبلغ المدفوع"
                  className="font-num h-full min-w-0 flex-1 bg-transparent text-[16px] font-bold text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none"
                />
                <span className="text-[13px] text-muted-foreground">{cur}</span>
              </div>
            )}
            {convertPay === "credit" && !inv.customer && (
              <p className="text-[13px] text-[#F87171]">
                الفاتورة الآجلة تتطلب اختيار عميل — الفاتورة الحالية بلا عميل
              </p>
            )}
            <div className="rounded-xl bg-muted/40 p-3 text-[13.5px]">
              <div className="flex justify-between py-0.5">
                <span className="text-muted-foreground">إجمالي الفاتورة</span>
                <span className="font-num font-bold">{formatAmount(inv.total, { currency: cur })}</span>
              </div>
            </div>
            <PrimaryButton
              block
              variant="success"
              loading={converting}
              disabled={convertPay === "credit" && !inv.customer}
              onClick={doConvert}
            >
              إتمام البيع الآن
            </PrimaryButton>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
