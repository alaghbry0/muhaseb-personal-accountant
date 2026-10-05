"use client";

/**
 * خطط التقسيط — FR-05-01/04:
 * وضع القائمة: إحصاءات (نشطة/مستحق الشهر/متأخر) + صف خطة (عميل + شريط تقدم + الاستحقاق القادم
 * بألوان: متأخر أحمر / هذا الأسبوع كهرماني) → التفاصيل.
 * وضع التفاصيل (param planId): بطاقة الخطة + جدول الأقساط (تحصيل كامل/جزئي) + إعادة جدولة المتأخر.
 * FAB «خطة جديدة»: من فاتورة آجلة أو مبلغ مخصص + معاينة حية للجدول (domain نقي في العميل).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, CalendarClock, ChevronRight, FileText, Coins } from "lucide-react";
import { getJson, postJson } from "@/lib/api";
import { formatDate, formatDateDisplay, formatAmount } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { CustomerDto } from "@/domain/parties";
import type { InstallmentPlanDto, InstallmentDto, InstallmentCycle } from "@/domain/installments";
import { generateSchedule } from "@/domain/installments";
import { todayStr } from "@/domain/parties";
import {
  AppHeader, AppCard, AmountText, StatusChip, EmptyState, SectionTitle, StatTile, PrimaryButton, KeyValueRow,
} from "@/components/ds";
import { PartySheet } from "@/components/parties/party-sheet";
import { Field, TextInput, DateInput, Segmented } from "@/components/parties/field";
import { PartyPicker } from "@/components/parties/party-picker";
import { CollectSheet } from "@/components/parties/collect-sheet";
import { cn } from "@/lib/utils";

interface PlansResponse {
  plans: InstallmentPlanDto[]
  stats: { activeCount: number; totalRemaining: number; lateCount: number; dueThisMonth: number }
}

interface PlanDetailResponse {
  plan: InstallmentPlanDto
  installments: InstallmentDto[]
}

interface OpenInvoiceItem {
  id: number
  invoiceNo: string
  issuedAt: string
  total: number
  dueAmount: number
  currencyCode: string
}

const CYCLE_LABEL: Record<string, string> = { monthly: "شهري", weekly: "أسبوعي" }

export default function InstallmentsPlansScreen({ planId }: { planId?: number }) {
  const { push, pop } = useNav();
  const qc = useQueryClient();

  return planId ? (
    <PlanDetail planId={planId} />
  ) : (
    <PlansList onOpenPlan={(id) => push("installments-plans", { planId: id })} onRefresh={() => qc.invalidateQueries({ queryKey: ["installments"] })} />
  );
}

// ═══════════════ قائمة الخطط ═══════════════

function PlansList({ onOpenPlan, onRefresh }: { onOpenPlan: (id: number) => void; onRefresh: () => void }) {
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "completed">("");
  const [newOpen, setNewOpen] = useState(false);

  const url = useMemo(() => `/api/installments/plans${statusFilter ? `?status=${statusFilter}` : ""}`, [statusFilter]);
  const { data, isLoading } = useQuery<PlansResponse>({
    queryKey: ["installments", "plans", url],
    queryFn: () => getJson<PlansResponse>(url),
  });

  const plans = data?.plans ?? [];
  const today = todayStr();
  const weekLater = formatDate(new Date(Date.now() + 6 * 86400000));

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="خطط التقسيط"
        action={
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            aria-label="خطة جديدة"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="px-3 pb-3">
          <div className="flex gap-1.5">
            {(
              [
                { id: "", label: "الكل" },
                { id: "active", label: "نشطة" },
                { id: "completed", label: "مكتملة" },
              ] as const
            ).map((f) => (
              <button
                key={f.id || "all"}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                  statusFilter === f.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        <div className="mb-3 grid grid-cols-3 gap-2.5">
          <StatTile title="خطط نشطة" amount={data?.stats.activeCount ?? 0} plain variant="primary" icon={Coins} />
          <StatTile title="مستحق الشهر" amount={data?.stats.dueThisMonth ?? 0} currency="YER" variant="due" icon={CalendarClock} />
          <StatTile
            title="أقساط متأخرة"
            amount={data?.stats.lateCount ?? 0}
            plain
            variant={data?.stats.lateCount ? "neg" : "default"}
          />
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الخطط…</p>
        ) : plans.length === 0 ? (
          <EmptyState
            icon={Coins}
            message="لا خطط تقسيط بعد"
            hint="حوّل فاتورة آجلة إلى خطة أقساط أو أنشئ خطة بمبلغ مخصص"
            actionLabel="خطة جديدة"
            onAction={() => setNewOpen(true)}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {plans.map((p) => {
              const pct = p.principal > 0 ? Math.min(100, (p.totalPaid / p.principal) * 100) : 0
              const nextLate = p.nextIsLate
              const nextSoon = !nextLate && p.nextDue && p.nextDue <= weekLater
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpenPlan(p.id)}
                  className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-4 text-start shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-colors hover:bg-accent/30 active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15.5px] font-bold">{p.customerName}</span>
                    <StatusChip status={p.status === "completed" ? "completed" : "active"} label={p.status === "completed" ? "مكتملة" : p.status === "cancelled" ? "ملغاة" : "نشطة"} />
                    <ChevronLeftSmall />
                  </div>
                  <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                    {p.invoiceNo ? (
                      <span className="flex items-center gap-1">
                        <FileText className="size-3" aria-hidden />
                        <span className="font-num">{p.invoiceNo}</span>
                      </span>
                    ) : (
                      <span>مبلغ مخصص</span>
                    )}
                    <span className="mx-1">•</span>
                    <span>
                      {p.installmentsCount} قسط {CYCLE_LABEL[p.cycle]}
                    </span>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="font-num text-muted-foreground">
                        المحصّل {formatAmount(p.totalPaid, { currency: p.currencyCode })} / {formatAmount(p.principal, { currency: p.currencyCode })}
                      </span>
                      <span className="font-num font-bold text-primary">{Math.round(pct)}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", p.status === "completed" ? "bg-[#34D399]" : "bg-gradient-cyan")}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    {p.nextDue ? (
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 text-[11.5px] font-bold",
                          nextLate
                            ? "border-[#F87171]/40 bg-[#F87171]/15 text-[#F87171]"
                            : nextSoon
                              ? "border-[#FBBF24]/40 bg-[#FBBF24]/15 text-[#FBBF24]"
                              : "border-border bg-muted/50 text-muted-foreground"
                        )}
                      >
                        {nextLate ? "متأخر" : "القادم"} {formatDateDisplay(p.nextDue)}
                        {p.nextDueAmount != null && (
                          <span className="font-num"> — {formatAmount(p.nextDueAmount, { currency: p.currencyCode })}</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-[#34D399]">سُدّدت بالكامل ✅</span>
                    )}
                    {p.lateCount > 0 && <StatusChip status="late" label={`${p.lateCount} متأخر`} />}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <NewPlanSheet open={newOpen} onOpenChange={setNewOpen} onCreated={() => onRefresh()} />
    </div>
  )
}

function ChevronLeftSmall() {
  return <ChevronRight className="size-4 shrink-0 rotate-180 text-muted-foreground" aria-hidden />
}

// ═══════════════ تفاصيل خطة ═══════════════

function PlanDetail({ planId }: { planId: number }) {
  const { push, pop } = useNav();
  const qc = useQueryClient();
  const [collecting, setCollecting] = useState<InstallmentDto | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const { data, isLoading } = useQuery<PlanDetailResponse>({
    queryKey: ["installments", "plan", planId],
    queryFn: () => getJson<PlanDetailResponse>(`/api/installments/plans/${planId}`),
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader title="تفاصيل الخطة" />
        <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الخطة…</p>
      </div>
    );
  }

  const { plan, installments } = data;
  const hasLate = installments.some((i) => i.isLate)

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title={`خطة ${plan.customerName}`}
        action={
          <button
            type="button"
            onClick={() => push("parties-customer-card", { customerId: plan.customerId })}
            aria-label="ملف العميل"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-[13px] font-bold text-primary hover:bg-primary/25"
          >
            الملف
          </button>
        }
      />

      <div className="flex-1 px-3 py-3">
        <div className="flex flex-col gap-3">
          <AppCard className="flex flex-col gap-1">
            <div className="mb-1 flex items-center gap-2">
              <StatusChip status={plan.status === "completed" ? "completed" : "active"} label={plan.status === "completed" ? "مكتملة" : "نشطة"} />
              {plan.lateCount > 0 && <StatusChip status="late" label={`${plan.lateCount} قسط متأخر`} />}
            </div>
            <KeyValueRow label="العميل" value={<button type="button" className="font-bold text-primary" onClick={() => push("parties-customer-card", { customerId: plan.customerId })}>{plan.customerName}</button>} />
            <KeyValueRow label="المصدر" value={plan.invoiceNo ? `فاتورة ${plan.invoiceNo}` : "مبلغ مخصص"} />
            <KeyValueRow label="المبلغ المقسّط" value={<AmountText value={plan.principal} currency={plan.currencyCode} size="sm" />} />
            {plan.downPayment > 0 && (
              <KeyValueRow label="الدفعة الأولى" value={<AmountText value={plan.downPayment} currency={plan.currencyCode} size="sm" variant="pos" />} />
            )}
            <KeyValueRow label="المحصّل" value={<AmountText value={plan.totalPaid} currency={plan.currencyCode} size="sm" variant="pos" />} />
            <KeyValueRow label="المتبقي" value={<AmountText value={plan.remaining} currency={plan.currencyCode} size="sm" variant="due" />} />
            <KeyValueRow label="الدورية" value={`${plan.installmentsCount} قسط ${CYCLE_LABEL[plan.cycle]}`} />
            <KeyValueRow label="أول استحقاق" value={<span className="font-num">{formatDateDisplay(plan.firstDue)}</span>} />
          </AppCard>

          {hasLate && plan.status !== "completed" && (
            <PrimaryButton variant="warning" block onClick={() => setRescheduleOpen(true)}>
              <CalendarClock className="size-4" aria-hidden />
              إعادة جدولة الأقساط غير المسددة
            </PrimaryButton>
          )}

          <AppCard noPad>
            <div className="p-4 pb-1">
              <SectionTitle>جدول الأقساط ({installments.length})</SectionTitle>
            </div>
            {installments.map((inst) => (
              <div
                key={inst.id}
                className={cn(
                  "flex min-h-16 items-center gap-2.5 border-b border-border/40 px-4 last:border-0",
                  inst.isLate && "bg-[#F87171]/5"
                )}
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl font-num text-[13px] font-bold",
                    inst.status === "paid"
                      ? "bg-[#34D399]/15 text-[#34D399]"
                      : inst.isLate
                        ? "bg-[#F87171]/15 text-[#F87171]"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {inst.seq}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-num text-[13.5px]">{formatDateDisplay(inst.dueDate)}</span>
                    <StatusChip
                      status={inst.status === "paid" ? "paid" : inst.status === "partial" ? "partial" : inst.isLate ? "late" : "pending"}
                      label={inst.status === "paid" ? "مسدد" : inst.status === "partial" ? "جزئي" : inst.isLate ? `متأخر` : "مستحق"}
                    />
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 font-num text-[12.5px] text-muted-foreground">
                    <span>{formatAmount(inst.amount, { currency: plan.currencyCode })}</span>
                    {inst.paidAmount > 0 && (
                      <span className="text-[#34D399]">مدفوع {formatAmount(inst.paidAmount, { currency: plan.currencyCode })}</span>
                    )}
                  </div>
                </div>
                {inst.status !== "paid" ? (
                  <PrimaryButton
                    variant="success"
                    className="min-h-10 px-3 text-[12.5px]"
                    onClick={() => setCollecting(inst)}
                  >
                    تحصيل
                  </PrimaryButton>
                ) : (
                  <span className="text-[11.5px] text-[#34D399]">
                    {inst.paidAt ? formatDateDisplay(inst.paidAt) : ""}
                  </span>
                )}
              </div>
            ))}
          </AppCard>
        </div>
      </div>

      <CollectSheet
        key={collecting?.id ?? "none"}
        open={Boolean(collecting)}
        onOpenChange={(o) => !o && setCollecting(null)}
        installment={collecting}
        customerName={plan.customerName}
        currencyCode={plan.currencyCode}
      />
      <RescheduleSheet
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        plan={plan}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["installments"] })
        }}
      />
    </div>
  )
}

// ═══════════════ إعادة الجدولة ═══════════════

function RescheduleSheet({
  open,
  onOpenChange,
  plan,
  onDone,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  plan: InstallmentPlanDto
  onDone: () => void
}) {
  const [newFirstDue, setNewFirstDue] = useState(formatDate(new Date(Date.now() + 7 * 86400000)))
  const [months, setMonths] = useState(String(Math.max(1, plan.installmentsCount - plan.paidCount)))
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await postJson(`/api/installments/plans/${plan.id}/reschedule`, {
        newFirstDue,
        months: Number(months || 1),
      })
      toast.success("تمت إعادة جدولة الأقساط غير المسددة")
      onDone()
      onOpenChange(false)
    } catch {
      /* toast */
    } finally {
      setSaving(false)
    }
  }

  return (
    <PartySheet
      open={open}
      onOpenChange={onOpenChange}
      title="إعادة جدولة الأقساط"
      description={`تُحذف الأقساط غير المسددة (${plan.installmentsCount - plan.paidCount}) ويُولَّد جدول جديد من المتبقي ${formatAmount(plan.remaining, { currency: plan.currencyCode })}`}
      footer={
        <div className="flex gap-2">
          <PrimaryButton variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            إلغاء
          </PrimaryButton>
          <PrimaryButton variant="warning" className="flex-[2]" loading={saving} onClick={save}>
            إعادة الجدولة
          </PrimaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="تاريخ أول استحقاق جديد" required>
          <DateInput value={newFirstDue} onChange={setNewFirstDue} />
        </Field>
        <Field label="عدد الأقساط الجديدة">
          <TextInput value={months} onChange={setMonths} dir="ltr" inputMode="numeric" />
        </Field>
        <p className="text-[12px] text-muted-foreground">
          المدفوع سابقاً ({formatAmount(plan.totalPaid, { currency: plan.currencyCode })}) يُحفظ كما هو —
          يُقسَّم المتبقي فقط على الأقساط الجديدة بالتساوي.
        </p>
      </div>
    </PartySheet>
  )
}

