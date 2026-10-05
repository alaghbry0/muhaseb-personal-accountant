"use client";

/**
 * وردية الصندوق — FR-04-04: فتح/إقفال الوردية. بطاقة الوردية المفتوحة
 * (الرصيد المتوقع + تصنيف الحركات: مبيعات نقدية + تحصيلات − مصاريف − سحبيات…)
 * + عدّ فعلي + إقفال (لوحة نتيجة بالفرق الملوّن + طباعة 80مم) + سجل الورديات.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Wallet, Clock, PlayCircle, StopCircle, Printer, History, CheckCircle2, XCircle, BadgeDollarSign } from "lucide-react";
import { toast } from "sonner";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDateTime } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { AppHeader, AmountText, EmptyState, KeyValueRow, ListRow, PrimaryButton, SectionTitle } from "@/components/ds";
import { Checkbox } from "@/components/ui/checkbox";
import { PosSheet } from "@/components/pos/pos-sheet";
import { printShiftReport } from "@/components/cash/shift-print";
import { usePrintCompany } from "@/components/reports/csv";
import type { ShiftStateDto, CloseShiftResult } from "@/domain/cash";
import { cn } from "@/lib/utils";

interface BoxesResponse {
  cashboxes: Array<{ id: number; name: string; currencyCode: string; balance: number; isDefault: boolean }>;
}

export default function CashShiftScreen(params: { cashboxId?: number }) {
  const { push } = useNav();
  const qc = useQueryClient();
  const { company } = usePrintCompany();
  const [boxId, setBoxId] = useState<number | null>(params.cashboxId ?? null);
  const [counted, setCounted] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState<CloseShiftResult | null>(null);
  /** تسجيل تسوية الفرق تلقائياً كحركة نقدية (FR-04-04 — Task 9-a) */
  const [reconcile, setReconcile] = useState(true);

  const { data: boxesData } = useQuery<BoxesResponse>({
    queryKey: ["cashbox", "boxes"],
    queryFn: () => getJson<BoxesResponse>("/api/cashbox"),
  });

  const activeBoxId = boxId ?? boxesData?.cashboxes?.[0]?.id ?? null;
  const shiftUrl = `/api/cashbox/shift?cashboxId=${activeBoxId ?? 0}`;
  const { data: state, isLoading } = useQuery<ShiftStateDto>({
    queryKey: ["cashbox", "shift", activeBoxId],
    queryFn: () => getJson<ShiftStateDto>(shiftUrl),
    enabled: !!activeBoxId,
  });

  const boxes = boxesData?.cashboxes ?? [];
  const b = state?.breakdown;

  const closeFlow = useMemo(
    () => [
      { label: "مبيعات نقدية", value: b?.cashSales ?? 0, sign: 1 },
      { label: "تحصيلات (سندات/أقساط)", value: b?.collections ?? 0, sign: 1 },
      { label: "سحب بنكي / أخرى", value: b?.otherIn ?? 0, sign: 1 },
      { label: "تحويلات واردة", value: b?.transfersIn ?? 0, sign: 1 },
      { label: "مصاريف", value: b?.expenses ?? 0, sign: -1 },
      { label: "صرف لموردين", value: b?.payments ?? 0, sign: -1 },
      { label: "سحبيات موظفين", value: b?.advances ?? 0, sign: -1 },
      { label: "عمولات مصروفة", value: b?.commissions ?? 0, sign: -1 },
      { label: "رواتب", value: b?.salaries ?? 0, sign: -1 },
      { label: "إيداعات بنكية", value: b?.bankDeposits ?? 0, sign: -1 },
      { label: "تحويلات صادرة", value: b?.transfersOut ?? 0, sign: -1 },
    ].filter((r) => Math.abs(r.value) > 0.005),
    [b]
  );

  const doClose = async () => {
    if (!activeBoxId) return;
    const n = Number(counted);
    if (!(n >= 0)) {
      toast.error("أدخل العدّ الفعلي للنقدية");
      return;
    }
    setClosing(true);
    try {
      const res = await postJson<CloseShiftResult>("/api/cashbox/shift/close", {
        cashboxId: activeBoxId,
        counted: n,
        reconcile,
      });
      setResult(res);
      setConfirmOpen(false);
      setCounted("");
      toast.success("تم إقفال الوردية");
      qc.invalidateQueries({ queryKey: ["cashbox"] });
    } catch {
      /* توست من api.ts */
    } finally {
      setClosing(false);
    }
  };

  const openShift = async () => {
    if (!activeBoxId) return;
    try {
      await postJson("/api/cashbox/shift", { cashboxId: activeBoxId });
      toast.success("تم فتح الوردية بالرصيد الحالي");
      qc.invalidateQueries({ queryKey: ["cashbox", "shift"] });
    } catch {
      /* توست */
    }
  };

  return (
    <div className="flex min-h-full flex-col pb-8">
      <AppHeader
        title="وردية الصندوق"
        action={
          <button
            type="button"
            onClick={() => push("cash-boxes")}
            aria-label="الخزينة"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Wallet className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="scrollbar-slim flex gap-1.5 overflow-x-auto px-3 pb-3">
          {boxes.map((bx) => (
            <button
              key={bx.id}
              type="button"
              onClick={() => setBoxId(bx.id)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                activeBoxId === bx.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground hover:bg-accent/30"
              )}
            >
              {bx.name}
            </button>
          ))}
        </div>
      </AppHeader>

      <div className="flex flex-1 flex-col gap-3 p-3">
        {isLoading ? (
          <p className="py-8 text-center text-[13.5px] text-muted-foreground">جارٍ تحميل الوردية…</p>
        ) : !state ? (
          <EmptyState icon={Wallet} message="اختر صندوقاً" />
        ) : (
          <>
            {/* ─── بطاقة الوردية الحالية ─── */}
            <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[14.5px] font-bold text-foreground">
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      state.openShift ? "bg-[#34D399]/15 text-[#34D399]" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {state.openShift ? <PlayCircle className="size-5" aria-hidden /> : <Clock className="size-5" aria-hidden />}
                  </span>
                  {state.openShift ? "وردية مفتوحة" : "لا وردية مفتوحة"}
                </span>
                {state.openShift && (
                  <span dir="ltr" className="font-num text-[12px] text-muted-foreground">
                    {formatDateTime(state.openShift.openedAt)}
                  </span>
                )}
              </div>

              {state.openShift && (
                <div className="mt-2 flex items-center justify-between rounded-xl bg-primary/8 px-3.5 py-2 text-[12.5px]">
                  <span className="text-muted-foreground">عدّ بداية الوردية</span>
                  <span dir="ltr" className="font-num font-bold text-foreground">
                    {formatAmount(state.openShift.openingCount, { currency: state.currencyCode })}
                  </span>
                </div>
              )}

              <div className="mt-3 flex flex-col items-center gap-1 border-t border-border/50 pt-3">
                <span className="text-[13px] font-medium text-muted-foreground">الرصيد المتوقع حالياً (العدّ النظري)</span>
                <AmountText
                  value={state.expected}
                  currency={state.currencyCode}
                  size="2xl"
                  variant={state.expected >= 0 ? "primary" : "neg"}
                />
              </div>

              {/* تصنيف الحركات */}
              {closeFlow.length > 0 && (
                <div className="mt-3 flex flex-col gap-1 rounded-xl border border-border/50 p-3">
                  <span className="mb-1 text-[12.5px] font-bold text-muted-foreground">
                    حركات الفترة {state.openShift ? "منذ فتح الوردية" : "اليوم"}
                  </span>
                  {closeFlow.map((r) => (
                    <div key={r.label} className="flex items-center justify-between text-[13px]">
                      <span className="text-muted-foreground">{r.label}</span>
                      <AmountText value={r.value} currency={state.currencyCode} size="sm" variant={r.sign > 0 ? "pos" : "neg"} signed />
                    </div>
                  ))}
                </div>
              )}

              {/* أزرار الفتح/الإقفال */}
              <div className="mt-3 flex flex-col gap-2">
                {state.openShift ? (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="counted" className="text-[13px] font-bold text-foreground">
                        العدّ الفعلي للنقدية <span className="text-[#F87171]">*</span>
                      </label>
                      <input
                        id="counted"
                        type="number"
                        inputMode="decimal"
                        dir="ltr"
                        min="0"
                        step="any"
                        value={counted}
                        onChange={(e) => setCounted(e.target.value)}
                        placeholder="0"
                        className="h-12 rounded-xl border border-border bg-background px-3.5 font-num text-[16px] font-bold text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <PrimaryButton variant="danger" onClick={() => setConfirmOpen(true)} disabled={!counted} block>
                      <StopCircle className="me-1.5 size-4" aria-hidden />
                      إقفال الوردية
                    </PrimaryButton>
                  </>
                ) : (
                  <PrimaryButton variant="success" onClick={openShift} block>
                    <PlayCircle className="me-1.5 size-4" aria-hidden />
                    فتح وردية (بالرصيد الحالي)
                  </PrimaryButton>
                )}
              </div>
            </div>

            {/* ─── سجل الورديات ─── */}
            <SectionTitle>
              سجل الورديات المقفلة{" "}
              <span className="font-num text-[12px] font-normal text-muted-foreground">({state.history.length})</span>
            </SectionTitle>
            {state.history.length === 0 ? (
              <EmptyState icon={History} message="لا ورديات مقفلة بعد" hint="أقفل أول وردية ليظهر السجل" />
            ) : (
              <div className="flex flex-col gap-1.5">
                {state.history.map((h) => (
                  <ListRow
                    key={h.id}
                    leading={
                      <span
                        className={cn(
                          "flex size-11 items-center justify-center rounded-xl",
                          Math.abs(h.difference ?? 0) < 0.01
                            ? "bg-[#34D399]/15 text-[#34D399]"
                            : "bg-[#FBBF24]/15 text-[#FBBF24]"
                        )}
                      >
                        {Math.abs(h.difference ?? 0) < 0.01 ? (
                          <CheckCircle2 className="size-5" aria-hidden />
                        ) : (
                          <XCircle className="size-5" aria-hidden />
                        )}
                      </span>
                    }
                    title={
                      <span className="flex flex-col">
                        <span dir="ltr" className="font-num text-[13px] text-foreground">
                          {formatDateTime(h.closedAt)}
                        </span>
                        <span className="text-[12px] text-muted-foreground">
                          متوقع {formatAmount(h.expected ?? 0, { currency: state.currencyCode })} • فعلي{" "}
                          {formatAmount(h.counted ?? 0, { currency: state.currencyCode })}
                        </span>
                      </span>
                    }
                    subtitle={h.notes ?? undefined}
                    trailing={
                      <span className="flex flex-col items-end">
                        <span className="mb-0.5 text-[11px] text-muted-foreground">الفرق</span>
                        <AmountText
                          value={h.difference ?? 0}
                          currency={state.currencyCode}
                          size="md"
                          variant={
                            Math.abs(h.difference ?? 0) < 0.01 ? "pos" : (h.difference ?? 0) > 0 ? "due" : "neg"
                          }
                          signed
                        />
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── تأكيد الإقفال ─── */}
      <PosSheet
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="تأكيد إقفال الوردية"
        description="سيُسجَّل الفرق بين العدّ الفعلي والرصيد المحسوب ولا يمكن تعديله لاحقاً"
      >
        <div className="flex flex-col gap-3">
          {state && (
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3.5">
              <KeyValueRow label="الصندوق" value={state.cashboxName} />
              <KeyValueRow label="المتوقع (محسوب)" value={formatAmount(state.expected, { currency: state.currencyCode })} />
              <KeyValueRow label="العدّ الفعلي" value={formatAmount(Number(counted) || 0, { currency: state.currencyCode })} />
              <KeyValueRow
                label="الفرق المتوقع تسجيله"
                value={formatAmount((Number(counted) || 0) - state.expected, { currency: state.currencyCode })}
              />
            </div>
          )}
          {/* تسوية الفرق آلياً — FR-04-04 */}
          <label
            htmlFor="shift-reconcile"
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-card p-3.5 transition-colors hover:bg-accent/30"
          >
            <Checkbox
              id="shift-reconcile"
              checked={reconcile}
              onCheckedChange={(v) => setReconcile(v === true)}
              className="mt-0.5 size-[18px]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-bold text-foreground">
                تسجيل تسوية الفرق تلقائياً كحركة نقدية
              </span>
              <span className="text-[11.5px] leading-relaxed text-muted-foreground">
                عند وجود فرق بين العدّ الفعلي والرصيد المحسوب تُنشأ حركة نقدية (قبض للزيادة / صرف للعجز)
                تعادل الفرق فيطابق رصيد الصندوق العدّ الفعلي — وتكون محمية من التعديل والحذف اليدوي.
              </span>
            </span>
          </label>
          <div className="flex gap-2">
            <PrimaryButton variant="outline" onClick={() => setConfirmOpen(false)} block>
              رجوع
            </PrimaryButton>
            <PrimaryButton variant="danger" onClick={doClose} loading={closing} block>
              تأكيد الإقفال
            </PrimaryButton>
          </div>
        </div>
      </PosSheet>

      {/* ─── لوحة النتيجة ─── */}
      <PosSheet open={!!result} onOpenChange={(o) => !o && setResult(null)} title="نتيجة إقفال الوردية">
        {result && (
          <div className="flex flex-col gap-3">
            <div
              className={cn(
                "flex flex-col items-center gap-1 rounded-2xl p-4",
                Math.abs(result.difference) < 0.01
                  ? "bg-[#34D399]/10"
                  : result.difference > 0
                    ? "bg-[#FBBF24]/10"
                    : "bg-[#F87171]/10"
              )}
            >
              <span className="text-[13.5px] font-bold text-foreground">
                {Math.abs(result.difference) < 0.01
                  ? "الوردية مطابقة تماماً ✓"
                  : result.difference > 0
                    ? "زيادة في الصندوق (عجز في التسجيل)"
                    : "نقص في الصندوق (عجز نقدي)"}
              </span>
              <AmountText
                value={result.difference}
                currency={result.currencyCode}
                size="2xl"
                variant={
                  Math.abs(result.difference) < 0.01 ? "pos" : result.difference > 0 ? "due" : "neg"
                }
                signed
              />
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3.5">
              <KeyValueRow label="الصندوق" value={result.cashboxName} />
              <KeyValueRow label="المتوقع (محسوب)" value={formatAmount(result.expected, { currency: result.currencyCode })} />
              <KeyValueRow label="العدّ الفعلي" value={formatAmount(result.counted, { currency: result.currencyCode })} />
            </div>
            {result.reconciled && (
              <div
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border p-3",
                  result.difference > 0
                    ? "border-[#FBBF24]/40 bg-[#FBBF24]/10"
                    : "border-[#F87171]/40 bg-[#F87171]/10"
                )}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
                  <BadgeDollarSign
                    className={cn("size-4", result.difference > 0 ? "text-[#FBBF24]" : "text-[#F87171]")}
                    aria-hidden
                  />
                  تم إنشاء حركة تسوية بمبلغ
                </span>
                <AmountText
                  value={Math.abs(result.difference)}
                  currency={result.currencyCode}
                  size="md"
                  variant={result.difference > 0 ? "due" : "neg"}
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => printShiftReport(result, company)}
              className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-[14px] font-bold text-primary active:scale-[0.98]"
            >
              <Printer className="size-4" aria-hidden />
              طباعة تقرير الوردية (80مم)
            </button>
            <PrimaryButton onClick={() => setResult(null)} block>
              تم
            </PrimaryButton>
          </div>
        )}
      </PosSheet>
    </div>
  );
}
