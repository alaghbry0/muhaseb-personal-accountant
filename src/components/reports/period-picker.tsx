"use client";

/**
 * منتقي الفترة الدورية المشترك (FR-09-09) — رقائق جاهزة + مخصص.
 * اليوم / أمس / هذا الأسبوع / هذا الشهر / الربع / هذا العام / مخصص (from/to).
 */
import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { resolvePeriod, formatDateDisplay, type PeriodId } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ReportPeriodId = PeriodId | "yesterday";

export interface PeriodState {
  period: ReportPeriodId
  from: string
  to: string
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** حل فترة (يشمل «أمس» الغائب من resolvePeriod) */
function solvePeriod(p: ReportPeriodId): { from: string; to: string } {
  if (p === "yesterday") {
    const y = isoDay(addDays(new Date(), -1))
    return { from: y, to: y }
  }
  return resolvePeriod(p as PeriodId)
}

export function makePeriodState(period: ReportPeriodId = "month"): PeriodState {
  const r = solvePeriod(period)
  return { period, from: r.from, to: r.to }
}

const CHIPS: Array<{ id: ReportPeriodId; label: string }> = [
  { id: "today", label: "اليوم" },
  { id: "yesterday", label: "أمس" },
  { id: "week", label: "هذا الأسبوع" },
  { id: "month", label: "هذا الشهر" },
  { id: "quarter", label: "الربع" },
  { id: "year", label: "هذا العام" },
  { id: "custom", label: "مخصص" },
]

interface PeriodPickerProps {
  value: PeriodState
  onChange: (v: PeriodState) => void
  className?: string
}

export function PeriodPicker({ value, onChange, className }: PeriodPickerProps) {
  const [customOpen, setCustomOpen] = useState(false)

  const pick = (id: ReportPeriodId) => {
    if (id === "custom") {
      setCustomOpen(true)
      onChange({ period: "custom", from: value.from, to: value.to })
      return
    }
    const r = solvePeriod(id)
    onChange({ period: id, from: r.from, to: r.to })
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5" role="tablist" aria-label="اختيار الفترة">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={value.period === c.id}
            onClick={() => pick(c.id)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
              value.period === c.id
                ? "border-primary bg-primary/15 text-primary"
                : "border-border/70 text-muted-foreground hover:bg-accent/30"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <CalendarDays className="size-4 shrink-0 text-primary/70" aria-hidden />
        <span dir="ltr" className="font-num text-[12.5px] text-muted-foreground">
          {formatDateDisplay(value.from)} — {formatDateDisplay(value.to)}
        </span>
        {value.period === "custom" && !customOpen && (
          <button type="button" onClick={() => setCustomOpen(true)} className="text-[12.5px] font-bold text-primary">
            تعديل
          </button>
        )}
      </div>
      {(value.period === "custom" && customOpen) || (customOpen && value.period === "custom") ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-card p-2.5">
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            من
            <input
              type="date"
              dir="ltr"
              value={value.from}
              max={value.to}
              onChange={(e) => onChange({ ...value, from: e.target.value })}
              className="rounded-lg border border-border bg-background px-2 py-1.5 font-num text-[13px] text-foreground"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
            إلى
            <input
              type="date"
              dir="ltr"
              value={value.to}
              min={value.from}
              onChange={(e) => onChange({ ...value, to: e.target.value })}
              className="rounded-lg border border-border bg-background px-2 py-1.5 font-num text-[13px] text-foreground"
            />
          </label>
          <button
            type="button"
            onClick={() => setCustomOpen(false)}
            aria-label="إغلاق التخصيص"
            className="ms-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/40"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** عنوان الفترة للعرض/الطباعة */
export function periodLabel(v: PeriodState): string {
  return `${formatDateDisplay(v.from)} — ${formatDateDisplay(v.to)}`
}
