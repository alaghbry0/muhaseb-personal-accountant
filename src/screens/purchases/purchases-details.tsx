"use client";

/**
 * تفاصيل مستند مشتريات/مرتجع — فاتورة شراء أو مرتجع شراء أو مرتجع بيع:
 * بيانات المورد/العميل + البنود + الإجماليات (المدفوع/المتبقي أو خصم الحساب)
 * + الفاتورة الأصلية للمرتجع المرتبط + إجراءات: طباعة / واتساب للمورد /
 * مرتجع شراء (جزئي عبر شاشة المرتجعات) / مرتجع كامل (بضغطة واحدة).
 */
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Printer, MessageCircle, Truck, Undo2, Loader2, UserRound, Package, Wallet, Coins,
  CheckCircle2, ArrowLeftRight,
} from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDate, formatTime12 } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { InvoiceDetailDto } from "@/domain/dto";
import type { BootstrapData as BootType } from "@/lib/types";
import {
  AppHeader, StatusChip, AmountText, KeyValueRow, PrimaryButton, SectionTitle, AppCard,
} from "@/components/ds";
import { printDocument } from "@/components/print/receipt-print";
import { normalizeYemeniPhone } from "@/lib/share";
import { buildSupplierShareText } from "@/lib/share-supplier";
import { cn } from "@/lib/utils";

const DOC_LABELS: Record<string, string> = {
  purchase: "فاتورة شراء",
  purchase_return: "مرتجع شراء",
  sale_return: "مرتجع بيع",
};

