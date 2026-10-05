"use client";

/**
 * لوحة التحصيل السريع لقسط — FR-05-02: المبلغ (معبأ بالمتبقي، جزئي مسموح)
 * + الصندوق + التاريخ → POST /api/installments/[id]/collect.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getJson, postJson } from "@/lib/api";
import type { BootstrapData } from "@/lib/types";
import type { InstallmentDto, CollectResult } from "@/domain/installments";
import { PartySheet } from "./party-sheet";
import { Field, TextInput, DateInput } from "./field";
import { PrimaryButton, AmountText } from "@/components/ds";
import { todayStr } from "@/domain/parties";

interface CollectSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  installment: InstallmentDto | null;
  customerName?: string;
  currencyCode?: string;
  onCollected?: (result: CollectResult) => void;
}

export function CollectSheet({
  open,
  onOpenChange,
  installment,
  customerName,
  currencyCode = "YER",
  onCollected,
}: CollectSheetProps) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(installment?.remaining ?? 0));
  const [cashboxId, setCashboxId] = useState<number | null>(null);
  const [txDate, setTxDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 30_000,
  });

  if (!installment) return null;

  const save = async () => {
    const amt = Number(amount || 0);
    if (!(amt > 0)) {
      toast.error("أدخل مبلغ التحصيل");
      return;
    }
    if (!cashboxId) {
      toast.error("اختر الصندوق");
      return;
    }
    setSaving(true);
    try {
      const result = await postJson<CollectResult>(`/api/installments/${installment.id}/collect`, {
        amount: amt,
        cashboxId,
        txDate,
      });
      toast.success(
        result.installment.status === "paid"
          ? `تم تحصيل القسط #${installment.seq} بالكامل ✅`
          : `تم تسجيل دفعة جزئية للقسط #${installment.seq}`
      );
      if (result.commissionCreated) toast.info("وُلّدت عمولة تحصيل للمندوب");
      onCollected?.(result);
      qc.invalidateQueries({ queryKey: ["installments"] });
      qc.invalidateQueries({ queryKey: ["parties"] });
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
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) setAmount(String(installment?.remaining ?? 0));
      }}
      title={`تحصيل القسط #${installment.seq}${customerName ? ` — ${customerName}` : ""}`}
      description={`الاستحقاق ${installment.dueDate} • المتبقي ${installment.remaining} ${currencyCode}`}
      footer={
        <PrimaryButton variant="success" block loading={saving} onClick={save}>
          تحصيل وتسجيل قبض
        </PrimaryButton>
      }
    >
      <div className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/40 p-3">
          <span className="text-[13px] text-muted-foreground">قيمة القسط</span>
          <AmountText value={installment.amount} currency={currencyCode} size="md" />
          {installment.paidAmount > 0 && (
            <span className="text-[12px] text-[#34D399]">
              مدفوع <AmountText value={installment.paidAmount} currency={currencyCode} size="sm" variant="pos" />
            </span>
          )}
        </div>
        <Field label="المبلغ المحصّل" required>
          <TextInput value={amount} onChange={setAmount} dir="ltr" inputMode="decimal" />
        </Field>
        {Number(amount) < installment.remaining && (
          <p className="text-[12px] text-[#FBBF24]">تحصيل جزئي — سيبقى للقسط {installment.remaining - Number(amount || 0)}</p>
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
      </div>
    </PartySheet>
  );
}

