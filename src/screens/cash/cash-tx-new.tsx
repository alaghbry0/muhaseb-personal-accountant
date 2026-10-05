"use client";

/**
 * حركة نقدية جديدة — FR-04-02: شبكة أنواع (قبض من عميل، صرف لمورد، مصروف،
 * سحبية موظف، تحويل بين صندوقين، إيداع/سحب بنكي، افتتاحي) + نموذج ديناميكي
 * لكل نوع (FR-04-03 ربط المرجع) + طباعة سند للقبض/الصرف (قالب 3-b).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft, ArrowUpRight, Receipt, UserMinus, ArrowLeftRight, Landmark,
  Banknote, Inbox, CheckCircle2, Printer, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDate } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { AppHeader, AmountText, PrimaryButton } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { PartyPicker } from "@/components/parties/party-picker";
import { printVoucher } from "@/components/print/voucher-print";
import { SelectField, EmployeePicker } from "@/components/cash/fields";
import { usePrintCompany } from "@/components/reports/csv";
import type { BootstrapData } from "@/lib/types";
import type { CashTxDto } from "@/domain/cash";
import { cn } from "@/lib/utils";

type TxTypeId =
  | "receipt" | "payment" | "expense" | "employee_advance"
  | "box_transfer" | "bank_deposit" | "bank_withdraw" | "opening";

const TYPES: Array<{ id: TxTypeId; label: string; desc: string; icon: typeof Receipt; color: string }> = [
  { id: "receipt", label: "قبض من عميل", desc: "تحصيل دفعة من عميل", icon: ArrowDownLeft, color: "#34D399" },
  { id: "payment", label: "صرف لمورد", desc: "دفع مستحقات لمورد", icon: ArrowUpRight, color: "#F87171" },
  { id: "expense", label: "مصروف", desc: "مصروف تشغيلي بفئة", icon: Receipt, color: "#FB923C" },
  { id: "employee_advance", label: "سحبية موظف", desc: "سلفة تُخصم من الراتب", icon: UserMinus, color: "#FBBF24" },
  { id: "box_transfer", label: "تحويل بين صندوقين", desc: "نقل نقدية بسعر الصرف", icon: ArrowLeftRight, color: "#22D3EE" },
  { id: "bank_deposit", label: "إيداع بنكي", desc: "من الصندوق إلى البنك", icon: Landmark, color: "#A78BFA" },
  { id: "bank_withdraw", label: "سحب بنكي", desc: "من البنك إلى الصندوق", icon: Banknote, color: "#34D399" },
  { id: "opening", label: "رصيد افتتاحي", desc: "تأسيس رصيد صندوق", icon: Inbox, color: "#94A3B8" },
];

interface BoxesResponse {
  cashboxes: Array<{ id: number; name: string; currencyCode: string; balance: number; isDefault: boolean }>;
}

interface CatsResponse {
  categories: Array<{ id: number; name: string; isArchived: boolean }>;
}

interface SaveResult {
  tx: CashTxDto;
  cashboxBalance: number;
  toCashboxBalance: number | null;
}

export default function CashTxNewScreen(params: { cashboxId?: number; type?: string }) {
  const { pop } = useNav();
  const qc = useQueryClient();
  const { company } = usePrintCompany();

  const initialType = (TYPES.find((t) => t.id === params.type)?.id ?? null) as TxTypeId | null;
  const [type, setType] = useState<TxTypeId | null>(initialType);
  const [cashboxId, setCashboxId] = useState<string>(params.cashboxId ? String(params.cashboxId) : "");
  const [toCashboxId, setToCashboxId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("");
  const [txDate, setTxDate] = useState(formatDate(new Date()));
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [employee, setEmployee] = useState<{ id: number; name: string } | null>(null);
  const [party, setParty] = useState<{ id: number; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: boxesData } = useQuery<BoxesResponse>({
    queryKey: ["cashbox", "boxes"],
    queryFn: () => getJson<BoxesResponse>("/api/cashbox"),
  });
  const { data: catsData } = useQuery<CatsResponse>({
    queryKey: ["expenses", "categories"],
    queryFn: () => getJson<CatsResponse>("/api/expenses/categories"),
  });

  const boxes = boxesData?.cashboxes ?? [];
  const selectedBox = boxes.find((b) => String(b.id) === cashboxId) ?? null;
  const toBox = boxes.find((b) => String(b.id) === toCashboxId) ?? null;
  const activeCategories = (catsData?.categories ?? []).filter((c) => !c.isArchived);

  const boxOptions = boxes.map((b) => ({
    value: String(b.id),
    label: `${b.name} (${b.currencyCode}) — رصيد ${formatAmount(b.balance, { currency: b.currencyCode })}`,
  }));
  const toBoxOptions = boxes
    .filter((b) => String(b.id) !== cashboxId)
    .map((b) => ({ value: String(b.id), label: `${b.name} (${b.currencyCode})` }));

  // سعر الصرف المقترح لعملة الصندوق غير الأساسية
  const suggestedRate = useMemo(() => {
    if (!selectedBox) return null
    const code = selectedBox.currencyCode
    if (code === (boot?.baseCurrency?.code ?? "YER")) return null
    return boot?.rates?.[code]?.rate ?? null
  }, [selectedBox, boot])

  const effectiveRate = Number(exchangeRate) > 0 ? Number(exchangeRate) : (suggestedRate ?? 1)

  // معاينة تحويل بين عملتين مختلفتين
  const transferPreview = useMemo(() => {
    if (!type || !selectedBox || !toBox) return null
    if (selectedBox.currencyCode === toBox.currencyCode) return null
    const amt = Number(amount)
    if (!(amt > 0)) return null
    const base = amt * effectiveRate
    const toRate = boot?.rates?.[toBox.currencyCode]?.rate
    if (!toRate) return null
    return { amount: base / toRate, currency: toBox.currencyCode }
  }, [type, selectedBox, toBox, amount, effectiveRate, boot])

  const needsCategory = type === "expense";
  const needsEmployee = type === "employee_advance";
  const needsTo = type === "box_transfer";
  const optionalTo = type === "bank_deposit" || type === "bank_withdraw";
  const partyType = type === "receipt" ? "customer" : type === "payment" ? "supplier" : null;

  const canSave =
    !!type &&
    !!cashboxId &&
    Number(amount) > 0 &&
    (!needsCategory || !!categoryId) &&
    (!needsEmployee || !!employee) &&
    (!needsTo || !!toCashboxId) &&
    (!selectedBox || !suggestedRate || Number(exchangeRate) > 0 || suggestedRate > 0);

  const save = async () => {
    if (!type || !cashboxId) return;
    setSaving(true);
    try {
      const res = await postJson<SaveResult>("/api/cashbox/tx", {
        txType: type,
        cashboxId: Number(cashboxId),
        toCashboxId: needsTo || optionalTo ? (toCashboxId ? Number(toCashboxId) : null) : null,
        amount: Number(amount),
        exchangeRate: suggestedRate ? effectiveRate : null,
        txDate,
        description: description || null,
        expenseCategoryId: needsCategory ? Number(categoryId) : null,
        employeeId: needsEmployee ? employee?.id : null,
        customerId: partyType === "customer" && party ? party.id : null,
        supplierId: partyType === "supplier" && party ? party.id : null,
      });
      setResult(res);
      toast.success("تم حفظ الحركة النقدية بنجاح");
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      /* الخطأ يظهر توستاً من api.ts */
    } finally {
      setSaving(false);
    }
  };

  const printVoucherDoc = () => {
    if (!result) return;
    printVoucher(
      {
        number: `V-${result.tx.id}`,
        kind: result.tx.txType === "payment" ? "payment" : "receipt",
        partyName:
          result.tx.customerName ?? result.tx.supplierName ?? "—",
        amount: result.tx.amount,
        currencyCode: result.tx.currencyCode,
        txDate: result.tx.txDate,
        description: result.tx.description,
      },
      company
    );
  };

  const typeMeta = type ? TYPES.find((t) => t.id === type) : null;

  return (
    <div className="flex min-h-full flex-col pb-8">
      <AppHeader title="حركة نقدية جديدة" />

      <div className="flex flex-1 flex-col gap-3 p-3">
        {/* ─── اختيار النوع ─── */}
        <p className="text-[13.5px] font-bold text-muted-foreground">نوع الحركة</p>
        <div className="grid grid-cols-2 gap-2.5">
          {TYPES.map((t) => {
            const Icon = t.icon;
            const active = type === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setType(t.id);
                  setToCashboxId("");
                  setCategoryId("");
                  setEmployee(null);
                  setParty(null);
                }}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-2xl border p-3.5 text-start transition-all active:scale-[0.98]",
                  active
                    ? "border-primary bg-primary/10 shadow-[0_0_0_1px_var(--color-primary)]"
                    : "border-border/60 bg-card hover:bg-accent/30"
                )}
              >
                <span
                  className="flex size-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${t.color}22`, color: t.color }}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className={cn("text-[14px] font-bold", active ? "text-primary" : "text-foreground")}>
                    {t.label}
                  </span>
                  <span className="text-[11.5px] leading-tight text-muted-foreground">{t.desc}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ─── النموذج ─── */}
        {type && (
          <div className="mt-1 flex flex-col gap-3.5 rounded-2xl border border-border/60 bg-card p-4">
            {typeMeta && (
              <div className="flex items-center gap-2 border-b border-border/50 pb-3">
                <span
                  className="flex size-9 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${typeMeta.color}22`, color: typeMeta.color }}
                >
                  <typeMeta.icon className="size-4.5" aria-hidden />
                </span>
                <span className="text-[14.5px] font-bold text-foreground">{typeMeta.label}</span>
              </div>
            )}

            {/* الصندوق */}
            <SelectField
              label={type === "bank_withdraw" ? "إلى صندوق (الناقل)" : needsTo ? "من صندوق" : "الصندوق"}
              value={cashboxId}
              onChange={(v) => {
                setCashboxId(v);
                setExchangeRate("");
              }}
              options={boxOptions}
              placeholder="اختر الصندوق…"
              required
              id="cashbox"
            />
            {selectedBox && (
              <div className="flex items-center justify-between rounded-xl bg-primary/8 px-3.5 py-2.5 text-[13px]">
                <span className="text-muted-foreground">رصيد الصندوق الحالي</span>
                <AmountText
                  value={selectedBox.balance}
                  currency={selectedBox.currencyCode}
                  size="md"
                  variant={selectedBox.balance >= 0 ? "primary" : "neg"}
                />
              </div>
            )}

            {/* الصندوق الوجهة */}
            {(needsTo || optionalTo) && (
              <SelectField
                label={needsTo ? "إلى صندوق" : type === "bank_deposit" ? "إلى حساب بنكي (اختياري)" : "من حساب بنكي (اختياري)"}
                value={toCashboxId}
                onChange={setToCashboxId}
                options={toBoxOptions}
                placeholder={optionalTo && toBoxOptions.length === 0 ? "لا صناديق أخرى" : "اختر…"}
                required={needsTo}
                id="tobox"
              />
            )}

            {/* الطرف */}
            {partyType && (
              <PartyPicker
                partyType={partyType as "customer" | "supplier"}
                selected={party}
                onSelect={setParty}
              />
            )}

            {/* فئة المصروف */}
            {needsCategory && (
              <SelectField
                label="فئة المصروف"
                value={categoryId}
                onChange={setCategoryId}
                options={activeCategories.map((c) => ({ value: String(c.id), label: c.name }))}
                placeholder="اختر الفئة…"
                required
                id="category"
              />
            )}

            {/* الموظف */}
            {needsEmployee && <EmployeePicker selected={employee} onSelect={setEmployee} />}

            {/* المبلغ */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="amount" className="text-[13px] font-bold text-foreground">
                المبلغ {selectedBox ? `(${selectedBox.currencyCode === "YER" ? "ريال" : selectedBox.currencyCode})` : ""}
                <span className="text-[#F87171]"> *</span>
              </label>
              <input
                id="amount"
                type="number"
                inputMode="decimal"
                dir="ltr"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-12 rounded-xl border border-border bg-background px-3.5 font-num text-[16px] font-bold text-foreground outline-none focus:border-primary"
              />
              {Number(amount) > 0 && selectedBox && selectedBox.currencyCode !== "YER" && (
                <span dir="ltr" className="font-num text-[12px] text-muted-foreground">
                  ≈ {formatAmount(Number(amount) * effectiveRate, { currency: "YER" })}
                </span>
              )}
            </div>

            {/* سعر الصرف (عملة غير أساسية) */}
            {suggestedRate && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="rate" className="text-[13px] font-bold text-foreground">
                  سعر الصرف (1 {selectedBox?.currencyCode} = ? ر.ي) <span className="text-[#F87171]">*</span>
                </label>
                <input
                  id="rate"
                  type="number"
                  inputMode="decimal"
                  dir="ltr"
                  min="0"
                  step="any"
                  value={exchangeRate || String(suggestedRate)}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  className="h-12 rounded-xl border border-border bg-background px-3.5 font-num text-[15px] text-foreground outline-none focus:border-primary"
                />
              </div>
            )}

            {/* معاينة التحويل بين عملتين */}
            {transferPreview && (
              <div className="rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-[13px]">
                سيصل إلى «{toBox?.name}» ما يقارب{" "}
                <span dir="ltr" className="font-num font-bold text-primary">
                  {formatAmount(transferPreview.amount, { currency: transferPreview.currency })}
                </span>
              </div>
            )}

            {/* التاريخ */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="txdate" className="text-[13px] font-bold text-foreground">
                التاريخ
              </label>
              <input
                id="txdate"
                type="date"
                dir="ltr"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                className="h-12 rounded-xl border border-border bg-background px-3.5 font-num text-[14px] text-foreground outline-none focus:border-primary"
              />
            </div>

            {/* البيان */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="desc" className="text-[13px] font-bold text-foreground">
                البيان {needsCategory && <span className="font-normal text-muted-foreground">(مثال: فاتورة كهرباء)</span>}
              </label>
              <textarea
                id="desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder={typeMeta ? `اختياري — يُولَّد تلقائياً: ${typeMeta.label}` : "وصف الحركة…"}
                className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
        )}

        {/* زر الحفظ */}
        {type && (
          <PrimaryButton onClick={save} disabled={!canSave || saving} loading={saving} block>
            {saving ? "جارٍ الحفظ…" : `حفظ ${typeMeta?.label ?? "الحركة"}`}
          </PrimaryButton>
        )}
      </div>

      {/* ─── لوحة النجاح ─── */}
      <PosSheet open={!!result} onOpenChange={(o) => !o && (setResult(null), pop())} title="تم حفظ الحركة">
        {result && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#34D399]/10 p-4">
              <CheckCircle2 className="size-6 text-[#34D399]" aria-hidden />
              <span className="text-[15px] font-bold text-[#34D399]">تم تسجيل {result.tx.txTypeLabel} بنجاح</span>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3.5 text-[13.5px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">المبلغ</span>
                <AmountText value={result.tx.amount} currency={result.tx.currencyCode} size="lg" variant={result.tx.direction >= 0 ? "pos" : "neg"} />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الصندوق</span>
                <span className="font-bold">{result.tx.cashboxName}</span>
              </div>
              {result.toCashboxBalance != null && result.tx.toCashboxName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">الوجهة</span>
                  <span className="font-bold">{result.tx.toCashboxName}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/50 pt-2">
                <span className="font-bold">الرصيد الجديد</span>
                <AmountText value={result.cashboxBalance} currency={result.tx.currencyCode} size="lg" variant="primary" />
              </div>
              {result.toCashboxBalance != null && result.tx.toCashboxName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">رصيد الوجهة</span>
                  <AmountText value={result.toCashboxBalance} size="md" variant="primary" />
                </div>
              )}
            </div>
            {(result.tx.txType === "receipt" || result.tx.txType === "payment") && (
              <button
                type="button"
                onClick={printVoucherDoc}
                className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-[14px] font-bold text-primary active:scale-[0.98]"
              >
                <Printer className="size-4" aria-hidden />
                طباعة السند
              </button>
            )}
            <PrimaryButton
              onClick={() => {
                setResult(null);
                pop();
              }}
              block
            >
              <Wallet className="me-1.5 size-4" aria-hidden />
              تم
            </PrimaryButton>
          </div>
        )}
      </PosSheet>
    </div>
  );
}