// ═══════════════ خطة جديدة (مع معاينة حية) ═══════════════

function NewPlanSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: () => void
}) {
  const [source, setSource] = useState<"invoice" | "custom">("invoice")
  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(null)
  const [invoice, setInvoice] = useState<OpenInvoiceItem | null>(null)
  const [principal, setPrincipal] = useState("")
  const [downPayment, setDownPayment] = useState("0")
  const [months, setMonths] = useState("6")
  const [cycle, setCycle] = useState<InstallmentCycle>("monthly")
  const [firstDue, setFirstDue] = useState(formatDate(new Date(Date.now() + 30 * 86400000)))
  const [saving, setSaving] = useState(false)

  // فواتير العميل الآجلة المفتوحة
  const { data: invoicesData } = useQuery<{ invoices: OpenInvoiceItem[] }>({
    queryKey: ["parties", "credit-invoices", customer?.id],
    queryFn: () =>
      getJson<{ invoices: OpenInvoiceItem[] }>(`/api/invoices?docType=sale&customerId=${customer?.id}&limit=50`),
    enabled: open && source === "invoice" && Boolean(customer?.id),
  })
  const { data: plansData } = useQuery<{ plans: InstallmentPlanDto[] }>({
    queryKey: ["installments", "customer-plans", customer?.id],
    queryFn: () => getJson<{ plans: InstallmentPlanDto[] }>(`/api/installments/plans?customerId=${customer?.id}`),
    enabled: open && source === "invoice" && Boolean(customer?.id),
  })

  const openInvoices = useMemo(() => {
    const plannedInvoiceIds = new Set(
      (plansData?.plans ?? []).filter((p) => p.status !== "cancelled" && p.invoiceId).map((p) => p.invoiceId!)
    )
    return (invoicesData?.invoices ?? []).filter(
      (i) => i.dueAmount > 0 && !plannedInvoiceIds.has(i.id)
    )
  }, [invoicesData, plansData])

  const effectivePrincipal = source === "invoice" ? (invoice?.dueAmount ?? 0) : Number(principal || 0)

  // معاينة حية — domain نقي في العميل
  const preview = useMemo(() => {
    if (!(effectivePrincipal > 0)) return []
    try {
      return generateSchedule({
        principal: effectivePrincipal,
        downPayment: Number(downPayment || 0),
        months: Math.max(1, Math.floor(Number(months || 1))),
        cycle,
        firstDue,
      })
    } catch {
      return []
    }
  }, [effectivePrincipal, downPayment, months, cycle, firstDue])

  const save = async () => {
    if (!customer) {
      toast.error("اختر العميل")
      return
    }
    if (source === "invoice" && !invoice) {
      toast.error("اختر فاتورة آجلة")
      return
    }
    if (source === "custom" && !(Number(principal) > 0)) {
      toast.error("أدخل مبلغ الخطة")
      return
    }
    setSaving(true)
    try {
      await postJson("/api/installments/plans", {
        source,
        ...(source === "invoice" ? { invoiceId: invoice!.id } : { customerId: customer.id, principal: Number(principal) }),
        months: Math.max(1, Math.floor(Number(months || 1))),
        downPayment: Number(downPayment || 0),
        firstDue,
        cycle,
      })
      toast.success("تم إنشاء خطة التقسيط وتوليد الجدول")
      onCreated()
      onOpenChange(false)
      // إعادة تعيين
      setCustomer(null)
      setInvoice(null)
      setPrincipal("")
      setDownPayment("0")
    } catch {
      /* toast */
    } finally {
      setSaving(false)
    }
  }

  return (
    <PartySheet
      open={open}
      onOpenChange={onOpenChange}
      title="خطة تقسيط جديدة"
      description="من فاتورة آجلة قائمة أو مبلغ مخصص بلا فاتورة (FR-05-01)"
      footer={
        <div className="flex gap-2">
          <PrimaryButton variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            إلغاء
          </PrimaryButton>
          <PrimaryButton className="flex-[2]" loading={saving} onClick={save}>
            إنشاء الخطة ({preview.length} قسط)
          </PrimaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="نوع المصدر">
          <Segmented
            options={[
              { id: "invoice", label: "فاتورة آجلة" },
              { id: "custom", label: "مبلغ مخصص" },
            ]}
            value={source}
            onChange={(s) => {
              setSource(s)
              setInvoice(null)
            }}
          />
        </Field>

        <Field label="العميل" required>
          <PartyPicker partyType="customer" selected={customer} onSelect={(c) => { setCustomer(c); setInvoice(null) }} />
        </Field>

        {source === "invoice" ? (
          <Field label="الفاتورة الآجلة" required>
            {openInvoices.length === 0 ? (
              <p className="rounded-xl border border-border/60 bg-muted/40 p-3 text-[13px] text-muted-foreground">
                {customer ? "لا فواتير آجلة مفتوحة لهذا العميل (أو كلها مربوطة بخطط)" : "اختر العميل أولاً"}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {openInvoices.map((inv) => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => setInvoice(inv)}
                    className={cn(
                      "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-start transition-colors",
                      invoice?.id === inv.id ? "border-primary bg-primary/15" : "border-border hover:bg-accent/30"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-num font-bold">{inv.invoiceNo}</span>
                      <span className="block text-[11.5px] text-muted-foreground">{formatDateDisplay(inv.issuedAt)}</span>
                    </span>
                    <AmountText value={inv.dueAmount} currency={inv.currencyCode} size="sm" variant="due" />
                  </button>
                ))}
              </div>
            )}
          </Field>
        ) : (
          <Field label="المبلغ المقسّط (الأصل)" required>
            <TextInput value={principal} onChange={setPrincipal} placeholder="0" dir="ltr" inputMode="decimal" />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="الدفعة الأولى (فورية)">
            <TextInput value={downPayment} onChange={setDownPayment} placeholder="0" dir="ltr" inputMode="decimal" />
          </Field>
          <Field label="عدد الأقساط">
            <TextInput value={months} onChange={setMonths} dir="ltr" inputMode="numeric" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الدورية">
            <Segmented
              options={[
                { id: "monthly", label: "شهري" },
                { id: "weekly", label: "أسبوعي" },
              ]}
              value={cycle}
              onChange={setCycle}
            />
          </Field>
          <Field label="أول استحقاق" required>
            <DateInput value={firstDue} onChange={setFirstDue} />
          </Field>
        </div>

        {/* معاينة حية */}
        {preview.length > 0 ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="mb-2 text-[13px] font-bold text-primary">
              معاينة الجدول — {preview.length} قسط × {formatAmount(preview[0]?.amount ?? 0, { currency: "YER" })}
              {Number(downPayment) > 0 && ` (بعد دفعة أولى ${formatAmount(Number(downPayment), { currency: "YER" })})`}
            </p>
            <div className="scrollbar-slim max-h-44 overflow-y-auto">
              {preview.map((s) => (
                <div key={s.seq} className="flex items-center justify-between border-b border-border/30 py-1.5 text-[12.5px] last:border-0">
                  <span className="text-muted-foreground">
                    قسط <span className="font-num">#{s.seq}</span>
                  </span>
                  <span className="font-num">{formatDateDisplay(s.dueDate)}</span>
                  <AmountText value={s.amount} currency="YER" size="sm" />
                </div>
              ))}
            </div>
            {Number(downPayment) > 0 && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">
                الدفعة الأولى تُسجَّل قبضاً فورياً في الصندوق عند الحفظ.
              </p>
            )}
          </div>
        ) : effectivePrincipal > 0 ? (
          <p className="rounded-xl border border-[#FBBF24]/40 bg-[#FBBF24]/10 p-3 text-[12.5px] text-[#FBBF24]">
            الدفعة الأولى تغطي كامل المبلغ — لا حاجة لخطة
          </p>
        ) : null}
      </div>
    </PartySheet>
  )
}
