"use client";

/**
 * اختيار صندوق الصرف (سحبيات/رواتب/عمولات) من صناديق bootstrap
 * + سعر صرف يدوي عند اختيار صندوق بعملة غير الأساس.
 */
import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { getJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Field, TextInput } from "@/components/parties/field";
import type { BootstrapData } from "@/lib/types";

export function useCashboxes() {
  return useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 60_000,
  });
}

interface CashboxPickerProps {
  cashboxId: number | null;
  onChange: (id: number) => void;
  /** سعر الصرف الحالي (للعرض/التعديل) — يُحدَّث تلقائياً عند تغيير الصندوق */
  rate: number;
  onRateChange: (rate: number) => void;
  label?: string;
}

export function CashboxPicker({ cashboxId, onChange, rate, onRateChange, label = "صندوق الصرف" }: CashboxPickerProps) {
  const { data } = useCashboxes();
  const boxes = data?.cashboxes ?? [];
  const selected = boxes.find((b) => b.id === cashboxId) ?? null;
  const isBase = selected ? data?.baseCurrency?.id === selected.currencyId : true;

  return (
    <div className="flex flex-col gap-2">
      <Field label={label}>
        <div className="flex flex-col gap-1.5">
          {boxes.map((b) => {
            const active = b.id === cashboxId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onChange(b.id);
                  if (data?.baseCurrency && b.currencyId !== data.baseCurrency.id) {
                    const r = data.rates?.[b.currency.code]?.rate;
                    onRateChange(r && r > 0 ? r : 1);
                  } else {
                    onRateChange(1);
                  }
                }}
                className={cn(
                  "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-start text-[14px] font-bold transition-colors",
                  active
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}
              >
                <Wallet className="size-4 shrink-0" aria-hidden />
                <span className="flex-1 truncate">{b.name}</span>
                <span className="font-num text-[12px] opacity-80">{b.currency?.code}</span>
              </button>
            );
          })}
        </div>
      </Field>
      {selected && !isBase && (
        <Field label="سعر الصرف (وحدة العملة بالأساس)">
          <TextInput
            value={String(rate)}
            onChange={(v) => onRateChange(Number(v) || 0)}
            inputMode="decimal"
            dir="ltr"
          />
        </Field>
      )}
    </div>
  );
}
