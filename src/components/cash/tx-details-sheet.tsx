"use client";

/**
 * ورقة «تفاصيل الحركة» — FR-04-08 (Task 9-a): عرض غني لأي حركة صندوق
 * + تعديل/حذف الحركات اليدوية فقط (المرتبطة بمستند refType ≠ null محمية
 * بشارة صفراء وتُدار من مصدرها). الحالات: view | edit | delete داخل ورقة واحدة.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight, ArrowDownLeft, ArrowUpRight, Receipt, UserMinus,
  BadgeDollarSign, Banknote, ChevronLeft, Inbox, Landmark, Link2,
  TriangleAlert, Pencil, Trash2, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { patchJson } from "@/lib/api";
import { formatAmount, formatDate, formatDateDisplay } from "@/lib/format";
import { AmountText, KeyValueRow, PrimaryButton } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import type { CashTxDto } from "@/domain/cash";
import { cn } from "@/lib/utils";

/** أيقونة + لون كل نوع حركة (مشترك بين الخزينة وورقة التفاصيل) */
export const TX_META: Record<string, { icon: typeof Receipt; color: string; label: string }> = {
  receipt: { icon: ArrowDownLeft, color: "#34D399", label: "قبض" },
  payment: { icon: ArrowUpRight, color: "#F87171", label: "صرف" },
  expense: { icon: Receipt, color: "#FB923C", label: "مصروف" },
  employee_advance: { icon: UserMinus, color: "#FBBF24", label: "سحبية" },
  commission_payout: { icon: BadgeDollarSign, color: "#F472B6", label: "عمولة" },
  box_transfer: { icon: ArrowLeftRight, color: "#22D3EE", label: "تحويل" },
  bank_deposit: { icon: Landmark, color: "#A78BFA", label: "إيداع بنكي" },
  bank_withdraw: { icon: Banknote, color: "#34D399", label: "سحب بنكي" },
  salary_batch: { icon: Wallet, color: "#F87171", label: "رواتب" },
  opening: { icon: Inbox, color: "#94A3B8", label: "افتتاحي" },
};

/** تسميات عربية لأنواع المستندات المرتبطة (refType) */
export const REF_LABELS: Record<string, string> = {
  invoice: "فاتورة",
  voucher: "سند",
  installment: "قسط",
  advance: "سحبية",
  salary_period: "رواتب",
  commission: "عمولة",
  shift_reconcile: "تسوية وردية",
  stocktake: "جرد",
  transfer: "تحويل مخزني",
};

/** الطرف المرتبط بالحركة مع نوعه */
function partyOf(tx: CashTxDto): { label: string; name: string } | null {
  if (tx.customerName) return { label: "عميل", name: tx.customerName };
  if (tx.supplierName) return { label: "مورد", name: tx.supplierName };
  if (tx.employeeName) return { label: "موظف", name: tx.employeeName };
  if (tx.expenseCategoryName) return { label: "فئة", name: tx.expenseCategoryName };
  return null;
}

/** DELETE غير متوفر في مساعدات api.ts — نداء محلي بنفس نمط المعالجة */
async function deleteJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    toast.error("تعذر الاتصال بالخادم — تحقق من الشبكة");
    throw new Error("network");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* استجابة بلا جسم */
  }
  if (!res.ok) {
    let msg = `فشل الطلب (${res.status})`;
    if (body && typeof body === "object" && "error" in body) {
      const err = (body as { error: unknown }).error;
      if (err != null) msg = String(err);
    }
    toast.error(msg);
    throw new Error(msg);
  }
  return body as T;
}

export function TxDetailsSheet({
  tx,
  open,
  onOpenChange,
}: {
  tx: CashTxDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <PosSheet open={open && !!tx} onOpenChange={onOpenChange} title="تفاصيل الحركة">
      {tx && <TxBody key={tx.id} tx={tx} onOpenChange={onOpenChange} />}
    </PosSheet>
  );
}

