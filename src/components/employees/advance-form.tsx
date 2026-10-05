"use client";

/**
 * نموذج سحبية (FR-07-03): موظف + مبلغ + صندوق + تاريخ + بيان.
 * تُخصم تلقائياً من مسير راتب الشهر — مع تلميح رصيد السحبيات غير المخصومة.
 */
import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins } from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { PartySheet } from "@/components/parties/party-sheet";
import { Field, TextInput, DateInput } from "@/components/parties/field";
import { PrimaryButton, AmountText } from "@/components/ds";
import { CashboxPicker } from "./cashbox-picker";
import { cn } from "@/lib/utils";

interface EmployeeOption {
  id: number;
  name: string;
  role: string | null;
}

interface AdvanceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** من بطاقة الموظف — يثبّت الموظف */
  fixedEmployeeId?: number;
  fixedEmployeeName?: string;
  onSaved?: () => void;
}

export function AdvanceForm({ open, onOpenChange, fixedEmployeeId, fixedEmployeeName, onSaved }: AdvanceFormProps) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState<number | null>(fixedEmployeeId ?? null);
  const [amount, setAmount] = useState("");
  const [cashboxId, setCashboxId] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const [txDate, setTxDate] = useState(today);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: empsData } = useQuery<{ employees: EmployeeOption[] }>({
    queryKey: ["employees", "options"],
    queryFn: () => getJson<{ employees: EmployeeOption[] }>("/api/employees?limit=100"),
    enabled: open && !fixedEmployeeId,
  });
  const { data: balances } = useQuery<{ balances: Array<{ employeeId: number; name: string; unpaidBase: number }> }>({
    queryKey: ["advances", "balances"],
    queryFn: () => getJson<{ balances: Array<{ employeeId: number; name: string; unpaidBase: number }> }>("/api/advances?limit=1"),
    enabled: open,
  });

  const unpaid = balances?.balances.find((b) => b.employeeId === employeeId)?.unpaidBase ?? 0;

  const save = async () => {
    if (!employeeId) {
      toast.error("اختر الموظف");
      return;
    }
    if (!cashboxId) {
      toast.error("اختر صندوق الصرف");
      return;
    }
    const amountNum = Number(amount || 0);
    if (!(amountNum > 0)) {
      toast.error("أدخل مبلغ السحبية");
      return;
    }
    setSaving(true);
    try {
      const res = await postJson<{ advance: { amountBase: number } }>("/api/advances", {
        employeeId,
        amount: amountNum,
        cashboxId,
        txDate,
        description: description || null,
      });
      toast.success(`تم صرف السحبية (${formatAmount(res.advance.amountBase)} ر.ي) — ستُخصم من مسير الشهر`);
      qc.invalidateQueries({ queryKey: ["advances"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      onSaved?.();
      onOpenChange(false);
      setAmount("");
      setDescription("");
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
      title="سحبية جديدة"
      description="سلفة تُصرف من الصندوق وتُخصم تلقائياً من مسير راتب الموظف"
      footer={
        <div className="flex gap-2">
          <PrimaryButton variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            إلغاء
          </PrimaryButton>
          <PrimaryButton className="flex-[2] gap-1.5" loading={saving} onClick={save}>
            <HandCoins className="size-4" aria-hidden />
            صرف السحبية
          </PrimaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        {fixedEmployeeId ? (
          <Field label="الموظف">
            <div className="flex min-h-12 items-center rounded-xl border border-primary/40 bg-primary/10 px-3 text-[15px] font-bold text-primary">
              {fixedEmployeeName}
            </div>
          </Field>
        ) : (
          <Field label="الموظف" required>
            <div className="scrollbar-slim flex max-h-44 flex-col gap-1.5 overflow-y-auto">
              {(empsData?.employees ?? []).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEmployeeId(e.id)}
                  className={cn(
                    "flex min-h-11 items-center justify-between rounded-xl border px-3 text-[14px] font-bold transition-colors",
                    employeeId === e.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent/30"
                  )}
                >
                  <span className="truncate">{e.name}</span>
                  {e.role && <span className="text-[12px] font-medium opacity-70">{e.role}</span>}
                </button>
              ))}
              {(empsData?.employees ?? []).length === 0 && (
                <p className="py-3 text-center text-[13px] text-muted-foreground">لا موظفون — سجّل موظفاً أولاً</p>
              )}
            </div>
          </Field>
        )}

        <Field label="مبلغ السحبية" required>
          <TextInput value={amount} onChange={setAmount} placeholder="0" inputMode="decimal" dir="ltr" />
        </Field>

        <CashboxPicker cashboxId={cashboxId} onChange={setCashboxId} rate={rate} onRateChange={setRate} />

        <Field label="تاريخ السحبية">
          <DateInput value={txDate} onChange={setTxDate} />
        </Field>
        <Field label="البيان (اختياري)">
          <TextInput value={description} onChange={setDescription} placeholder="مثال: سلفة ظروف عائلية" />
        </Field>

        {employeeId != null && unpaid > 0.005 && (
          <div className="rounded-xl border border-[#FBBF24]/30 bg-[#FBBF24]/10 p-3 text-[13px]">
            سحبيات سابقة غير مخصومة لهذا الموظف:{" "}
            <AmountText value={unpaid} currency="YER" size="sm" variant="due" /> — ستُخصم معاً من مسير الشهر.
          </div>
        )}
      </div>
    </PartySheet>
  );
}
