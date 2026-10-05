"use client";

/**
 * الحضور اليومي — «حصّة يومية» (FR-07-02): اختيار اليوم + صف لكل موظف
 * بخمسة أزرار حالة ملونة (حاضر/غائب/إجازة/تأخير/نص يوم) + دقائق التأخير
 * + «حفظ الكل» دفعة واحدة + ملخص اليوم.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck2, ChevronRight, ChevronLeft, Save } from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { dayName } from "@/lib/format";
import { toast } from "sonner";
import {
  AppHeader, AppCard, EmptyState, PrimaryButton,
} from "@/components/ds";
import { cn } from "@/lib/utils";

type Status = "present" | "absent" | "leave" | "late" | "half";

interface AttendanceResponse {
  day: string;
  rows: Array<{
    employeeId: number;
    name: string;
    role: string | null;
    status: Status | null;
    lateMinutes: number;
    notes: string | null;
  }>;
  summary: { present: number; absent: number; leave: number; late: number; half: number; marked: number };
  employeesCount: number;
}

const STATUS_OPTIONS: Array<{ id: Status; label: string; active: string }> = [
  { id: "present", label: "حاضر", active: "border-[#34D399]/70 bg-[#34D399]/20 text-[#34D399]" },
  { id: "absent", label: "غائب", active: "border-[#F87171]/70 bg-[#F87171]/20 text-[#F87171]" },
  { id: "leave", label: "إجازة", active: "border-[#38BDF8]/70 bg-[#38BDF8]/20 text-[#38BDF8]" },
  { id: "late", label: "تأخير", active: "border-[#FBBF24]/70 bg-[#FBBF24]/20 text-[#FBBF24]" },
  { id: "half", label: "نص يوم", active: "border-[#22D3EE]/70 bg-[#22D3EE]/20 text-[#22D3EE]" },
];

const SUMMARY_CHIPS: Array<{ key: keyof AttendanceResponse["summary"]; label: string; cls: string }> = [
  { key: "present", label: "حاضر", cls: "border-[#34D399]/40 bg-[#34D399]/10 text-[#34D399]" },
  { key: "absent", label: "غائب", cls: "border-[#F87171]/40 bg-[#F87171]/10 text-[#F87171]" },
  { key: "late", label: "تأخير", cls: "border-[#FBBF24]/40 bg-[#FBBF24]/10 text-[#FBBF24]" },
  { key: "leave", label: "إجازة", cls: "border-[#38BDF8]/40 bg-[#38BDF8]/10 text-[#38BDF8]" },
  { key: "half", label: "نص يوم", cls: "border-[#22D3EE]/40 bg-[#22D3EE]/10 text-[#22D3EE]" },
];

function shiftDay(day: string, delta: number): string {
  const d = new Date(day);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export default function EmployeesAttendanceScreen() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [day, setDay] = useState(today);
  /** حالات محررة محلياً قبل الحفظ: employeeId → {status, lateMinutes} */
  const [draft, setDraft] = useState<Record<number, { status: Status; lateMinutes: number }>>({});
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery<AttendanceResponse>({
    queryKey: ["employees", "attendance", day],
    queryFn: () => getJson<AttendanceResponse>(`/api/attendance?day=${day}`),
  });

  const rows = data?.rows ?? [];
  const draftCount = useMemo(() => Object.keys(draft).length, [draft]);

  const current = (r: AttendanceResponse["rows"][number]) =>
    draft[r.employeeId] ?? (r.status ? { status: r.status, lateMinutes: r.lateMinutes } : null);

  const setStatus = (employeeId: number, status: Status) => {
    setDraft((prev) => ({
      ...prev,
      [employeeId]: { status, lateMinutes: prev[employeeId]?.lateMinutes ?? (status === "late" ? 15 : 0) },
    }));
  };

  const setLateMinutes = (employeeId: number, minutes: number) => {
    setDraft((prev) => ({
      ...prev,
      [employeeId]: { status: "late", lateMinutes: Math.max(0, Math.round(minutes)) },
    }));
  };

  const saveAll = async () => {
    if (draftCount === 0) {
      toast.error("لا تغييرات للحفظ — اختر حالة لكل موظف");
      return;
    }
    const invalidLate = Object.values(draft).find((d) => d.status === "late" && d.lateMinutes <= 0);
    if (invalidLate) {
      toast.error("أدخل دقائق التأخير (أكبر من صفر) لكل موظف متأخر");
      return;
    }
    setSaving(true);
    try {
      const res = await postJson<{ saved: number }>("/api/attendance", {
        day,
        entries: Object.entries(draft).map(([employeeId, v]) => ({
          employeeId: Number(employeeId),
          status: v.status,
          lateMinutes: v.lateMinutes,
        })),
      });
      toast.success(`تم حفظ حضور ${res.saved} موظفاً — ${dayName(day)}`);
      setDraft({});
      qc.invalidateQueries({ queryKey: ["employees", "attendance", day] });
      qc.invalidateQueries({ queryKey: ["employees", "file"] });
      qc.invalidateQueries({ queryKey: ["payroll"] });
    } catch {
      /* toast عبر api.ts */
    } finally {
      setSaving(false);
    }
  };

  const summary = data?.summary;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="الحضور اليومي">
        <div className="flex flex-col gap-2 px-3 pb-3">
          {/* اختيار اليوم */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDay(shiftDay(day, -1))}
              aria-label="اليوم السابق"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-accent/30 active:scale-95"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
            <input
              type="date"
              value={day}
              onChange={(e) => setDay(e.target.value || today)}
              aria-label="تاريخ الحضور"
              className="font-num h-11 flex-1 rounded-xl border border-border bg-muted/60 px-3 text-center text-[15px] text-foreground outline-none focus:border-primary/70"
            />
            <button
              type="button"
              onClick={() => setDay(shiftDay(day, 1))}
              aria-label="اليوم التالي"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-accent/30 active:scale-95"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
          </div>
          <p className="text-center text-[13px] text-muted-foreground">
            {dayName(day)} — حصّة يومية {day === today ? "(اليوم)" : ""}
          </p>

          {/* ملخص اليوم */}
          {summary && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {SUMMARY_CHIPS.map((c) => (
                <span key={c.key} className={cn("rounded-full border px-3 py-1 text-[12px] font-bold", c.cls)}>
                  {c.label} <span className="font-num">{summary[c.key]}</span>
                </span>
              ))}
              <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[12px] text-muted-foreground">
                مسجّل <span className="font-num font-bold">{summary.marked}</span>/{data?.employeesCount ?? 0}
              </span>
            </div>
          )}
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل حصّة اليوم…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CalendarCheck2}
            message="لا موظفون نشطون"
            hint="سجّل موظفاً أولاً من شاشة الموظفين"
            className="py-12"
          />
        ) : (
          <div className="flex flex-col gap-2 pb-4">
            {rows.map((r) => {
              const cur = current(r);
              return (
                <AppCard key={r.employeeId} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold">{r.name}</p>
                      {r.role && <p className="text-[12px] text-muted-foreground">{r.role}</p>}
                    </div>
                    {cur ? (
                      <span className="shrink-0 text-[11.5px] text-muted-foreground">
                        {STATUS_OPTIONS.find((s) => s.id === cur.status)?.label}
                        {cur.status === "late" ? ` (${cur.lateMinutes} د)` : ""}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[11.5px] text-muted-foreground/70">لم يُسجّل</span>
                    )}
                  </div>
                  <div className="flex gap-1.5" role="group" aria-label={`حالة ${r.name}`}>
                    {STATUS_OPTIONS.map((s) => {
                      const active = cur?.status === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setStatus(r.employeeId, s.id)}
                          className={cn(
                            "min-h-11 flex-1 rounded-xl border px-1 text-[12.5px] font-bold transition-colors",
                            active ? s.active : "border-border text-muted-foreground hover:bg-accent/30"
                          )}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  {cur?.status === "late" && (
                    <div className="flex items-center gap-2">
                      <label htmlFor={`late-${r.employeeId}`} className="shrink-0 text-[13px] text-muted-foreground">
                        دقائق التأخير
                      </label>
                      <input
                        id={`late-${r.employeeId}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={cur.lateMinutes || ""}
                        onChange={(e) => setLateMinutes(r.employeeId, Number(e.target.value))}
                        className="font-num h-11 w-24 rounded-xl border border-border bg-muted/60 px-3 text-center text-[15px] outline-none focus:border-primary/70"
                      />
                      <span className="text-[11.5px] text-muted-foreground">كل 60 دقيقة = خصم نصف يوم</span>
                    </div>
                  )}
                </AppCard>
              );
            })}
          </div>
        )}
      </div>

      {/* حفظ الكل */}
      {rows.length > 0 && (
        <div className="sticky bottom-0 z-10 border-t border-border/60 bg-background/95 p-3 pb-safe backdrop-blur-md">
          <PrimaryButton block className="gap-1.5" loading={saving} onClick={saveAll}>
            <Save className="size-4" aria-hidden />
            حفظ الكل {draftCount > 0 ? `(${draftCount} موظفاً)` : ""}
          </PrimaryButton>
        </div>
      )}
    </div>
  );
}
