"use client";

/**
 * بطاقة العميل + كشف الحساب — 06_العملاء/05 (ملف العميل):
 * رأس (رصيد كبير + حد ائتمان بشريط تقدم) + إجراءات (تحصيل/تعديل/أرشفة)
 * + كشف حساب بفترات (رصيد متحرك مدين/دائن + إجماليات + طباعة A4 + واتساب)
 * + آخر 5 فواتير + الأقساط المتأخرة. (FR-03-02، FR-03-04، FR-03-06، FR-03-09)
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone, Printer, Pencil, Archive, ArchiveRestore, ReceiptText, CalendarClock, FileText,
} from "lucide-react";
import { toast } from "sonner";
import { getJson, patchJson } from "@/lib/api";
import { formatAmount, formatDate, resolvePeriod } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { CustomerDto, StatementResult } from "@/domain/parties";
import type { BootstrapData } from "@/lib/types";
import {
  AppHeader, AppCard, AmountText, StatusChip, EmptyState, SectionTitle, KeyValueRow, PrimaryButton,
} from "@/components/ds";
import { CustomerForm } from "@/components/parties/customer-form";
import { VoucherForm } from "@/components/parties/voucher-form";
import { Field, DateInput } from "@/components/parties/field";
import { buildDebtReminderText, remindViaWhatsApp } from "@/components/parties/whatsapp";
import { printStatement } from "@/components/print/statement-print";
import { cn } from "@/lib/utils";

interface CustomerFileResponse {
  customer: CustomerDto
  stats: { salesTotalBase: number; invoicesCount: number }
  lastInvoices: Array<{
    id: number; invoiceNo: string; issuedAt: string; payStatus: string
    total: number; dueAmount: number; currencyCode: string
  }>
  overdueInstallments: Array<{
    planId: number; seq: number; installmentId: number; dueDate: string
    amount: number; remaining: number; invoiceNo: string | null
  }>
}

type PeriodId = "" | "month" | "d30" | "custom"

const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: "", label: "كل الفترات" },
  { id: "month", label: "هذا الشهر" },
  { id: "d30", label: "آخر 30 يوماً" },
  { id: "custom", label: "فترة مخصصة" },
]

export default function PartiesCustomerCardScreen({ customerId }: { customerId?: number }) {
  const { push, pop } = useNav();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<PeriodId>("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [collectOpen, setCollectOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 30_000,
  });

  const { data, isLoading } = useQuery<CustomerFileResponse>({
    queryKey: ["parties", "customer-file", customerId],
    queryFn: () => getJson<CustomerFileResponse>(`/api/parties/customers/${customerId}`),
    enabled: Boolean(customerId),
  });

  const range = useMemo(() => {
    if (period === "month") {
      const r = resolvePeriod("month");
      return { from: r.from, to: "" };
    }
    if (period === "d30") {
      const r = resolvePeriod("custom", { from: formatDate(new Date(Date.now() - 29 * 86400000)) });
      return { from: r.from, to: "" };
    }
    if (period === "custom") return { from: customFrom, to: customTo };
    return { from: "", to: "" };
  }, [period, customFrom, customTo]);

  const statementUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    return `/api/parties/customers/${customerId}/statement?${params.toString()}`;
  }, [customerId, range]);

  const { data: stData } = useQuery<{ statement: StatementResult }>({
    queryKey: ["parties", "statement", statementUrl],
    queryFn: () => getJson<{ statement: StatementResult }>(statementUrl),
    enabled: Boolean(customerId),
  });

  const st = stData?.statement;
  const customer = data?.customer;

  const archive = async () => {
    if (!customer) return;
    const next = !customer.isArchived;
    if (
      next &&
      !window.confirm(`أرشفة العميل «${customer.name}»؟ لن يظهر في القوائم ويمكن استعادته.`)
    ) {
      return;
    }
    try {
      await patchJson(`/api/parties/customers/${customer.id}`, { archive: next });
      toast.success(next ? "تم أرشفة العميل" : "تمت استعادة العميل");
      qc.invalidateQueries({ queryKey: ["parties"] });
      if (!next) pop();
    } catch {
      /* toast */
    }
  };

  const doPrintStatement = () => {
    if (!st || !boot?.company) return;
    printStatement(st, {
      name: boot.company.name,
      phone: boot.company.phone,
      address: boot.company.address,
      footerText: boot.company.footerText,
    }, customer?.phone);
  };

  const sendStatementWhatsApp = () => {
    if (!st || !customer || !boot?.company) return;
    const text = [
      `مرحباً ${customer.name} 🌹`,
      `${boot.company.name}`,
      "──────────────",
      `كشف حسابكم${st.from ? ` عن الفترة من ${formatDate(st.from)}${st.to ? ` إلى ${formatDate(st.to)}` : ""}` : ""}`,
      `رصيد أول الفترة: ${formatAmount(st.openingBalance, { currency: st.baseCurrencyCode })}`,
      `إجمالي المدين: ${formatAmount(st.totals.debit, { currency: st.baseCurrencyCode })}`,
      `إجمالي الدائن: ${formatAmount(st.totals.credit, { currency: st.baseCurrencyCode })}`,
      `الرصيد الحالي: ${formatAmount(st.closingBalance, { currency: st.baseCurrencyCode })}`,
    ].join("\n");
    remindViaWhatsApp(customer.whatsapp || customer.phone, text);
  };

  const sendDebtReminder = () => {
    if (!customer || !st || !boot?.company) return;
    remindViaWhatsApp(
      customer.whatsapp || customer.phone,
      buildDebtReminderText({
        customerName: customer.name,
        companyName: boot.company.name,
        balance: customer.balance,
        currencyCode: st.baseCurrencyCode,
        lastRows: st.rows.slice(-3).map((r) => ({
          date: r.date,
          docLabel: r.docLabel,
          debit: r.debit,
          credit: r.credit,
        })),
      })
    );
  };

  const limit = customer?.creditLimit ?? 0;
  const balance = customer?.balance ?? 0;
  const usagePct = limit > 0 ? Math.min(100, Math.max(0, (balance / limit) * 100)) : 0;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title={customer?.name ?? "بطاقة العميل"} />

      <div className="flex-1 px-3 py-3">
        {isLoading || !customer ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الملف…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {/* ═══ بطاقة الرأس ═══ */}
            <AppCard className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-cyan text-xl font-bold text-primary-foreground">
                  {customer.name.trim().charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[17px] font-bold">{customer.name}</h2>
                    {customer.isArchived && <StatusChip status="held" label="مؤرشف" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
                    {customer.phone && (
                      <a
                        href={`tel:${customer.phone}`}
                        dir="ltr"
                        className="flex items-center gap-1 font-num hover:text-primary"
                      >
                        <Phone className="size-3" aria-hidden />
                        {customer.phone}
                      </a>
                    )}
                    {customer.area && <span>{customer.area}</span>}
                    {data && (
                      <span className="font-num">
                        {formatAmount(data.stats.invoicesCount, { decimals: 0, showSymbol: false })} فاتورة
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 p-3">
                <div>
                  <p className="text-[12.5px] text-muted-foreground">الرصيد الحالي (مدين)</p>
                  <AmountText
                    value={balance}
                    currency="YER"
                    size="xl"
                    variant={balance > 0.005 ? "due" : balance < -0.005 ? "pos" : "neutral"}
                  />
                </div>
                {balance < -0.005 && <StatusChip status="paid" label="دائن — دفعة مقدمة" />}
              </div>

              {limit > 0 && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[12.5px]">
                    <span className="text-muted-foreground">حد الائتمان</span>
                    <span className="font-num">
                      <AmountText value={balance} currency="YER" size="sm" variant={balance > limit ? "neg" : "neutral"} />
                      {" / "}
                      <AmountText value={limit} currency="YER" size="sm" variant="neutral" />
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        usagePct >= 100 ? "bg-[#F87171]" : usagePct >= 75 ? "bg-[#FBBF24]" : "bg-[#34D399]"
                      )}
                      style={{ width: `${usagePct}%` }}
                    />
                  </div>
                  {customer.overLimit && (
                    <p className="mt-1 text-[12px] font-bold text-[#F87171]">
                      تجاوز حد الائتمان بمقدار {formatAmount(balance - limit, { currency: "YER" })}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-4 gap-2">
                <PrimaryButton
                  variant="success"
                  className="px-2 text-[13px]"
                  onClick={() => setCollectOpen(true)}
                  disabled={customer.isArchived}
                >
                  تحصيل
                </PrimaryButton>
                <PrimaryButton
                  variant="outline"
                  className="px-2 text-[13px]"
                  onClick={sendDebtReminder}
                  disabled={Math.abs(balance) <= 0.005}
                >
                  تذكير
                </PrimaryButton>
                <PrimaryButton variant="outline" className="px-2 text-[13px]" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" aria-hidden />
                  تعديل
                </PrimaryButton>
                <PrimaryButton variant="outline" className="px-2 text-[13px]" onClick={archive}>
                  {customer.isArchived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
                  {customer.isArchived ? "استعادة" : "أرشفة"}
                </PrimaryButton>
              </div>

              {customer.notes && (
                <p className="rounded-lg bg-muted/50 p-2 text-[13px] text-muted-foreground">
                  📝 {customer.notes}
                </p>
              )}
            </AppCard>

            {/* ═══ الأقساط المتأخرة ═══ */}
            {data.overdueInstallments.length > 0 && (
              <AppCard noPad>
                <div className="p-4 pb-2">
                  <SectionTitle>
                    <span className="flex items-center gap-1.5 text-[#F87171]">
                      <CalendarClock className="size-4" aria-hidden />
                      أقساط متأخرة ({data.overdueInstallments.length})
                    </span>
                  </SectionTitle>
                </div>
                <div className="px-2 pb-2">
                  {data.overdueInstallments.map((o) => (
                    <button
                      key={o.installmentId}
                      type="button"
                      onClick={() => push("installments-plans", { planId: o.planId })}
                      className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-start hover:bg-accent/30"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium">
                          قسط #{o.seq} {o.invoiceNo ? `— ${o.invoiceNo}` : ""}
                        </span>
                        <span className="block font-num text-[12px] text-[#F87171]">
                          استحق {formatDate(o.dueDate)}
                        </span>
                      </span>
                      <AmountText value={o.remaining} currency="YER" size="md" variant="neg" />
                    </button>
                  ))}
                </div>
              </AppCard>
            )}

            {/* ═══ كشف الحساب ═══ */}
            <AppCard noPad>
              <div className="p-4 pb-2">
                <SectionTitle
                  action={
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={doPrintStatement}
                        aria-label="طباعة الكشف"
                        className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary active:scale-95"
                      >
                        <Printer className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={sendStatementWhatsApp}
                        aria-label="إرسال الكشف واتساب"
                        className="flex size-9 items-center justify-center rounded-lg bg-[#25D366]/15 text-[#25D366] active:scale-95"
                      >
                        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                          <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2m4.52 11.87c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.27z" />
                        </svg>
                      </button>
                    </div>
                  }
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-4 text-primary" aria-hidden />
                    كشف الحساب
                  </span>
                </SectionTitle>
                <div className="scrollbar-slim mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
                  {PERIODS.map((p) => (
                    <button
                      key={p.id || "all"}
                      type="button"
                      onClick={() => setPeriod(p.id)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition-colors",
                        period === p.id
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent/30"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {period === "custom" && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Field label="من">
                      <DateInput value={customFrom} onChange={setCustomFrom} />
                    </Field>
                    <Field label="إلى">
                      <DateInput value={customTo} onChange={setCustomTo} />
                    </Field>
                  </div>
                )}
              </div>

              <div className="border-t border-border/60 px-3 py-2">
                <KeyValueRow
                  label="رصيد أول الفترة"
                  value={<AmountText value={st?.openingBalance ?? 0} currency="YER" size="sm" variant="neutral" />}
                />
                {st && st.rows.length > 0 ? (
                  <div className="scrollbar-slim max-h-96 overflow-y-auto">
                    <table className="w-full text-[12.5px]">
                      <thead className="sticky top-0 bg-card">
                        <tr className="border-b border-border/60 text-muted-foreground">
                          <th className="py-2 text-start font-medium">التاريخ</th>
                          <th className="py-2 text-start font-medium">المستند</th>
                          <th className="py-2 text-end font-medium">مدين</th>
                          <th className="py-2 text-end font-medium">دائن</th>
                          <th className="py-2 text-end font-medium">الرصيد</th>
                        </tr>
                      </thead>
                      <tbody>
                        {st.rows.map((r, i) => (
                          <tr
                            key={`${r.docNo}-${i}`}
                            className={cn(
                              "border-b border-border/30",
                              r.docType === "opening" && "bg-muted/30"
                            )}
                          >
                            <td className="py-1.5 font-num text-muted-foreground">
                              {r.date ? formatDate(r.date) : "—"}
                            </td>
                            <td className="max-w-28 truncate py-1.5">
                              {r.docNo ? <span className="font-num">{r.docNo}</span> : r.docLabel}
                              <span className="block text-[10.5px] text-muted-foreground">{r.docLabel}</span>
                            </td>
                            <td className="py-1.5 text-end">
                              {r.debit > 0 && <AmountText value={r.debit} currency="YER" size="sm" variant="due" />}
                            </td>
                            <td className="py-1.5 text-end">
                              {r.credit > 0 && <AmountText value={r.credit} currency="YER" size="sm" variant="pos" />}
                            </td>
                            <td className="py-1.5 text-end">
                              <AmountText
                                value={r.balance}
                                currency="YER"
                                size="sm"
                                variant={r.balance > 0 ? "due" : r.balance < 0 ? "pos" : "neutral"}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="py-4 text-center text-[13px] text-muted-foreground">
                    لا حركات خلال الفترة المحددة
                  </p>
                )}
                {st && (
                  <div className="mt-1 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-[13px]">
                    <span className="text-muted-foreground">
                      مدين: <AmountText value={st.totals.debit} currency="YER" size="sm" variant="due" />
                    </span>
                    <span className="text-muted-foreground">
                      دائن: <AmountText value={st.totals.credit} currency="YER" size="sm" variant="pos" />
                    </span>
                    <span className="font-bold">
                      الختامي:{" "}
                      <AmountText
                        value={st.closingBalance}
                        currency="YER"
                        size="sm"
                        variant={st.closingBalance > 0 ? "due" : st.closingBalance < 0 ? "pos" : "neutral"}
                      />
                    </span>
                  </div>
                )}
              </div>
            </AppCard>

            {/* ═══ آخر الفواتير ═══ */}
            <AppCard noPad>
              <div className="p-4 pb-1">
                <SectionTitle>آخر الفواتير</SectionTitle>
              </div>
              {data.lastInvoices.length === 0 ? (
                <EmptyState message="لا فواتير لهذا العميل" className="py-6" />
              ) : (
                data.lastInvoices.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => push("sales-invoice-details", { invoiceId: inv.id })}
                    className="flex min-h-14 w-full items-center gap-2 border-b border-border/40 px-4 text-start last:border-0 hover:bg-accent/30"
                  >
                    <ReceiptText className="size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-num text-[14px] font-bold">{inv.invoiceNo}</span>
                        <StatusChip status={inv.payStatus} />
                      </span>
                      <span className="font-num block text-[12px] text-muted-foreground">
                        {formatDate(inv.issuedAt)}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <AmountText value={inv.total} currency={inv.currencyCode} size="sm" />
                      {inv.dueAmount > 0 && (
                        <AmountText value={inv.dueAmount} currency={inv.currencyCode} size="sm" variant="due" />
                      )}
                    </span>
                  </button>
                ))
              )}
            </AppCard>
          </div>
        )}
      </div>

      {customer && (
        <>
          <VoucherForm
            open={collectOpen}
            onOpenChange={setCollectOpen}
            fixedParty={{ type: "customer", id: customer.id, name: customer.name }}
            initialKind="receipt"
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["parties"] });
              qc.invalidateQueries({ queryKey: ["installments"] });
            }}
          />
          <CustomerForm
            open={editOpen}
            onOpenChange={setEditOpen}
            initial={customer}
            onSaved={() => qc.invalidateQueries({ queryKey: ["parties"] })}
          />
        </>
      )}
    </div>
  );
}
