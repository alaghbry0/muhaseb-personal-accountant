"use client";

/**
 * نموذج سند القبض/الصرف — الوحدة 05 (سندات الموردين) + تحصيل العملاء.
 * النوع (قبض/صرف) + الطرف (بحث فوري) + المبلغ/العملة/السعر + الصندوق + التاريخ
 * + البيان + ربط اختياري بفاتورة مفتوحة → حفظ ذرّي → لوحة نجاح بطباعة السند.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer, Check, Link2 } from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDateDisplay } from "@/lib/format";
import { todayStr } from "@/domain/parties";
import type { VoucherDto, VoucherKind, PartyType } from "@/domain/parties";
import type { BootstrapData } from "@/lib/types";
import { PartySheet } from "./party-sheet";
import { Field, TextInput, DateInput, Segmented } from "./field";
import { PartyPicker } from "./party-picker";
import { PrimaryButton, AmountText } from "@/components/ds";
import { printVoucher } from "@/components/print/voucher-print";
import { cn } from "@/lib/utils";

interface OpenInvoiceItem {
  id: number;
  invoiceNo: string;
  issuedAt: string;
  total: number;
  dueAmount: number;
  currencyCode: string;
}

interface VoucherFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** تثبيت الطرف مسبقاً (زر «تحصيل» من بطاقة العميل / «سداد» من بطاقة المورد) */
  fixedParty?: { type: PartyType; id: number; name: string } | null;
  /** النوع الابتدائي — قبض افتراضياً */
  initialKind?: VoucherKind;
  onSaved?: (voucher: VoucherDto, partyBalance: number) => void;
}

