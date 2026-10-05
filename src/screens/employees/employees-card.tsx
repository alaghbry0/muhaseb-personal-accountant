"use client";

/**
 * بطاقة الموظف (الوحدة 07): رأس + بطاقة الراتب + إجراءات سريعة
 * (حضور اليوم/سحبية جديدة/مسير الرواتب/تعديل)
 * + حضور هذا الشهر (تقويم مصغّر ملون + ملخص وخصم مقدّر)
 * + آخر السحبيات + مسيرات الرواتب (مسودة/مسدد).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarCheck2, HandCoins, Wallet, Pencil, Phone, CalendarDays,
} from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDate, ARABIC_MONTHS, ARABIC_DAYS } from "@/lib/format";
import { useNav } from "@/lib/nav";
import {
  AppHeader, AppCard, AmountText, EmptyState, SectionTitle, StatusChip, PrimaryButton,
} from "@/components/ds";
import { EmployeeForm } from "@/components/employees/employee-form";
import { AdvanceForm } from "@/components/employees/advance-form";
import { cn } from "@/lib/utils";

interface EmployeeFileResponse {
  employee: {
    id: number;
    name: string;
    phone: string | null;
    role: string | null;
    salary: number;
    salaryCycle: "monthly" | "weekly" | "daily";
    hiredAt: string | null;
    isArchived: boolean;
  };
  month: string;
  attendance: Array<{ id: number; day: string; status: string; lateMinutes: number; notes: string | null }>;
  advances: Array<{
    id: number;
    txDate: string;
    amount: number;
    exchangeRate: number;
    currency: { code: string };
    description: string | null;
  }>;
  salaryPeriods: Array<{
    id: number;
    period: string;
    baseSalary: number;
    absentDays: number;
    lateDeduction: number;
    bonus: number;
    otherDeduction: number;
    advancesDeducted: number;
    netSalary: number;
    status: string;
    paidAt: string | null;
  }>;
  unpaidAdvancesBase: number;
}

const CYCLE_LABELS: Record<string, string> = { monthly: "شهري", weekly: "أسبوعي", daily: "يومي" };
const STATUS_COLORS: Record<string, { bg: string; label: string; dot: string }> = {
  present: { bg: "bg-[#34D399]/80", label: "حاضر", dot: "#34D399" },
  absent: { bg: "bg-[#F87171]/80", label: "غائب", dot: "#F87171" },
  late: { bg: "bg-[#FBBF24]/80", label: "تأخير", dot: "#FBBF24" },
  leave: { bg: "bg-[#38BDF8]/80", label: "إجازة", dot: "#38BDF8" },
  half: { bg: "bg-[#22D3EE]/70", label: "نص يوم", dot: "#22D3EE" },
};

function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${ARABIC_MONTHS[m - 1] ?? m} ${y}`;
}

export default function EmployeesCardScreen({ employeeId }: { employeeId?: number }) {
  const { push } = useNav();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);

  const { data, isLoading } = useQuery<EmployeeFileResponse>({
    queryKey: ["employees", "file", employeeId],
    queryFn: () => getJson<EmployeeFileResponse>(`/api/employees/${employeeId}`),
    enabled: Boolean(employeeId),
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader title="بطاقة الموظف" />
        <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الملف…</p>
      </div>
    );
  }

  const { employee, attendance, advances, salaryPeriods, unpaidAdvancesBase } = data;
  const [year, month] = data.month.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=الأحد
  const byDay = new Map(attendance.map((a) => [Number(a.day.slice(8)), a]));

  const counts = { present: 0, absent: 0, late: 0, leave: 0, half: 0 };
  for (const a of attendance) {
    if (counts[a.status as keyof typeof counts] !== undefined) counts[a.status as keyof typeof counts] += 1;
  }
  // مرآة حسابية لخصم الحضور (المصدر: domain/payroll.ts)
  const divisor = employee.salaryCycle === "weekly" ? 7 : employee.salaryCycle === "daily" ? 1 : 30;
  const dayValue = employee.salary / divisor;
  const lateDays = attendance.reduce(
    (s, a) => s + Math.min(1, Math.round(((a.lateMinutes / 60) * 0.5) * 4) / 4),
    0
  );
  const estimatedDeduction =
    counts.absent * dayValue + counts.half * 0.5 * dayValue + lateDays * dayValue;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title={employee.name} />

      <div className="flex-1 px-3 py-3">
        <div className="flex flex-col gap-3">
          {/* رأس الملف */}
          <AppCard className="flex items-center gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#FBBF24]/15 text-xl font-bold text-[#FBBF24]">
              {employee.name.trim().charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[17px] font-bold">{employee.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                {employee.role && <StatusChip status="active" label={employee.role} />}
                {employee.phone && (
                  <a href={`tel:${employee.phone}`} dir="ltr" className="flex items-center gap-1 font-num hover:text-primary">
                    <Phone className="size-3" aria-hidden />
                    {employee.phone}
                  </a>
                )}
                {employee.hiredAt && (
                  <span className="flex items-center gap-1">
                    <CalendarDays className="size-3" aria-hidden />
                    تعيين {formatDate(employee.hiredAt)}
                  </span>
                )}
              </div>
            </div>
          </AppCard>

          {/* بطاقة الراتب */}
          <AppCard className="flex flex-col gap-2">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[12.5px] text-muted-foreground">الراتب الأساسي ({CYCLE_LABELS[employee.salaryCycle]})</p>
                <AmountText value={employee.salary} currency="YER" size="xl" variant="primary" />
              </div>
              <div className="text-end">
                <p className="text-[12.5px] text-muted-foreground">قيمة اليوم المقدّرة</p>
                <AmountText value={Math.round(dayValue)} currency="YER" size="md" />
              </div>
            </div>
            {unpaidAdvancesBase > 0.005 && (
              <div className="rounded-xl border border-[#FBBF24]/30 bg-[#FBBF24]/10 px-3 py-2 text-[12.5px]">
                سحبيات غير مخصومة: <AmountText value={unpaidAdvancesBase} currency="YER" size="sm" variant="due" /> — ستُخصم من مسير{" "}
                {periodLabel(data.month)}
              </div>
            )}
          </AppCard>

          {/* الإجراءات السريعة */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { icon: CalendarCheck2, label: "تسجيل حضور اليوم", color: "#34D399", onClick: () => push("employees-attendance") },
              { icon: HandCoins, label: "سحبية جديدة", color: "#F87171", onClick: () => setAdvanceOpen(true) },
              { icon: Wallet, label: "مسير الرواتب", color: "#22D3EE", onClick: () => push("employees-payroll") },
              { icon: Pencil, label: "تعديل", color: "#94A3B8", onClick: () => setFormOpen(true) },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-card px-1 py-2 text-[11.5px] font-bold text-muted-foreground transition-colors hover:bg-accent/30 active:scale-95"
              >
                <a.icon className="size-5" style={{ color: a.color }} aria-hidden />
                <span className="text-center leading-tight">{a.label}</span>
              </button>
            ))}
          </div>

          {/* حضور هذا الشهر */}
          <AppCard noPad>
            <div className="flex items-center justify-between p-4 pb-2">
              <SectionTitle>حضور {periodLabel(data.month)}</SectionTitle>
              <span className="font-num text-[12px] text-muted-foreground">{attendance.length}/{daysInMonth} يوم مسجل</span>
            </div>
            <div className="px-4 pb-4">
              {attendance.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck2}
                  message="لا حضور مسجل هذا الشهر"
                  hint="سجّل الحضور من شاشة «الحضور اليومي»"
                  className="py-5"
                />
              ) : (
                <>
                  <div className="grid grid-cols-7 gap-1" dir="rtl">
                    {ARABIC_DAYS.map((d) => (
                      <span key={d} className="pb-1 text-center text-[10.5px] text-muted-foreground">
                        {d.slice(0, 3)}
                      </span>
                    ))}
                    {Array.from({ length: firstWeekday }).map((_, i) => (
                      <span key={`blank-${i}`} />
                    ))}
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                      const rec = byDay.get(day);
                      const color = rec ? STATUS_COLORS[rec.status] : null;
                      return (
                        <span
                          key={day}
                          title={rec ? `${STATUS_COLORS[rec.status].label}${rec.status === "late" ? ` (${rec.lateMinutes} دقيقة)` : ""}` : "غير مسجل"}
                          className={cn(
                            "font-num flex h-7 items-center justify-center rounded-md text-[11px] font-bold",
                            color ? `${color.bg} text-[#0F172A]` : "border border-border/60 text-muted-foreground"
                          )}
                        >
                          {day}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.entries(STATUS_COLORS).map(([key, c]) => (
                      <span key={key} className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-[11.5px] text-muted-foreground">
                        <span className="size-2 rounded-full" style={{ background: c.dot }} aria-hidden />
                        {c.label} <span className="font-num font-bold">{counts[key as keyof typeof counts]}</span>
                      </span>
                    ))}
                    {estimatedDeduction > 0.005 && (
                      <span className="rounded-full border border-[#F87171]/30 bg-[#F87171]/10 px-2.5 py-1 text-[11.5px] text-[#F87171]">
                        خصم حضور مقدّر <span className="font-num font-bold">{formatAmount(estimatedDeduction, { decimals: 0 })}</span> ر.ي
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </AppCard>

          {/* آخر السحبيات */}
          <AppCard noPad>
            <div className="flex items-center justify-between p-4 pb-1">
              <SectionTitle>آخر السحبيات</SectionTitle>
              <button
                type="button"
                onClick={() => push("employees-advances")}
                className="text-[12.5px] font-bold text-primary hover:underline"
              >
                عرض الكل
              </button>
            </div>
            {advances.length === 0 ? (
              <EmptyState message="لا سحبيات" hint="«سحبية جديدة» لصرف سلفة تُخصم من الراتب" className="py-5" />
            ) : (
              advances.map((a) => (
                <div key={a.id} className="flex min-h-14 items-center gap-2 border-b border-border/40 px-4 last:border-0">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px]">{a.description || "سحبية من الراتب"}</span>
                    <span className="font-num block text-[12px] text-muted-foreground">
                      {formatDate(a.txDate)} — {a.currency.code === "YER" ? "ر.ي" : a.currency.code}
                    </span>
                  </span>
                  <AmountText value={a.amount} currency={a.currency.code} size="sm" variant="neg" />
                </div>
              ))
            )}
          </AppCard>

          {/* مسيرات الرواتب */}
          <AppCard noPad>
            <div className="flex items-center justify-between p-4 pb-1">
              <SectionTitle>مسيرات الرواتب</SectionTitle>
              <button
                type="button"
                onClick={() => push("employees-payroll")}
                className="text-[12.5px] font-bold text-primary hover:underline"
              >
                مسير الشهر
              </button>
            </div>
            {salaryPeriods.length === 0 ? (
              <EmptyState message="لا مسيرات رواتب" hint="يُولَّد مسير الرواتب من شاشة «مسير الرواتب»" className="py-5" />
            ) : (
              <div className="scrollbar-slim max-h-72 overflow-y-auto">
                {salaryPeriods.map((p) => (
                  <div key={p.id} className="flex min-h-16 items-center gap-2 border-b border-border/40 px-4 last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[14.5px] font-medium">{periodLabel(p.period)}</span>
                        <StatusChip status={p.status === "paid" ? "paid" : "draft"} label={p.status === "paid" ? "مسدد" : "مسودة"} />
                      </span>
                      <span className="font-num block text-[12px] text-muted-foreground">
                        أساسي {formatAmount(p.baseSalary, { decimals: 0 })}
                        {" — "}خصومات {formatAmount(p.absentDays * (p.baseSalary / 30) + p.lateDeduction + p.otherDeduction, { decimals: 0 })}
                        {p.bonus > 0 ? ` — مكافأة ${formatAmount(p.bonus, { decimals: 0 })}` : ""}
                        {p.advancesDeducted > 0 ? ` — سحبيات ${formatAmount(p.advancesDeducted, { decimals: 0 })}` : ""}
                      </span>
                    </span>
                    <AmountText value={p.netSalary} currency="YER" size="md" variant="primary" />
                  </div>
                ))}
              </div>
            )}
          </AppCard>

          <PrimaryButton variant="outline" block onClick={() => push("employees-attendance")} className="mt-1">
            <CalendarCheck2 className="size-4" aria-hidden />
            شاشة الحضور اليومي (حصّة يومية)
          </PrimaryButton>
        </div>
      </div>

      <EmployeeForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={{
          id: employee.id,
          name: employee.name,
          phone: employee.phone,
          role: employee.role,
          salary: employee.salary,
          salaryCycle: employee.salaryCycle,
          hiredAt: employee.hiredAt,
          isArchived: employee.isArchived,
        }}
        onSaved={() => qc.invalidateQueries({ queryKey: ["employees", "file", employeeId] })}
      />
      <AdvanceForm
        open={advanceOpen}
        onOpenChange={setAdvanceOpen}
        fixedEmployeeId={employee.id}
        fixedEmployeeName={employee.name}
        onSaved={() => qc.invalidateQueries({ queryKey: ["employees", "file", employeeId] })}
      />
    </div>
  );
}
