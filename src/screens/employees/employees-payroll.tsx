"use client";

/**
 * مسير الرواتب (FR-07-04): اختيار الشهر → معاينة حية لكل موظف
 * (الأساسي − خصم الغياب − خصم التأخير/النص − السحبيات + مكافآت − خصومات أخرى = الصافي)
 * مع تحرير المكافآت والخصومات وحساب الصافي لحظياً (مرآة domain/payroll.ts)
 * → «توليد المسير» (مسودة) → «صرف المسير» من صندوق (cash_tx salary_batch لكل موظف)
 * → طباعة مسير A4 + سجل المسيرات السابقة (غير قابلة للتعديل FR-07-05).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronRight, ChevronLeft, Wallet, FileSignature, Printer, Lock, Sparkles, History,
} from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, ARABIC_MONTHS } from "@/lib/format";
import {
  AppHeader, AppCard, AmountText, EmptyState, StatusChip, SectionTitle, PrimaryButton,
} from "@/components/ds";
import { Field, DateInput } from "@/components/parties/field";
import { PartySheet } from "@/components/parties/party-sheet";
import { CashboxPicker, useCashboxes } from "@/components/employees/cashbox-picker";
import { printPayrollSheet, type PayrollPrintRow } from "@/components/employees/payroll-print";
import { cn } from "@/lib/utils";

interface CalcLine {
  divisor: number;
  dayValue: number;
  absentDays: number;
  halfDays: number;
  lateDays: number;
  absentDeduction: number;
  halfDeduction: number;
  lateDeduction: number;
  attendanceDeduction: number;
  lateDeductionStored: number;
  bonus: number;
  otherDeduction: number;
  unpaidAdvances: number;
  advancesApplied: number;
  net: number;
}

interface PreviewRow {
  employeeId: number;
  name: string;
  role: string | null;
  salary: number;
  salaryCycle: string;
  calc: CalcLine;
  existingStatus: "draft" | "paid" | null;
}

interface PreviewResponse {
  period: string;
  rows: PreviewRow[];
  totals: { employees: number; gross: number; attendanceDeduction: number; bonus: number; otherDeduction: number; advances: number; net: number };
}

interface HistoryRow {
  id: number;
  employeeId: number;
  employeeName: string;
  role: string | null;
  baseSalary: number;
  absentDays: number;
  lateDeduction: number;
  bonus: number;
  otherDeduction: number;
  advancesDeducted: number;
  netSalary: number;
  status: string;
  paidAt: string | null;
}

interface HistoryPeriodsResponse {
  periods: Array<{ period: string; employees: number; net: number; status: "draft" | "paid" | "mixed" }>;
}

function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${ARABIC_MONTHS[m - 1] ?? m} ${y}`;
}

function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** مرآة حسابية لصيغة الصافي (المصدر: domain/payroll.ts calcPayrollLine) */
function mirrorLine(base: number, attendanceDeduction: number, bonus: number, other: number, unpaid: number) {
  const preNet = base - attendanceDeduction + bonus - other;
  const applied = Math.min(Math.max(0, unpaid), Math.max(0, preNet));
  return { net: Math.max(0, Math.round((preNet - applied) * 100) / 100), applied: Math.round(applied * 100) / 100 };
}

