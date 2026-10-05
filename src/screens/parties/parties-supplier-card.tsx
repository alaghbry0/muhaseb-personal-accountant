"use client";

/**
 * بطاقة المورد + كشف حسابه — 05_الموردين/05-06 (الحساب الجاري للمورد):
 * رأس بالرصيد (مستحق له) + إجراءات (سداد بسند صرف / تعديل / أرشفة)
 * + كشف حركات (مدين/دائن/رصيد متحرك + طباعة A4) + آخر فواتير الشراء والمرتجعات.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Printer, Pencil, Archive, ArchiveRestore, FileText, Truck } from "lucide-react";
import { toast } from "sonner";
import { getJson, patchJson } from "@/lib/api";
import { formatAmount, formatDate, resolvePeriod } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { SupplierDto, StatementResult } from "@/domain/parties";
import type { BootstrapData } from "@/lib/types";
import {
  AppHeader, AppCard, AmountText, StatusChip, EmptyState, SectionTitle, KeyValueRow, PrimaryButton,
} from "@/components/ds";
import { SupplierForm } from "@/components/parties/supplier-form";
import { VoucherForm } from "@/components/parties/voucher-form";
import { Field, DateInput } from "@/components/parties/field";
import { printStatement } from "@/components/print/statement-print";
import { cn } from "@/lib/utils";

interface SupplierFileResponse {
  supplier: SupplierDto
  stats: { purchasesTotalBase: number; invoicesCount: number }
  lastInvoices: Array<{
    id: number; invoiceNo: string; issuedAt: string; payStatus: string; docType: string
    total: number; dueAmount: number; currencyCode: string
  }>
}

type PeriodId = "" | "month" | "d30" | "custom"

const PERIODS: Array<{ id: PeriodId; label: string }> = [
  { id: "", label: "كل الفترات" },
  { id: "month", label: "هذا الشهر" },
  { id: "d30", label: "آخر 30 يوماً" },
  { id: "custom", label: "فترة مخصصة" },
]

export default function PartiesSupplierCardScreen({ supplierId }: { supplierId?: number }) {
  const { pop } = useNav();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<PeriodId>("");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 30_000,
  });

  const { data, isLoading } = useQuery<SupplierFileResponse>({
    queryKey: ["parties", "supplier-file", supplierId],
    queryFn: () => getJson<SupplierFileResponse>(`/api/parties/suppliers/${supplierId}`),
    enabled: Boolean(supplierId),
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
    return `/api/parties/suppliers/${supplierId}/statement?${params.toString()}`;
  }, [supplierId, range]);

  const { data: stData } = useQuery<{ statement: StatementResult }>({
    queryKey: ["parties", "supplier-statement", statementUrl],
    queryFn: () => getJson<{ statement: StatementResult }>(statementUrl),
    enabled: Boolean(supplierId),
  });

  const st = stData?.statement;
  const supplier = data?.supplier;

  const archive = async () => {
    if (!supplier) return;
    const next = !supplier.isArchived;
    if (next && !window.confirm(`أرشفة المورد «${supplier.name}»؟`)) return;
    try {
      await patchJson(`/api/parties/suppliers/${supplier.id}`, { archive: next });
      toast.success(next ? "تم أرشفة المورد" : "تمت استعادة المورد");
      qc.invalidateQueries({ queryKey: ["parties"] });
      if (!next) pop();
    } catch {
      /* toast */
    }
  };

  const doPrintStatement = () => {
    if (!st || !boot?.company) return;
    printStatement(
      st,
      {
        name: boot.company.name,
        phone: boot.company.phone,
        address: boot.company.address,
        footerText: boot.company.footerText,
      },
      supplier?.phone
    );
  };

  const balance = supplier?.balance ?? 0;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title={supplier?.name ?? "بطاقة المورد"} />

      <div className="flex-1 px-3 py-3">
        {isLoading || !supplier ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الملف…</p>
        ) : (
          <div className="flex flex-col gap-3">
            <AppCard className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#FBBF24]/15 text-xl font-bold text-[#FBBF24]">
                  <Truck className="size-6" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-[17px] font-bold">{supplier.name}</h2>
                    {supplier.isArchived && <StatusChip status="held" label="مؤرشف" />}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
                    {supplier.phone && (
                      <a href={`tel:${supplier.phone}`} dir="ltr" className="flex items-center gap-1 font-num hover:text-primary">
                        <Phone className="size-3" aria-hidden />
                        {supplier.phone}
                      </a>
                    )}
                    {supplier.address && <span>{supplier.address}</span>}
                    {data && (
                      <span className="font-num">
                        {formatAmount(data.stats.invoicesCount, { decimals: 0, showSymbol: false })} فاتورة شراء
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-end justify-between gap-2 rounded-xl border border-border/60 bg-muted/40 p-3">
                <div>
                  <p className="text-[12.5px] text-muted-foreground">إجمالي الرصيد (مستحق له)</p>
                  <AmountText
                    value={balance}
                    currency="YER"
                    size="xl"
                    variant={balance > 0.005 ? "due" : balance < -0.005 ? "pos" : "neutral"}
                  />
                </div>
                {balance < -0.005 && <StatusChip status="paid" label="مستحق عليه للمورد" />}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <PrimaryButton
                  variant="danger"
                  className="px-2 text-[13px]"
                  onClick={() => setPayOpen(true)}
                  disabled={supplier.isArchived}
                >
                  سداد (سند صرف)
                </PrimaryButton>
                <PrimaryButton variant="outline" className="px-2 text-[13px]" onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" aria-hidden />
                  تعديل
                </PrimaryButton>
                <PrimaryButton variant="outline" className="px-2 text-[13px]" onClick={archive}>
                  {supplier.isArchived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
                  {supplier.isArchived ? "استعادة" : "أرشفة"}
                </PrimaryButton>
              </div>

              {supplier.notes && (
                <p className="rounded-lg bg-muted/50 p-2 text-[13px] text-muted-foreground">📝 {supplier.notes}</p>
              )}
            </AppCard>

            {/* كشف الحساب */}
            <AppCard noPad>
              <div className="p-4 pb-2">
                <SectionTitle
                  action={
                    <button
                      type="button"
                      onClick={doPrintStatement}
                      aria-label="طباعة الكشف"
                      className="flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary active:scale-95"
                    >
                      <Printer className="size-4" aria-hidden />
                    </button>
                  }
                >
                  <span className="flex items-center gap-1.5">
                    <FileText className="size-4 text-primary" aria-hidden />
                    كشف حساب المورد
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
                  value={<AmountText value={st?.openingBalance ?? 0} currency="YER" size="sm" />}
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
                          <tr key={`${r.docNo}-${i}`} className={cn("border-b border-border/30", r.docType === "opening" && "bg-muted/30")}>
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
                  <p className="py-4 text-center text-[13px] text-muted-foreground">لا حركات خلال الفترة</p>
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
                        variant={st.closingBalance > 0 ? "due" : "pos"}
                      />
                    </span>
                  </div>
                )}
              </div>
            </AppCard>

            {/* آخر فواتير الشراء */}
            <AppCard noPad>
              <div className="p-4 pb-1">
                <SectionTitle>آخر فواتير الشراء والمرتجعات</SectionTitle>
              </div>
              {data.lastInvoices.length === 0 ? (
                <EmptyState message="لا فواتير شراء لهذا المورد" className="py-6" />
              ) : (
                data.lastInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex min-h-14 items-center gap-2 border-b border-border/40 px-4 last:border-0"
                  >
                    <FileText className="size-4 shrink-0 text-[#FBBF24]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-num text-[14px] font-bold">{inv.invoiceNo}</span>
                        <StatusChip status={inv.docType === "purchase_return" ? "rejected" : inv.payStatus} label={inv.docType === "purchase_return" ? "مرتجع شراء" : undefined} />
                      </span>
                      <span className="font-num block text-[12px] text-muted-foreground">{formatDate(inv.issuedAt)}</span>
                    </span>
                    <span className="flex flex-col items-end">
                      <AmountText value={inv.total} currency={inv.currencyCode} size="sm" />
                      {inv.dueAmount > 0 && (
                        <AmountText value={inv.dueAmount} currency={inv.currencyCode} size="sm" variant="due" />
                      )}
                    </span>
                  </div>
                ))
              )}
            </AppCard>
          </div>
        )}
      </div>

      {supplier && (
        <>
          <VoucherForm
            open={payOpen}
            onOpenChange={setPayOpen}
            fixedParty={{ type: "supplier", id: supplier.id, name: supplier.name }}
            initialKind="payment"
            onSaved={() => qc.invalidateQueries({ queryKey: ["parties"] })}
          />
          <SupplierForm
            open={editOpen}
            onOpenChange={setEditOpen}
            initial={supplier}
            onSaved={() => qc.invalidateQueries({ queryKey: ["parties"] })}
          />
        </>
      )}
    </div>
  );
}