function TxBody({ tx, onOpenChange }: { tx: CashTxDto; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [current, setCurrent] = useState<CashTxDto>(tx);
  const [deleting, setDeleting] = useState(false);

  const meta = TX_META[current.txType] ?? { icon: Receipt, color: "#94A3B8", label: current.txType };
  const Icon = meta.icon;
  const party = partyOf(current);
  const linked = current.refType != null;
  const dirVariant = current.direction >= 0 ? "pos" : "neg";

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteJson<{ ok: boolean }>(`/api/cashbox/tx/${current.id}`);
      toast.success("تم حذف الحركة بنجاح");
      qc.invalidateQueries({ queryKey: ["cashbox"] });
      onOpenChange(false);
    } catch {
      /* توست في deleteJson */
    } finally {
      setDeleting(false);
    }
  };

  if (mode === "edit") {
    return (
      <TxEditForm
        tx={current}
        onCancel={() => setMode("view")}
        onSaved={(updated) => {
          setCurrent(updated);
          setMode("view");
          qc.invalidateQueries({ queryKey: ["cashbox"] });
        }}
      />
    );
  }

  if (mode === "delete") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-2xl border border-[#F87171]/40 bg-[#F87171]/10 p-4">
          <span className="flex items-center gap-2 text-[15px] font-extrabold text-[#F87171]">
            <TriangleAlert className="size-5" aria-hidden />
            تأكيد حذف الحركة
          </span>
          <p className="text-[13.5px] leading-relaxed text-foreground">
            سيُحذف نهائياً سجل حركة «{current.txTypeLabel}» بمبلغ{" "}
            <span dir="ltr" className="font-num font-bold">
              {formatAmount(current.amount, { currency: current.currencyCode })}
            </span>{" "}
            بتاريخ {formatDateDisplay(current.txDate)} من صندوق «{current.cashboxName}».
            لا يمكن التراجع عن هذا الإجراء.
          </p>
        </div>
        <div className="flex gap-2">
          <PrimaryButton variant="outline" onClick={() => setMode("view")} block>
            رجوع
          </PrimaryButton>
          <PrimaryButton variant="danger" onClick={confirmDelete} loading={deleting} block>
            <Trash2 className="size-4" aria-hidden />
            تأكيد الحذف
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // ─── حالة العرض ───
  return (
    <div className="flex flex-col gap-3">
      {/* الرأس: أيقونة النوع + الطرف */}
      <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5">
        <span
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${meta.color}1F`, color: meta.color }}
        >
          <Icon className="size-7" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[16px] font-extrabold text-foreground">{current.txTypeLabel}</span>
          {party && (
            <span className="truncate text-[13px] text-muted-foreground">
              {party.label}: <span className="font-bold text-foreground">{party.name}</span>
            </span>
          )}
          <span className="truncate text-[12px] text-muted-foreground">
            {current.cashboxName} • {formatDateDisplay(current.txDate)}
          </span>
        </div>
      </div>

      {/* المبلغ */}
      <div className="flex flex-col items-center gap-1 rounded-2xl border border-border/60 bg-card p-4">
        <span className="text-[12.5px] font-medium text-muted-foreground">المبلغ</span>
        <AmountText value={current.amount} currency={current.currencyCode} size="2xl" variant={dirVariant} signed />
        {current.currencyCode !== "YER" && (
          <span dir="ltr" className="font-num text-[12px] text-muted-foreground">
            ≈ {formatAmount(current.amountBase, { currency: "YER" })}
          </span>
        )}
      </div>

      {/* حماية الحركة المرتبطة */}
      {linked && (
        <div className="flex items-center gap-2 rounded-xl border border-[#FBBF24]/40 bg-[#FBBF24]/10 px-3.5 py-2.5 text-[13px] font-bold text-[#FBBF24]">
          <Link2 className="size-4 shrink-0" aria-hidden />
          مرتبطة بمستند — تُدار من مصدرها
        </div>
      )}

      {/* شبكة التفاصيل */}
      <div className="flex flex-col gap-1.5 rounded-2xl border border-border/60 bg-card p-3.5">
        <KeyValueRow label="الصندوق" value={current.cashboxName} />
        <KeyValueRow label="التاريخ" value={formatDateDisplay(current.txDate)} />
        <KeyValueRow
          label="المكافئ بالأساس"
          value={
            <span dir="ltr" className="font-num">
              {formatAmount(current.amountBase, { currency: "YER" })}
            </span>
          }
        />
        {Math.abs(current.exchangeRate - 1) > 0.0001 && (
          <KeyValueRow
            label="سعر الصرف"
            value={
              <span dir="ltr" className="font-num">
                {formatAmount(current.exchangeRate, {
                  decimals: Number.isInteger(current.exchangeRate) ? 0 : 4,
                  showSymbol: false,
                })}
              </span>
            }
          />
        )}
        {current.description && (
          <KeyValueRow label="الوصف" value={<span className="text-start">{current.description}</span>} />
        )}
        {current.toCashboxName && <KeyValueRow label="الوجهة" value={current.toCashboxName} />}
        {current.refType && (
          <KeyValueRow
            label="المرجع"
            value={`${REF_LABELS[current.refType] ?? current.refType}${current.refId ? ` #${current.refId}` : ""}`}
          />
        )}
      </div>

      {/* أزرار التعديل/الحذف — للحركات اليدوية فقط */}
      {!linked && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("edit")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 py-3 text-[14px] font-bold text-primary",
              "transition-colors hover:bg-primary/20 active:scale-95"
            )}
          >
            <Pencil className="size-4" aria-hidden />
            تعديل
          </button>
          <button
            type="button"
            onClick={() => setMode("delete")}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#F87171]/10 py-3 text-[14px] font-bold text-[#F87171] transition-colors hover:bg-[#F87171]/20 active:scale-95"
          >
            <Trash2 className="size-4" aria-hidden />
            حذف
          </button>
        </div>
      )}
    </div>
  );
}

/** نموذج التعديل: المبلغ + التاريخ (ISO لحمولة date input) + الوصف */
function TxEditForm({
  tx,
  onSaved,
  onCancel,
}: {
  tx: CashTxDto;
  onSaved: (updated: CashTxDto) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState(String(tx.amount));
  const [date, setDate] = useState(formatDate(tx.txDate)); // ISO للحمولة
  const [desc, setDesc] = useState(tx.description ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = Number(amount);
    if (!(n > 0)) {
      toast.error("أدخل مبلغاً أكبر من صفر");
      return;
    }
    setSaving(true);
    try {
      const res = await patchJson<{ tx: CashTxDto; cashboxBalance: number; toCashboxBalance: number | null }>(
        `/api/cashbox/tx/${tx.id}`,
        {
          amount: n,
          txDate: date, // ISO دائماً — input type=date
          description: desc.trim() || null,
        }
      );
      toast.success("تم تحديث الحركة بنجاح");
      onSaved(res.tx);
    } catch {
      /* توست من api.ts */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`tx-amount-${tx.id}`} className="text-[13px] font-bold text-foreground">
          المبلغ <span className="text-[#F87171]">*</span>
        </label>
        <input
          id={`tx-amount-${tx.id}`}
          type="number"
          inputMode="decimal"
          dir="ltr"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-14 rounded-xl border border-border bg-background px-3.5 font-num text-[20px] font-extrabold text-foreground outline-none transition-colors focus:border-primary"
        />
        <span className="text-[11.5px] text-muted-foreground">
          بعملة الصندوق ({tx.currencyCode})
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`tx-date-${tx.id}`} className="text-[13px] font-bold text-foreground">
          التاريخ
        </label>
        <input
          id={`tx-date-${tx.id}`}
          type="date"
          dir="ltr"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-12 rounded-xl border border-border bg-background px-3.5 font-num text-[15px] font-bold text-foreground outline-none transition-colors focus:border-primary"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`tx-desc-${tx.id}`} className="text-[13px] font-bold text-foreground">
          الوصف
        </label>
        <textarea
          id={`tx-desc-${tx.id}`}
          rows={3}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="بيان الحركة…"
          className="scrollbar-slim rounded-xl border border-border bg-background p-3 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      <div className="flex gap-2">
        <PrimaryButton variant="outline" onClick={onCancel} block>
          رجوع
        </PrimaryButton>
        <PrimaryButton onClick={save} loading={saving} disabled={!amount || !date} block>
          حفظ التعديلات
        </PrimaryButton>
      </div>

      <p className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
        <ChevronLeft className="size-3.5 shrink-0" aria-hidden />
        النوع والصندوق والطرف ثابتون — يُعدَّل المبلغ والتاريخ والوصف فقط
      </p>
    </div>
  );
}
