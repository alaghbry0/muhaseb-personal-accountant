"use client";

/**
 * صرف عمولات المندوب (FR-06-03): قائمة المستحق مع تحديد + صندوق + «صرف المحدد».
 * POST /api/reps/[id]/pay-commissions → toast + تحديث البطاقة والحساب.
 */
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDate } from "@/lib/format";
import { PartySheet } from "@/components/parties/party-sheet";
import { Field, DateInput } from "@/components/parties/field";
import { PrimaryButton, AmountText, EmptyState } from "@/components/ds";
import { CashboxPicker } from "./cashbox-picker";
import { cn } from "@/lib/utils";

interface DueCommission {
  id: number;
  refType: "invoice" | "collection";
  refId: number;
  baseAmount: number;
  percent: number;
  amount: number;
  createdAt: string;
}

interface AccountResponse {
  commissions: { due: number; paid: number; netDue: number; dueCount: number };
  dueList: DueCommission[];
}

interface RepPayoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repId: number;
  repName: string;
}

export function RepPayoutSheet({ open, onOpenChange, repId, repName }: RepPayoutSheetProps) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [inited, setInited] = useState(false);
  const [cashboxId, setCashboxId] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const [txDate, setTxDate] = useState(today);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery<AccountResponse>({
    queryKey: ["reps", "rep-account", repId, "due"],
    queryFn: () => getJson<AccountResponse>(`/api/reps/${repId}/account`),
    enabled: open,
  });

  // تحديد الكل افتراضياً عند فتح اللوحة (بلا set-state داخل effect — عبر أول رسم للبيانات)
  const dueList = data?.dueList ?? [];
  if (open && !inited && dueList.length > 0) {
    setSelected(new Set(dueList.map((c) => c.id)));
    setInited(true);
  }
  if (!open && inited) {
    setInited(false);
    setSelected(new Set());
  }

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedAmount = dueList.filter((c) => selected.has(c.id)).reduce((s, c) => s + c.amount, 0);
  const allSelected = dueList.length > 0 && selected.size === dueList.length;

  const pay = async () => {
    if (!cashboxId) {
      toast.error("اختر صندوق الصرف");
      return;
    }
    if (selected.size === 0) {
      toast.error("حدد العمولات المراد صرفها");
      return;
    }
    setSaving(true);
    try {
      const res = await postJson<{ paidCount: number; amountBase: number }>(
        `/api/reps/${repId}/pay-commissions`,
        { commissionIds: [...selected], cashboxId, txDate }
      );
      toast.success(
        `تم صرف ${res.paidCount} عمولة بمبلغ ${formatAmount(res.amountBase)} ر.ي من الصندوق`
      );
      qc.invalidateQueries({ queryKey: ["parties", "rep-file", repId] });
      qc.invalidateQueries({ queryKey: ["reps"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
    } catch {
      /* toast عبر api.ts */
    } finally {
      setSaving(false);
    }
  };

  return (
    <PartySheet
      open={open}
      onOpenChange={onOpenChange}
      title={`صرف عمولات — ${repName}`}
      description={dueList.length > 0 ? `${dueList.length} عمولة مستحقة` : "لا عمولات مستحقة حالياً"}
      footer={
        dueList.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[13px] text-muted-foreground">
              <span>المحدد: {selected.size} عمولة</span>
              <span>
                الإجمالي: <AmountText value={selectedAmount} currency="YER" size="sm" variant="neg" />
              </span>
            </div>
            <div className="flex gap-2">
              <PrimaryButton
                variant="outline"
                onClick={() => setSelected(allSelected ? new Set() : new Set(dueList.map((c) => c.id)))}
              >
                {allSelected ? "إلغاء التحديد" : "تحديد الكل"}
              </PrimaryButton>
              <PrimaryButton
                variant="success"
                className="flex-[2] gap-1.5"
                loading={saving}
                onClick={pay}
              >
                <BadgeCheck className="size-4" aria-hidden />
                صرف المحدد من الصندوق
              </PrimaryButton>
            </div>
          </div>
        ) : undefined
      }
    >
      {dueList.length === 0 ? (
        <EmptyState message="لا عمولات مستحقة لهذا المندوب" hint="تُولَّد العمولات تلقائياً مع فواتير البيع والتحصيل" className="py-6" />
      ) : (
        <div className="flex flex-col gap-3.5">
          <div className="scrollbar-slim max-h-64 overflow-y-auto">
            {dueList.map((c) => {
              const active = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-2.5 rounded-xl border px-3 text-start transition-colors",
                    active ? "border-primary/60 bg-primary/10" : "border-border/60 hover:bg-accent/30"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-md border text-[11px] font-bold",
                      active ? "border-primary bg-primary text-primary-foreground" : "border-border"
                    )}
                    aria-hidden
                  >
                    {active ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">
                      {c.refType === "invoice" ? "عمولة مبيعات" : "عمولة تحصيل"} —{" "}
                      <span className="font-num text-[12.5px] text-muted-foreground">
                        {formatAmount(c.baseAmount, { decimals: 0, showSymbol: false })} × {c.percent}%
                      </span>
                    </span>
                    <span className="font-num block text-[12px] text-muted-foreground">{formatDate(c.createdAt)}</span>
                  </span>
                  <AmountText value={c.amount} currency="YER" size="sm" variant="due" />
                </button>
              );
            })}
          </div>
          <CashboxPicker cashboxId={cashboxId} onChange={setCashboxId} rate={rate} onRateChange={setRate} />
          <Field label="تاريخ الصرف">
            <DateInput value={txDate} onChange={setTxDate} />
          </Field>
        </div>
      )}
    </PartySheet>
  );
}
