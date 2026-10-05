"use client";

/**
 * ورقة «تفاصيل وردية مقفلة» — Task 10-b: كل صف بسجل الورديات المقفلة
 * قابل للنقر فيفتح هذه الورقة: التصنيف الكامل (معاد حسابه من الحركات بين
 * يومي الفتح والإقفال) + المتوقع/الفعلي/الفرق + عدّ البداية والملاحظات
 * + إعادة طباعة تقرير الوردية 80مم.
 */
import { useQuery } from "@tanstack/react-query";
import { BadgeDollarSign, CheckCircle2, Printer, TriangleAlert } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDateTimeDisplay } from "@/lib/format";
import { AmountText, EmptyState, KeyValueRow } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { printShiftReport } from "@/components/cash/shift-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { ShiftBreakdown, ShiftDetailsResult } from "@/domain/cash";
import { cn } from "@/lib/utils";

/** تعريف صفوف التصنيف (label + المفتاح + الإشارة) — مشترك مع بطاقة الوردية الحية */
export function shiftBreakdownRows(b: ShiftBreakdown): Array<{
  label: string;
  value: number;
  sign: 1 | -1;
}> {
  return [
    { label: "مبيعات نقدية", value: b.cashSales, sign: 1 },
    { label: "تحصيلات (سندات/أقساط)", value: b.collections, sign: 1 },
    { label: "سحب بنكي / أخرى", value: b.otherIn, sign: 1 },
    { label: "تحويلات واردة", value: b.transfersIn, sign: 1 },
    { label: "مصاريف", value: b.expenses, sign: -1 },
    { label: "صرف لموردين", value: b.payments, sign: -1 },
    { label: "سحبيات موظفين", value: b.advances, sign: -1 },
    { label: "عمولات مصروفة", value: b.commissions, sign: -1 },
    { label: "رواتب", value: b.salaries, sign: -1 },
    { label: "إيداعات بنكية", value: b.bankDeposits, sign: -1 },
    { label: "تحويلات صادرة", value: b.transfersOut, sign: -1 },
  ];
}

/** دالة تصنيف نتيجة الفرق: 0 مطابقة / >0 زيادة / <0 عجز */
function diffVariant(d: number): "pos" | "due" | "neg" {
  return Math.abs(d) < 0.01 ? "pos" : d > 0 ? "due" : "neg";
}