export default function EmployeesPayrollScreen() {
  const qc = useQueryClient();
  const current = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const [period, setPeriod] = useState(current);
  const [lines, setLines] = useState<Record<number, { bonus: string; other: string }>>({});
  const [initedFor, setInitedFor] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [commitOpen, setCommitOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [cashboxId, setCashboxId] = useState<number | null>(null);
  const [rate, setRate] = useState(1);
  const [txDate, setTxDate] = useState(today);
  const [successData, setSuccessData] = useState<{ total: number; count: number } | null>(null);
  const [detailsPeriod, setDetailsPeriod] = useState<string | null>(null);

  const { data: boot } = useCashboxes();
  const { data: preview, isLoading } = useQuery<PreviewResponse>({
    queryKey: ["payroll", "preview", period],
    queryFn: () => getJson<PreviewResponse>(`/api/payroll/preview?period=${period}`),
  });
  const { data: history } = useQuery<HistoryPeriodsResponse>({
    queryKey: ["payroll", "periods"],
    queryFn: () => getJson<HistoryPeriodsResponse>("/api/payroll"),
  });
  const { data: periodRows } = useQuery<{ rows: HistoryRow[] }>({
    queryKey: ["payroll", "history", detailsPeriod],
    queryFn: () => getJson<{ rows: HistoryRow[] }>(`/api/payroll?period=${detailsPeriod}`),
    enabled: Boolean(detailsPeriod),
  });

  const rows = preview?.rows ?? [];
  const editableRows = rows.filter((r) => r.existingStatus !== "paid");
  const paidCount = rows.length - editableRows.length;

  // تهيئة حقول التحرير من المعاينة (مرة لكل فترة)
  if (preview && initedFor !== `${period}-${preview.rows.length}`) {
    const next: Record<number, { bonus: string; other: string }> = {};
    for (const r of rows) next[r.employeeId] = { bonus: String(r.calc.bonus ?? 0), other: String(r.calc.otherDeduction ?? 0) };
    setLines(next);
    setInitedFor(`${period}-${preview.rows.length}`);
  }

  const view = useMemo(() => {
    return rows.map((r) => {
      const bonus = Number(lines[r.employeeId]?.bonus ?? 0) || 0;
      const other = Number(lines[r.employeeId]?.other ?? 0) || 0;
      const m = mirrorLine(r.salary, r.calc.attendanceDeduction, bonus, other, r.calc.unpaidAdvances);
      return { row: r, bonus, other, net: m.net, applied: m.applied };
    });
  }, [rows, lines]);

  const totals = useMemo(() => {
    let net = 0, bonus = 0, other = 0, adv = 0, gross = 0;
    for (const v of view) {
      net += v.net; bonus += v.bonus; other += v.other; adv += v.applied; gross += v.row.salary;
    }
    return { net: Math.round(net), bonus: Math.round(bonus), other: Math.round(other), adv: Math.round(adv), gross };
  }, [view]);

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await postJson<{ totals: { net: number } }>("/api/payroll/generate", {
        period,
        lines: view.map((v) => ({
          employeeId: v.row.employeeId,
          bonus: v.bonus,
          otherDeduction: v.other,
        })),
      });
      toast.success(`تم توليد مسيرة ${periodLabel(period)} — الصافي ${formatAmount(res.totals.net)} ر.ي (مسودة)`);
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    } catch {
      /* toast عبر api.ts */
    } finally {
      setGenerating(false);
    }
  };

  const commit = async () => {
    if (!cashboxId) {
      toast.error("اختر صندوق صرف الرواتب");
      return;
    }
    setCommitting(true);
    try {
      const res = await postJson<{ paid: number; totalNet: number; cashbox: { name: string } }>(
        "/api/payroll/commit",
        {
          period,
          lines: view.map((v) => ({
            employeeId: v.row.employeeId,
            bonus: v.bonus,
            otherDeduction: v.other,
          })),
          cashboxId,
          txDate,
        }
      );
      toast.success(`تم صرف رواتب ${periodLabel(period)} — ${formatAmount(res.totalNet)} ر.ي من «${res.cashbox.name}»`);
      setCommitOpen(false);
      setSuccessData({ total: res.totalNet, count: res.paid });
      qc.invalidateQueries({ queryKey: ["payroll"] });
      qc.invalidateQueries({ queryKey: ["advances"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch {
      /* toast عبر api.ts */
    } finally {
      setCommitting(false);
    }
  };

  const printCurrent = () => {
    const printRows: PayrollPrintRow[] = view.map((v) => ({
      employeeName: v.row.name,
      role: v.row.role,
      baseSalary: v.row.salary,
      absentDays: v.row.calc.absentDays,
      absentDeduction: v.row.calc.absentDeduction,
      lateDeduction: v.row.calc.lateDeductionStored,
      bonus: v.bonus,
      otherDeduction: v.other,
      advancesDeducted: v.applied,
      net: v.net,
    }));
    printPayrollSheet(period, printRows, {
      company: { name: boot?.company?.name ?? "—", phone: boot?.company?.phone },
      cashboxName: boot?.cashboxes?.find((b) => b.id === cashboxId)?.name ?? "—",
      txDate,
    });
  };

  const printStored = (p: string, stored: HistoryRow[]) => {
    const printRows: PayrollPrintRow[] = stored.map((r) => ({
      employeeName: r.employeeName,
      role: r.role,
      baseSalary: r.baseSalary,
      absentDays: r.absentDays,
      absentDeduction: Math.round(r.absentDays * (r.baseSalary / 30)),
      lateDeduction: r.lateDeduction,
      bonus: r.bonus,
      otherDeduction: r.otherDeduction,
      advancesDeducted: r.advancesDeducted,
      net: r.netSalary,
    }));
    printPayrollSheet(p, printRows, {
      company: { name: boot?.company?.name ?? "—", phone: boot?.company?.phone },
      cashboxName: "—",
      txDate: stored[0]?.paidAt ?? today,
    });
  };

  const periods = (history?.periods ?? []).filter((p) => p.period !== period);

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="مسير الرواتب">
        <div className="flex flex-col gap-2 px-3 pb-3">
          {/* اختيار الشهر */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPeriod(shiftPeriod(period, 1))}
              aria-label="الشهر التالي"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-accent/30 active:scale-95"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <input
              type="month"
              value={period}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
              aria-label="شهر المسير"
              className="font-num h-11 flex-1 rounded-xl border border-border bg-muted/60 px-3 text-center text-[15px] font-bold text-foreground outline-none focus:border-primary/70"
            />
            <button
              type="button"
              onClick={() => setPeriod(shiftPeriod(period, -1))}
              aria-label="الشهر السابق"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-accent/30 active:scale-95"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
          </div>
          <p className="text-center text-[12.5px] text-muted-foreground">
            {periodLabel(period)} — الأساسي − الغياب − التأخير − السحبيات + المكافآت = الصافي
          </p>
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ حساب معاينة المسير…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            message="لا موظفون نشطون"
            hint="سجّل موظفاً أولاً من شاشة الموظفين"
            className="py-12"
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {/* بطاقة موظف */}
            {view.map((v) => {
              const r = v.row;
              const paid = r.existingStatus === "paid";
              return (
                <AppCard key={r.employeeId} className={cn("flex flex-col gap-2", paid && "opacity-80")}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold">{r.name}</p>
                      {r.role && <p className="text-[12px] text-muted-foreground">{r.role}</p>}
                    </div>
                    {paid ? (
                      <StatusChip status="paid" label="مصروف" />
                    ) : r.existingStatus === "draft" ? (
                      <StatusChip status="draft" label="مسودة" />
                    ) : (
                      <StatusChip status="pending" label="غير مولّد" />
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 rounded-xl bg-muted/40 p-2.5 text-[12px]">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">الأساسي</span>
                      <AmountText value={r.salary} currency="YER" size="sm" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">غياب ({r.calc.absentDays + r.calc.halfDays * 0.5} يوم)</span>
                      <AmountText value={-(r.calc.absentDeduction + r.calc.halfDeduction)} currency="YER" size="sm" variant="neg" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">تأخير ({r.calc.lateDays} يوم)</span>
                      <AmountText value={-r.calc.lateDeduction} currency="YER" size="sm" variant="neg" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-muted-foreground">سحبيات</span>
                      <AmountText value={-v.applied} currency="YER" size="sm" variant="neg" />
                    </div>
                    <div className="col-span-2 flex flex-col items-end">
                      <span className="text-muted-foreground">الصافي المستحق</span>
                      <AmountText value={v.net} currency="YER" size="md" variant="primary" />
                    </div>
                  </div>

                  {/* تحرير المكافآت والخصومات */}
                  {paid ? (
                    <p className="flex items-center gap-1 text-[11.5px] text-muted-foreground">
                      <Lock className="size-3" aria-hidden /> مسير مصروف — سجل غير قابل للتعديل
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1">
                        <span className="text-[12px] text-[#34D399]">مكافآت +</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={lines[r.employeeId]?.bonus ?? "0"}
                          onChange={(e) =>
                            setLines((prev) => ({
                              ...prev,
                              [r.employeeId]: { bonus: e.target.value, other: prev[r.employeeId]?.other ?? "0" },
                            }))
                          }
                          className="font-num h-11 rounded-xl border border-[#34D399]/30 bg-[#34D399]/5 px-3 text-[14px] outline-none focus:border-[#34D399]/70"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-[12px] text-[#F87171]">خصومات أخرى −</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={lines[r.employeeId]?.other ?? "0"}
                          onChange={(e) =>
                            setLines((prev) => ({
                              ...prev,
                              [r.employeeId]: { bonus: prev[r.employeeId]?.bonus ?? "0", other: e.target.value },
                            }))
                          }
                          className="font-num h-11 rounded-xl border border-[#F87171]/30 bg-[#F87171]/5 px-3 text-[14px] outline-none focus:border-[#F87171]/70"
                        />
                      </label>
                    </div>
                  )}
                </AppCard>
              );
            })}

            {/* الإجماليات */}
            <AppCard className="flex flex-col gap-1.5">
              <SectionTitle>إجماليات {periodLabel(period)}</SectionTitle>
              {[
                ["عدد الموظفين", formatAmount(rows.length, { decimals: 0 })],
                ["إجمالي الرواتب الأساسية", formatAmount(totals.gross)],
                ["إجمالي المكافآت", formatAmount(totals.bonus)],
                ["إجمالي خصومات أخرى", formatAmount(totals.other)],
                ["إجمالي السحبيات المخصومة", formatAmount(totals.adv)],
              ].map(([k, val]) => (
                <div key={k} className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-num font-bold">{val}</span>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between border-t border-border/60 pt-2">
                <span className="text-[14px] font-bold">الصافي الإجمالي</span>
                <AmountText value={totals.net} currency="YER" size="lg" variant="primary" />
              </div>
            </AppCard>

            {/* أزرار المسير */}
            <div className="flex gap-2">
              <PrimaryButton
                variant="outline"
                className="flex-1 gap-1.5"
                loading={generating}
                disabled={editableRows.length === 0}
                onClick={generate}
              >
                <FileSignature className="size-4" aria-hidden />
                توليد المسير
              </PrimaryButton>
              <PrimaryButton
                variant="success"
                className="flex-[1.4] gap-1.5"
                disabled={editableRows.length === 0}
                onClick={() => setCommitOpen(true)}
              >
                <Sparkles className="size-4" aria-hidden />
                صرف المسير
              </PrimaryButton>
            </div>
            {paidCount > 0 && (
              <p className="text-center text-[12px] text-muted-foreground">
                {paidCount} موظفاً مصروف راتبه لهذا الشهر مسبقاً (سجل ثابت)
              </p>
            )}

            {/* سجل المسيرات السابقة */}
            {periods.length > 0 && (
              <AppCard noPad>
                <div className="p-4 pb-1">
                  <SectionTitle>مسيرات سابقة</SectionTitle>
                </div>
                <div className="scrollbar-slim max-h-80 overflow-y-auto">
                  {periods.map((p) => (
                    <button
                      key={p.period}
                      type="button"
                      onClick={() => setDetailsPeriod(p.period)}
                      className="flex min-h-16 w-full items-center gap-2 border-b border-border/40 px-4 text-start last:border-0 hover:bg-accent/30"
                    >
                      <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[14.5px] font-medium">{periodLabel(p.period)}</span>
                          <StatusChip
                            status={p.status === "paid" ? "paid" : p.status === "draft" ? "draft" : "partial"}
                            label={p.status === "paid" ? "مصروف" : p.status === "draft" ? "مسودة" : "جزئي"}
                          />
                        </span>
                        <span className="font-num block text-[12px] text-muted-foreground">{p.employees} موظفاً</span>
                      </span>
                      <AmountText value={p.net} currency="YER" size="md" variant="primary" />
                    </button>
                  ))}
                </div>
              </AppCard>
            )}
          </div>
        )}
      </div>

      {/* لوحة صرف المسير */}
      <PartySheet
        open={commitOpen}
        onOpenChange={setCommitOpen}
        title={`صرف مسير ${periodLabel(period)}`}
        description={`${editableRows.length} موظفاً — الصافي ${formatAmount(totals.net)} ر.ي`}
        footer={
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">سيُخصم من الصندوق</span>
              <AmountText value={totals.net} currency="YER" size="md" variant="neg" />
            </div>
            <PrimaryButton variant="success" block loading={committing} onClick={commit}>
              تأكيد الصرف من الصندوق
            </PrimaryButton>
          </div>
        }
      >
        <div className="flex flex-col gap-3.5">
          <CashboxPicker cashboxId={cashboxId} onChange={setCashboxId} rate={rate} onRateChange={setRate} />
          <Field label="تاريخ الصرف">
            <DateInput value={txDate} onChange={setTxDate} />
          </Field>
          <p className="text-[12px] text-muted-foreground">
            ينشئ حركة «رواتب مصروفة» لكل موظف (salary_batch) ويعتمد المسير نهائياً — لا يمكن التعديل بعد الصرف
            (سجل الرواتب غير قابل للتعديل).
          </p>
        </div>
      </PartySheet>

      {/* لوحة النجاح بعد الصرف */}
      <PartySheet
        open={Boolean(successData)}
        onOpenChange={(o) => !o && setSuccessData(null)}
        title={`تم صرف مسير ${periodLabel(period)} ✓`}
        description={`${successData?.count ?? 0} موظفاً من الصندوق`}
        footer={
          <div className="flex gap-2">
            <PrimaryButton variant="outline" className="flex-1" onClick={() => setSuccessData(null)}>
              تم
            </PrimaryButton>
            <PrimaryButton className="flex-1 gap-1.5" onClick={printCurrent}>
              <Printer className="size-4" aria-hidden />
              طباعة المسير
            </PrimaryButton>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-2 py-4">
          <span className="text-[13px] text-muted-foreground">إجمالي المصروف</span>
          <AmountText value={successData?.total ?? 0} currency="YER" size="2xl" variant="neg" />
        </div>
      </PartySheet>

      {/* تفاصيل مسير سابق */}
      <PartySheet
        open={Boolean(detailsPeriod)}
        onOpenChange={(o) => !o && setDetailsPeriod(null)}
        title={detailsPeriod ? `مسير ${periodLabel(detailsPeriod)}` : ""}
        description="سجل ثابت — غير قابل للتعديل"
        footer={
          periodRows?.rows?.length ? (
            <PrimaryButton
              variant="outline"
              block
              className="gap-1.5"
              onClick={() => printStored(detailsPeriod!, periodRows.rows)}
            >
              <Printer className="size-4" aria-hidden />
              طباعة المسير
            </PrimaryButton>
          ) : undefined
        }
      >
        {(periodRows?.rows ?? []).map((r) => (
          <div key={r.id} className="flex min-h-14 items-center gap-2 border-b border-border/40 last:border-0">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[14.5px] font-medium">{r.employeeName}</span>
                <StatusChip status={r.status === "paid" ? "paid" : "draft"} label={r.status === "paid" ? "مسدد" : "مسودة"} />
              </span>
              <span className="font-num block text-[12px] text-muted-foreground">
                غياب {r.absentDays} — تأخير/نص {formatAmount(r.lateDeduction, { decimals: 0 })}
                {r.advancesDeducted > 0 ? ` — سحبيات ${formatAmount(r.advancesDeducted, { decimals: 0 })}` : ""}
                {r.bonus > 0 ? ` — مكافأة ${formatAmount(r.bonus, { decimals: 0 })}` : ""}
              </span>
            </span>
            <AmountText value={r.netSalary} currency="YER" size="md" variant="primary" />
          </div>
        ))}
      </PartySheet>
    </div>
  );
}