export default function PurchasesDetailsScreen({
  invoiceId: iid,
}: {
  invoiceId?: number | string;
}) {
  const id = Number(iid ?? 0);
  const nav = useNav();

  const { data, isLoading } = useQuery<{ invoice: InvoiceDetailDto }>({
    queryKey: ["invoice", id],
    queryFn: () => getJson<{ invoice: InvoiceDetailDto }>(`/api/invoices/${id}`),
    enabled: id > 0,
  });
  const { data: boot } = useQuery<BootType>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootType>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader title="تفاصيل المستند" />
        <div className="flex flex-1 items-center justify-center gap-2 py-16 text-[14px] text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden /> جارٍ التحميل…
        </div>
      </div>
    );
  }

  const inv = data.invoice;
  const cur = inv.currencyCode;
  const company = boot?.company;
  const docLabel = DOC_LABELS[inv.docType] ?? "مستند";
  const isPurchase = inv.docType === "purchase";
  const isPR = inv.docType === "purchase_return";
  const isSR = inv.docType === "sale_return";

  // الرابط بالفاتورة الأصلية: notesInternal يبدأ بـ original:INV-xxx\n
  const originalNo = inv.notesInternal?.startsWith("original:")
    ? inv.notesInternal.split("\n")[0].replace("original:", "").trim()
    : null;
  const userNote = inv.notesInternal?.includes("\n")
    ? inv.notesInternal.split("\n").slice(1).join("\n").trim()
    : inv.notesInternal && !originalNo
      ? inv.notesInternal
      : null;

  const party = isSR ? inv.customer : inv.supplier;
  const partyLabel = isSR ? "العميل" : "المورد";
  const partyPhone = isSR
    ? inv.customer?.whatsapp || inv.customer?.phone
    : inv.supplier?.phone;
  const waNumber = normalizeYemeniPhone(partyPhone);

  function doPrint() {
    printDocument(
      inv,
      inv.docType === "purchase" ? "purchase" : isPR ? "purchase_return" : "sale_return",
      {
        paper: (boot?.settings?.["print.paper"] as "58" | "80") ?? "80",
        company: {
          name: company?.name ?? "المتجر",
          phone: company?.phone ?? null,
          address: company?.address ?? null,
          footerText: company?.footerText ?? null,
        },
      }
    );
  }

  async function fullReturn() {
    if (!window.confirm("إرجاع كل بنود المستند بنفس الكميات كمرتجع شراء؟")) return;
    try {
      const result = await postJson<{
        invoice: InvoiceDetailDto;
        supplierBalance: number | null;
        customerBalance: number | null;
      }>("/api/invoices", {
        docType: "purchase_return",
        originalInvoiceId: inv.id,
        warehouseId: inv.warehouseId,
        currencyId: inv.currencyId,
        exchangeRate: inv.exchangeRate,
        cashboxId: boot?.cashboxes?.find((b) => b.currencyId === inv.currencyId)?.id ?? null,
        refundMethod: "credit",
        items: inv.items.map((it) => ({
          productId: it.productId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent,
          taxPercent: it.taxPercent,
        })),
        notesPrinted: `مرتجع كامل عن ${inv.invoiceNo}`,
      });
      toast.success(`تم إنشاء المرتجع الكامل ${result.invoice.invoiceNo}`);
      nav.replace("purchases-details", { invoiceId: result.invoice.id });
    } catch {
      /* toast من api */
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title={docLabel} />

      <div className="flex flex-col gap-3 p-3 pb-8">
        {/* رأس المستند */}
        <AppCard className="flex flex-col gap-2 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-num text-[19px] font-extrabold text-foreground">
              {inv.invoiceNo}
            </span>
            <StatusChip status={inv.payStatus} />
          </div>
          <span className="font-num text-[13px] text-muted-foreground">
            {formatDate(inv.issuedAt)} — {formatTime12(inv.createdAt)}
          </span>

          {party ? (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-muted/50 p-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <UserRound className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold text-foreground">
                    {party.name}
                  </span>
                  <span className="text-[11.5px] text-muted-foreground">{partyLabel}</span>
                </span>
              </div>
              {waNumber && (
                <a
                  href={`https://wa.me/${waNumber}?text=${encodeURIComponent(
                    buildSupplierShareText(inv, company?.name ?? "المتجر")
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="مراسلة واتساب"
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#34D399]/15 text-[#34D399] hover:bg-[#34D399]/25"
                >
                  <MessageCircle className="size-5" aria-hidden />
                </a>
              )}
            </div>
          ) : (
            <div className="mt-1 flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-[13.5px] text-muted-foreground">
              <Truck className="size-4" aria-hidden /> مورد نقدي — بلا حساب
            </div>
          )}

          {originalNo && (
            <div className="flex items-center gap-2 rounded-xl border border-[#22D3EE]/30 bg-[#22D3EE]/10 px-3 py-2 text-[13px] text-[#22D3EE]">
              <ArrowLeftRight className="size-4 shrink-0" aria-hidden />
              مرتجع مرتبط بالفاتورة <span className="font-num font-bold">{originalNo}</span>
            </div>
          )}
        </AppCard>

        {/* بيانات مرجعية */}
        <AppCard className="p-4">
          <SectionTitle className="mb-1">بيانات المستند</SectionTitle>
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
                {inv.exchangeRate !== 1 &&
                  ` (الصرف: ${formatAmount(inv.exchangeRate, { decimals: 0, showSymbol: false })})`}
              </span>
            }
          />
          <KeyValueRow
            label="التكلفة (بالأساس)"
            value={<AmountText value={inv.costTotal} currency="YER" variant="neutral" />}
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
            label={isPurchase ? "الصافي" : "إجمالي المسترد"}
            value={<AmountText value={inv.total} currency={cur} size="lg" variant="neutral" />}
          />
          <KeyValueRow
            label={inv.paidAmount > 0 ? (isSR ? "المردود نقدياً" : "المدفوع نقدياً") : "المدفوع"}
            value={<AmountText value={inv.paidAmount} currency={cur} variant="pos" />}
          />
          {inv.dueAmount > 0 && (
            <KeyValueRow
              label="المتبقي (آجل للمورد)"
              value={<AmountText value={inv.dueAmount} currency={cur} variant="due" />}
            />
          )}
          {inv.dueAmount < 0 && (
            <KeyValueRow
              label="خُصم من الحساب"
              value={
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-4 text-[#34D399]" aria-hidden />
                  <AmountText value={Math.abs(inv.dueAmount)} currency={cur} variant="pos" />
                </span>
              }
            />
          )}
        </AppCard>

        {/* الملاحظات */}
        {(inv.notesPrinted || userNote) && (
          <AppCard className="p-4">
            <SectionTitle className="mb-1">ملاحظات</SectionTitle>
            {inv.notesPrinted && (
              <p className="text-[13.5px] text-foreground">
                <span className="text-muted-foreground">تُطبع: </span>
                {inv.notesPrinted}
              </p>
            )}
            {userNote && (
              <p className="mt-1 text-[13.5px] text-foreground">
                <span className="text-muted-foreground">داخلية: </span>
                {userNote}
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
            {waNumber && (
              <PrimaryButton
                variant="outline"
                onClick={() =>
                  window.open(
                    `https://wa.me/${waNumber}?text=${encodeURIComponent(
                      buildSupplierShareText(inv, company?.name ?? "المتجر")
                    )}`,
                    "_blank"
                  )
                }
              >
                <MessageCircle className="size-5" aria-hidden /> واتساب
              </PrimaryButton>
            )}
          </div>

          {isPurchase && inv.status === "completed" && (
            <>
              <PrimaryButton
                variant="warning"
                onClick={() =>
                  nav.push("purchases-returns", {
                    mode: "purchase_return",
                    originalInvoiceId: inv.id,
                  })
                }
              >
                <Undo2 className="size-5" aria-hidden /> مرتجع شراء (اختيار بنود)
              </PrimaryButton>
              <PrimaryButton variant="danger" onClick={fullReturn}>
                <Undo2 className="size-5" aria-hidden /> مرتجع كامل (كل البنود)
              </PrimaryButton>
            </>
          )}
          {isPR && (
            <div className={cn("rounded-xl bg-muted/40 px-3 py-2.5 text-[12.5px] text-muted-foreground")}>
              مرتجع شراء — الكميات خرجت من المخزون و{inv.dueAmount < 0 ? "خُصمت من حساب المورد" : "استُردت نقداً"}
            </div>
          )}
          <PrimaryButton variant="ghost" onClick={() => nav.pop()}>
            رجوع
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