export function ShiftDetailsSheet({
  shift,
  open,
  onOpenChange,
}: {
  /** تعريف مختصر للوردية المفتوحة تفاصيلها (يكفي المعرف) */
  shift: { id: number; cashboxName: string; currencyCode: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { company } = usePrintCompany();
  const shiftId = shift?.id ?? 0;
  const { data, isLoading, isError } = useQuery<ShiftDetailsResult>({
    queryKey: ["cashbox", "shift-details", shiftId],
    queryFn: () => getJson<ShiftDetailsResult>(`/api/cashbox/shift/${shiftId}`),
    enabled: open && !!shift,
  });

  // بيانات التصنيف تُعرض بعد التحميل فقط — الرأس يعتمد على الرد الكامل
  const difference = data?.difference ?? 0;
  const variant = diffVariant(difference);
  const rows = data ? shiftBreakdownRows(data.breakdown) : [];

  return (
    <PosSheet open={open && !!shift} onOpenChange={onOpenChange} title={`تفاصيل الوردية #${shiftId}`}>
      {isLoading ? (
        <div className="flex flex-col gap-3 py-2" aria-busy="true" aria-live="polite">
          <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
          <div className="h-52 animate-pulse rounded-2xl bg-muted/60" />
          <p className="text-center text-[13px] text-muted-foreground">جارٍ تحميل تفاصيل الوردية…</p>
        </div>
      ) : isError || !data ? (
        <EmptyState
          icon={TriangleAlert}
          message="تعذر تحميل تفاصيل الوردية"
          hint="تحقق من أن الوردية مقفلة ثم أعد المحاولة"
        />
      ) : (
        <div className="flex flex-col gap-3">
          {/* ─── الرأس: الوردية + الصندوق + شارة النتيجة ─── */}
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5">
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                variant === "pos" ? "bg-[#34D399]/15 text-[#34D399]" : variant === "due" ? "bg-[#FBBF24]/15 text-[#FBBF24]" : "bg-[#F87171]/15 text-[#F87171]"
              )}
            >
              {variant === "pos" ? (
                <CheckCircle2 className="size-5" aria-hidden />
              ) : (
                <BadgeDollarSign className="size-5" aria-hidden />
              )}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-[15.5px] font-extrabold text-foreground">
                <span dir="ltr" className="font-num">
                  وردية #{data.shiftId}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11.5px] font-bold",
                    variant === "pos"
                      ? "bg-[#34D399]/15 text-[#34D399]"
                      : variant === "due"
                        ? "bg-[#FBBF24]/15 text-[#FBBF24]"
                        : "bg-[#F87171]/15 text-[#F87171]"
                  )}
                >
                  {variant === "pos" ? "مطابقة" : variant === "due" ? "زيادة" : "عجز"}
                </span>
              </span>
              <span className="truncate text-[13px] text-muted-foreground">
                {data.cashboxName} • <span dir="ltr" className="font-num">{data.currencyCode}</span>
              </span>
            </div>
          </div>

          {/* ─── لوحة النتيجة (نفس لوحة إقفال الوردية) ─── */}
          <div
            className={cn(
              "flex flex-col items-center gap-1 rounded-2xl p-4",
              variant === "pos" ? "bg-[#34D399]/10" : variant === "due" ? "bg-[#FBBF24]/10" : "bg-[#F87171]/10"
            )}
          >
            <span className="text-[13.5px] font-bold text-foreground">
              {variant === "pos" ? "الوردية مطابقة تماماً ✓" : variant === "due" ? "زيادة في الصندوق (عجز في التسجيل)" : "نقص في الصندوق (عجز نقدي)"}
            </span>
            <AmountText value={data.difference} currency={data.currencyCode} size="2xl" variant={variant} signed />
          </div>

          {/* ─── بيانات الوردية ─── */}
          <div className="flex flex-col gap-1.5 rounded-2xl border border-border/60 bg-card p-3.5">
            <KeyValueRow
              label="الفتح"
              value={<span dir="ltr" className="font-num text-[13.5px]">{formatDateTimeDisplay(data.openedAt)}</span>}
            />
            <KeyValueRow
              label="الإقفال"
              value={<span dir="ltr" className="font-num text-[13.5px]">{formatDateTimeDisplay(data.closedAt)}</span>}
            />
            <KeyValueRow
              label="عدّ البداية"
              value={
                data.openingCount != null ? (
                  <span dir="ltr" className="font-num">{formatAmount(data.openingCount, { currency: data.currencyCode })}</span>
                ) : (
                  "—"
                )
              }
            />
            <KeyValueRow
              label="المتوقع (محسوب)"
              value={<span dir="ltr" className="font-num">{formatAmount(data.expected, { currency: data.currencyCode })}</span>}
            />
            <KeyValueRow
              label="العدّ الفعلي"
              value={<span dir="ltr" className="font-num">{formatAmount(data.counted, { currency: data.currencyCode })}</span>}
            />
            <KeyValueRow
              label="الفرق"
              value={<AmountText value={data.difference} currency={data.currencyCode} size="md" variant={variant} signed />}
            />
            {data.notes && (
              <KeyValueRow label="ملاحظات" value={<span className="text-start">{data.notes}</span>} />
            )}
          </div>

          {/* ─── التصنيف الكامل (كل الصفوف بما فيها الأصفار) ─── */}
          <div className="flex flex-col gap-1 rounded-2xl border border-border/60 p-3">
            <span className="mb-1 text-[12.5px] font-bold text-muted-foreground">
              تصنيف حركات الفترة (من الفتح حتى الإقفال)
            </span>
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between border-b border-border/40 py-1.5 text-[13px] last:border-b-0">
                <span className="text-muted-foreground">{r.label}</span>
                <AmountText value={r.value} currency={data.currencyCode} size="sm" variant={r.sign > 0 ? "pos" : "neg"} signed />
              </div>
            ))}
            <div className="mt-1 flex items-center justify-between rounded-xl bg-primary/8 px-3 py-2 text-[13px] font-bold">
              <span className="text-foreground">صافي الحركات</span>
              <AmountText value={data.breakdown.net} currency={data.currencyCode} size="md" variant={data.breakdown.net >= 0 ? "primary" : "neg"} signed />
            </div>
          </div>

          {/* ─── إعادة الطباعة ─── */}
          <button
            type="button"
            onClick={() => printShiftReport(data, company)}
            className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-[14px] font-bold text-primary transition-colors hover:bg-primary/20 active:scale-[0.98]"
          >
            <Printer className="size-4" aria-hidden />
            طباعة تقرير الوردية (80مم)
          </button>
        </div>
      )}
    </PosSheet>
  );
}