export function VoucherForm({
  open,
  onOpenChange,
  fixedParty,
  initialKind = "receipt",
  onSaved,
}: VoucherFormProps) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<VoucherKind>(initialKind);
  const [partyType, setPartyType] = useState<PartyType>(fixedParty?.type ?? (initialKind === "receipt" ? "customer" : "supplier"));
  const [party, setParty] = useState<{ id: number; name: string } | null>(
    fixedParty ? { id: fixedParty.id, name: fixedParty.name } : null
  );
  const [amount, setAmount] = useState("");
  const [currencyCode, setCurrencyCode] = useState("YER");
  const [rateInput, setRateInput] = useState("1");
  const [cashboxId, setCashboxId] = useState<number | null>(null);
  const [txDate, setTxDate] = useState(todayStr());
  const [description, setDescription] = useState("");
  const [refInvoiceId, setRefInvoiceId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ voucher: VoucherDto; partyBalance: number } | null>(null);

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 30_000,
  });

  const company = boot?.company;
  const baseCode = boot?.baseCurrency?.code ?? "YER";

  // الفواتير المفتوحة للطرف المحدد
  const { data: invoicesData } = useQuery({
    queryKey: ["parties", "open-invoices", partyType, party?.id],
    queryFn: () =>
      getJson<{ invoices: OpenInvoiceItem[] }>(
        `/api/invoices?docType=${partyType === "customer" ? "sale" : "purchase"}&customerId=${party?.id}&supplierId=${party?.id}&limit=50`
      ),
    enabled: open && Boolean(party?.id),
  });
  const openInvoices = useMemo(
    () => (invoicesData?.invoices ?? []).filter((i) => i.dueAmount > 0),
    [invoicesData]
  );

  const setCurrency = (code: string) => {
    setCurrencyCode(code);
    const rate = code === baseCode ? 1 : (boot?.rates?.[code]?.rate ?? 1);
    setRateInput(String(rate));
    // صندوق مطابق للعملة إن وجد
    const match = boot?.cashboxes.find((c) => boot?.currencies.find((cu) => cu.id === c.currencyId)?.code === code);
    if (match) setCashboxId(match.id);
  };

  const reset = () => {
    setAmount("");
    setDescription("");
    setRefInvoiceId(null);
    setResult(null);
  };

  const save = async () => {
    if (!party) {
      toast.error(partyType === "customer" ? "اختر العميل" : "اختر المورد");
      return;
    }
    const amt = Number(amount || 0);
    if (!(amt > 0)) {
      toast.error("أدخل مبلغ السند");
      return;
    }
    if (!cashboxId) {
      toast.error("اختر الصندوق");
      return;
    }
    setSaving(true);
    try {
      const currencyId =
        boot?.currencies.find((c) => c.code === currencyCode)?.id ?? boot?.baseCurrency?.id ?? 1;
      const res = await postJson<{ voucher: VoucherDto; partyBalance: number; overpayWarning: boolean }>(
        "/api/vouchers",
        {
          kind,
          partyType,
          partyId: party.id,
          amount: amt,
          currencyId,
          exchangeRate: Number(rateInput || 1),
          cashboxId,
          txDate,
          description: description || null,
          refInvoiceId,
        }
      );
      if (res.overpayWarning) {
        toast.warning("تنبيه: المبلغ يتجاوز الرصيد الحالي — سُجّل كدفعة مقدمة");
      }
      setResult(res);
      onSaved?.(res.voucher, res.partyBalance);
      qc.invalidateQueries({ queryKey: ["parties"] });
      qc.invalidateQueries({ queryKey: ["installments"] });
      toast.success(
        `${kind === "receipt" ? "تم تسجيل سند القبض" : "تم تسجيل سند الصرف"} ${res.voucher.number}`
      );
    } catch {
      /* toast عبر api.ts */
    } finally {
      setSaving(false);
    }
  };

  const kindOptions: Array<{ id: VoucherKind; label: string; color?: string }> = [
    { id: "receipt", label: "سند قبض ⬇", color: "green" },
    { id: "payment", label: "سند صرف ⬆", color: "red" },
  ];

  const doPrint = () => {
    if (!result || !company) return;
    printVoucher(result.voucher, {
      name: company.name,
      phone: company.phone,
      address: company.address,
      footerText: company.footerText,
    });
  };

  return (
    <PartySheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
      title={
        result
          ? `${result.voucher.kind === "receipt" ? "سند قبض" : "سند صرف"} ${result.voucher.number}`
          : fixedParty
            ? `${initialKind === "receipt" ? "تحصيل من" : "سداد لمورد"}: ${fixedParty.name}`
            : "سند جديد"
      }
      description={
        result
          ? `${result.voucher.txDate} — ${result.voucher.cashboxName}`
          : kind === "receipt"
            ? "قبض من عميل (تحصيل) أو من مورد (مسترد)"
            : "صرف لمورد (سداد) أو لعميل (مسترد)"
      }
      footer={
        result ? (
          <div className="flex gap-2">
            <PrimaryButton variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              إغلاق
            </PrimaryButton>
            <PrimaryButton variant="success" className="flex-1" onClick={doPrint}>
              <Printer className="size-4" aria-hidden />
              طباعة السند
            </PrimaryButton>
          </div>
        ) : (
          <div className="flex gap-2">
            <PrimaryButton variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              إلغاء
            </PrimaryButton>
            <PrimaryButton
              variant={kind === "receipt" ? "success" : "danger"}
              className="flex-[2]"
              loading={saving}
              onClick={save}
            >
              حفظ السند
            </PrimaryButton>
          </div>
        )
      }
    >
      {result ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-[#34D399]/15">
            <Check className="size-7 text-[#34D399]" aria-hidden />
          </span>
          <p className="text-[15px] font-bold">
            {result.voucher.partyName} — {result.voucher.kind === "receipt" ? "قبض" : "صرف"}
          </p>
          <AmountText
            value={result.voucher.amount}
            currency={result.voucher.currencyCode}
            size="2xl"
            variant={result.voucher.kind === "receipt" ? "pos" : "neg"}
          />
          {result.voucher.refInvoiceNo && (
            <p className="text-[13px] text-muted-foreground">
              مرتبط بالفاتورة <span className="font-num">{result.voucher.refInvoiceNo}</span>
            </p>
          )}
          <div className="mt-1 w-full rounded-xl border border-border/60 bg-muted/40 p-3">
            <p className="mb-1 text-[13px] text-muted-foreground">
              الرصيد الحالي بعد السند ({result.voucher.partyType === "customer" ? "مدين موجب" : "مستحق له"}):
            </p>
            <AmountText
              value={result.partyBalance}
              currency={result.voucher.currencyCode}
              size="lg"
              variant={result.partyBalance > 0 ? "due" : "pos"}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <Field label="نوع السند">
            <Segmented
              options={kindOptions}
              value={kind}
              onChange={(k) => {
                setKind(k);
                if (!fixedParty) {
                  setPartyType(k === "receipt" ? "customer" : "supplier");
                  setParty(null);
                  setRefInvoiceId(null);
                }
              }}
            />
          </Field>

          {!fixedParty && (
            <Field label="الطرف">
              <Segmented
                options={[
                  { id: "customer", label: "عميل" },
                  { id: "supplier", label: "مورد" },
                ]}
                value={partyType}
                onChange={(t) => {
                  setPartyType(t);
                  setParty(null);
                  setRefInvoiceId(null);
                }}
              />
            </Field>
          )}

          <Field label={partyType === "customer" ? "العميل" : "المورد"} required>
            {fixedParty ? (
              <div className="flex min-h-12 items-center rounded-xl border border-primary/60 bg-primary/10 px-3 text-[15px] font-bold">
                {fixedParty.name}
              </div>
            ) : (
              <PartyPicker partyType={partyType} selected={party} onSelect={setParty} />
            )}
          </Field>

          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <Field label="المبلغ" required>
              <TextInput
                value={amount}
                onChange={setAmount}
                placeholder="0"
                dir="ltr"
                inputMode="decimal"
                autoFocus={!fixedParty}
              />
            </Field>
            <Field label="العملة">
              <div className="flex gap-1.5">
                {(boot?.currencies ?? []).map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCurrency(c.code)}
                    className={cn(
                      "min-h-12 flex-1 rounded-xl border text-[13.5px] font-bold transition-colors",
                      currencyCode === c.code
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border text-muted-foreground hover:bg-accent/30"
                    )}
                  >
                    {c.code}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {currencyCode !== baseCode && (
            <Field label="سعر الصرف (وحدة الأساس لكل 1)">
              <TextInput value={rateInput} onChange={setRateInput} placeholder="1" dir="ltr" inputMode="decimal" />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="الصندوق" required>
              <select
                value={cashboxId ?? ""}
                onChange={(e) => setCashboxId(Number(e.target.value) || null)}
                className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] outline-none focus:border-primary/70"
              >
                <option value="">اختر الصندوق…</option>
                {(boot?.cashboxes ?? []).map((c) => {
                  const code = boot?.currencies.find((cu) => cu.id === c.currencyId)?.code ?? "";
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} {code ? `(${code})` : ""}
                    </option>
                  );
                })}
              </select>
            </Field>
            <Field label="التاريخ">
              <DateInput value={txDate} onChange={setTxDate} />
            </Field>
          </div>

          {party && openInvoices.length > 0 && (
            <Field label="ربط بفاتورة مفتوحة (اختياري)">
              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => setRefInvoiceId(null)}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-[13.5px] transition-colors",
                    refInvoiceId == null
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  <Link2 className="size-4" aria-hidden />
                  بدون ربط
                </button>
                {openInvoices.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => setRefInvoiceId(inv.id)}
                    className={cn(
                      "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-start text-[13px] transition-colors",
                      refInvoiceId === inv.id
                        ? "border-primary bg-primary/15"
                        : "border-border text-muted-foreground hover:bg-accent/30"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-num font-bold">{inv.invoiceNo}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{formatDateDisplay(inv.issuedAt)}</span>
                    </span>
                    <AmountText value={inv.dueAmount} currency={inv.currencyCode} size="sm" variant="due" />
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="البيان">
            <TextInput
              value={description}
              onChange={setDescription}
              placeholder={kind === "receipt" ? "تحصيل دفعة — نقداً…" : "سداد دفعة — نقداً…"}
            />
          </Field>

          {party && refInvoiceId && (
            <p className="text-[12px] text-muted-foreground">
              الربط للعرض والتذكير فقط — الرصيد يُخفَّض تلقائياً عبر سند القبض.
            </p>
          )}
        </div>
      )}
    </PartySheet>
  );
}
