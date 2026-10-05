"use client";

/**
 * جدول التقارير الداكن المشترك + شريط أدوات التقرير (طباعة A4 / تصدير CSV).
 */
import type { ReactNode } from "react";
import { Printer, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { downloadCsv, csvName } from "./csv";

export interface RptColumn {
  key: string;
  label: string;
  num?: boolean;
  /** عرض نسبي للعمود (grid fr) */
  fr?: number;
}

interface ReportTableProps {
  columns: RptColumn[];
  rows: Array<Record<string, ReactNode | string | number | null | undefined>>;
  /** مفاتيح أعمدة تُنسّق مبالغ (أرقام خام) */
  amountKeys?: string[];
  emptyText?: string;
  maxH?: string;
}

export function ReportTable({
  columns,
  rows,
  amountKeys = [],
  emptyText = "لا توجد بيانات لهذه الفترة",
  maxH = "max-h-[52vh]",
}: ReportTableProps) {
  const frs = columns.map((c) => `${c.fr ?? 1}fr`).join(" ");
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card p-6 text-center text-[13.5px] text-muted-foreground">
        {emptyText}
      </div>
    )
  }
  return (
    <div className={cn("scrollbar-slim overflow-y-auto rounded-xl border border-border/60 bg-card", maxH)}>
      <div className="sticky top-0 z-10 bg-card/95 backdrop-blur">
        <div
          dir="rtl"
          className="grid gap-2 border-b border-border/70 px-3 py-2.5 text-[12px] font-bold text-muted-foreground"
          style={{ gridTemplateColumns: frs }}
        >
          {columns.map((c) => (
            <span key={c.key} className={c.num ? "text-left font-num" : ""}>
              {c.label}
            </span>
          ))}
        </div>
      </div>
      <div className="divide-y divide-border/40">
        {rows.map((r, i) => (
          <div
            key={i}
            dir="rtl"
            className="grid items-center gap-2 px-3 py-2.5 text-[13px] text-foreground"
            style={{ gridTemplateColumns: frs }}
          >
            {columns.map((c) => (
              <span key={c.key} className={cn("min-w-0 truncate", c.num && "text-left font-num")}>
                {amountKeys.includes(c.key) && typeof r[c.key] === "number"
                  ? formatAmount(r[c.key] as number)
                  : (r[c.key] as ReactNode) ?? "—"}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/** شريط أدوات التقرير: طباعة + تصدير CSV */
export function ReportToolbar({
  onPrint,
  csvRows,
  csvPrefix,
  disabled,
}: {
  onPrint: () => void;
  csvRows?: () => Array<Record<string, string | number | null | undefined>>;
  csvPrefix: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onPrint}
        disabled={disabled}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5 text-[13.5px] font-bold text-primary transition-colors hover:bg-primary/20 disabled:opacity-50 active:scale-[0.98]"
      >
        <Printer className="size-4" aria-hidden />
        طباعة
      </button>
      <button
        type="button"
        disabled={disabled || !csvRows}
        onClick={() => {
          const rows = csvRows?.() ?? []
          if (rows.length === 0) {
            toast.info("لا توجد بيانات للتصدير")
            return
          }
          downloadCsv(csvName(csvPrefix), rows)
          toast.success("تم تصدير التقرير CSV")
        }}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-[13.5px] font-bold text-foreground transition-colors hover:bg-accent/40 disabled:opacity-50 active:scale-[0.98]"
      >
        <FileSpreadsheet className="size-4 text-[#34D399]" aria-hidden />
        تصدير CSV
      </button>
    </div>
  )
}
