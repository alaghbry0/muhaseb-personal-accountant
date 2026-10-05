"use client";

/**
 * لوحة اختيار العميل (شاشة البيع) — بحث سريع + «نقدي — زبون عابر» + الأرصدة.
 * ولوحة خيارات عامة (صندوق/مخزن/عملة/مندوب) بقائمة راديو بسيطة.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import type { CustomerListResponse } from "@/domain/dto";
import { PosSheet } from "./pos-sheet";
import { cn } from "@/lib/utils";

// ═══════════════ اختيار العميل ═══════════════

interface CustomerPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedId: number | null
  onSelect: (id: number | null, name: string) => void
}

export function CustomerPicker({ open, onOpenChange, selectedId, onSelect }: CustomerPickerProps) {
  const [q, setQ] = useState("")
  const { data, isLoading } = useQuery<CustomerListResponse>({
    queryKey: ["pos-customers"],
    queryFn: () => getJson<CustomerListResponse>("/api/parties/customers?limit=100"),
    enabled: open,
    staleTime: 60_000,
  })

  const customers = (data?.customers ?? []).filter(
    (c) => !q || c.name.includes(q) || (c.phone ?? "").includes(q)
  )

  function pick(id: number | null, name: string) {
    onSelect(id, name)
    onOpenChange(false)
    setQ("")
  }

  return (
    <PosSheet
      open={open}
      onOpenChange={onOpenChange}
      title="اختر العميل"
      description="الفاتورة الآجلة تتطلب اختيار عميل"
    >
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 focus-within:border-primary/70">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم أو الهاتف…"
            autoFocus
            aria-label="بحث العملاء"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none"
          />
        </div>
      </div>
      <div className="mt-1 flex flex-col gap-2 pt-1">
        <button
          type="button"
          onClick={() => pick(null, "")}
          className={cn(
            "flex min-h-14 items-center gap-3 rounded-xl border px-3 text-start transition-colors",
            selectedId === null
              ? "border-primary bg-primary/10"
              : "border-border/70 bg-card hover:bg-accent/30"
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserRound className="size-5" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold text-foreground">نقدي — زبون عابر</span>
            <span className="block text-[12px] text-muted-foreground">بيع فوري بدون حساب</span>
          </span>
        </button>
        {isLoading && (
          <p className="py-4 text-center text-[13px] text-muted-foreground">جارٍ التحميل…</p>
        )}
        {customers.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => pick(c.id, c.name)}
            className={cn(
              "flex min-h-14 items-center gap-3 rounded-xl border px-3 text-start transition-colors",
              selectedId === c.id
                ? "border-primary bg-primary/10"
                : "border-border/70 bg-card hover:bg-accent/30"
            )}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-[15px] font-bold text-foreground">
              {c.name.charAt(0)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-medium text-foreground">
                {c.name}
              </span>
              <span className="block truncate text-[12px] text-muted-foreground">
                {c.phone ?? "بلا هاتف"}
                {c.area ? ` — ${c.area}` : ""}
              </span>
            </span>
            {c.balance !== 0 && (
              <span
                className={cn(
                  "shrink-0 font-num text-[12.5px] font-bold",
                  c.balance > 0 ? "text-[#FBBF24]" : "text-[#34D399]"
                )}
              >
                {formatAmount(c.balance, { decimals: 0, showSymbol: false })}
              </span>
            )}
          </button>
        ))}
        {!isLoading && customers.length === 0 && (
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            لا يوجد عملاء مطابقون
          </p>
        )}
      </div>
    </PosSheet>
  )
}

// ═══════════════ لوحة خيارات عامة (صندوق/مخزن/عملة/مندوب) ═══════════════

export interface PickerOption {
  id: number | null
  label: string
  subtitle?: string
}

interface OptionPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  options: PickerOption[]
  selectedId: number | null
  onSelect: (id: number | null) => void
}

export function OptionPicker({ open, onOpenChange, title, options, selectedId, onSelect }: OptionPickerProps) {
  return (
    <PosSheet open={open} onOpenChange={onOpenChange} title={title}>
      <div className="flex flex-col gap-2">
        {options.map((o) => (
          <button
            key={String(o.id)}
            type="button"
            onClick={() => {
              onSelect(o.id)
              onOpenChange(false)
            }}
            className={cn(
              "flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 text-start transition-colors",
              selectedId === o.id
                ? "border-primary bg-primary/10"
                : "border-border/70 bg-card hover:bg-accent/30"
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-foreground">
                {o.label}
              </span>
              {o.subtitle && (
                <span className="block truncate text-[12px] text-muted-foreground">
                  {o.subtitle}
                </span>
              )}
            </span>
            {selectedId === o.id && (
              <span className="size-3 shrink-0 rounded-full bg-primary" aria-hidden />
            )}
          </button>
        ))}
      </div>
    </PosSheet>
  )
}
