/**
 * Domain — التقسيط — Task 3-b ⭐ (FR-05)
 * توليد جدول الأقساط (نقي) + إنشاء الخطط من فاتورة آجلة أو مبلغ مخصص
 * + التحصيل (قبض في الصندوق + عمولة مندوب التحصيل) + إعادة جدولة المتأخر.
 *
 * اتفاقيات:
 * • خطة من فاتورة: principal = due الفاتورة وقت الإنشاء (لا يُعدَّل due الفاتورة —
 *   التحصيلات سندات قبض refType='installment' تخفض رصيد العميل عبر computeCustomerBalance).
 * • الدفعة الأولى (downPayment) = سند قبض فوري refType='installment' refId=plan.id
 *   وتُحتسب داخل plan.totalPaid.
 * • خطة مستقلة (بلا فاتورة): الأصل يُضاف لرصيد العميل كدين (انظر parties.ts).
 * • الاكتمال: كل الأقساط مسددة → plan.status='completed'.
 * • المتأخر: حالة محسوبة لحظياً (dueDate < اليوم && pending/partial) — لا تُخزَّن.
 */
import { addMonths, addWeeks, format, parseISO } from "date-fns"
import type { Prisma, PrismaClient } from "@prisma/client"
import { round2, round4 } from "./money"
import { DomainError } from "./invoice-save"
import { computeCustomerBalance, resolveRate, todayStr } from "./parties"

type Tx = Prisma.TransactionClient
type AnyDb = PrismaClient | Prisma.TransactionClient

export type InstallmentCycle = "monthly" | "weekly"

// ═══════════════ مولّد الجدول (نقي) ═══════════════

export interface ScheduleEntry {
  seq: number
  dueDate: string // YYYY-MM-DD
  amount: number
}

export interface GenerateScheduleOpts {
  /** المبلغ الإجمالي المقسَّط (قبل خصم الدفعة الأولى) */
  principal: number
  /** الدفعة الأولى المدفوعة فوراً — تُخصم من المبلغ الموزع */
  downPayment?: number
  /** عدد الأقساط */
  months: number
  cycle: InstallmentCycle
  /** تاريخ أول استحقاق YYYY-MM-DD */
  firstDue: string
}

/**
 * توليد جدول أقساط متساوية: (principal − downPayment) ÷ months
 * والقسط الأخير يلتقط كسر التقريب لضمان تطابق المجموع.
 * التواريخ: addMonths/addWeeks من firstDue.
 */
export function generateSchedule(opts: GenerateScheduleOpts): ScheduleEntry[] {
  const down = Math.max(0, round2(opts.downPayment ?? 0))
  const remaining = round2(opts.principal - down)
  const n = Math.floor(opts.months)
  if (!(remaining > 0)) throw new DomainError("لا يوجد مبلغ متبقٍ للتقسيط — راجع المبلغ والدفعة الأولى")
  if (!(n >= 1)) throw new DomainError("عدد الأقساط يجب أن يكون 1 على الأقل")
  if (n > 120) throw new DomainError("عدد الأقساط كبير جداً (الحد 120)")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.firstDue)) throw new DomainError("تاريخ أول استحقاق غير صالح")

  const each = round2(remaining / n)
  if (each < 0.01) throw new DomainError("قيمة القسط صغيرة جداً — قلّل عدد الأقساط")

  let first: Date
  try {
    first = parseISO(`${opts.firstDue}T00:00:00`)
  } catch {
    throw new DomainError("تاريخ أول استحقاق غير صالح")
  }

  const entries: ScheduleEntry[] = []
  for (let i = 0; i < n; i++) {
    const d = opts.cycle === "weekly" ? addWeeks(first, i) : addMonths(first, i)
    const amount = i === n - 1 ? round2(remaining - each * (n - 1)) : each
    entries.push({ seq: i + 1, dueDate: format(d, "yyyy-MM-dd"), amount })
  }
  return entries
}

/** قسط متأخر؟ (حالة محسوبة — FR-05-04) */
export function isLate(
  inst: { dueDate: string; status: string },
  today: string = todayStr()
): boolean {
  return (
    inst.dueDate < today && (inst.status === "pending" || inst.status === "partial" || inst.status === "late")
  )
}

// ═══════════════ DTO ═══════════════

export interface InstallmentDto {
  id: number
  seq: number
  dueDate: string
  amount: number
  paidAmount: number
  remaining: number
  status: string // pending|partial|paid|rescheduled (+ 'late' محسوبة للعرض)
  isLate: boolean
  paidAt: string | null
  cashTxId: number | null
}

export interface InstallmentPlanDto {
  id: number
  customerId: number
  customerName: string
  customerPhone: string | null
  customerWhatsapp: string | null
  invoiceId: number | null
  invoiceNo: string | null
  currencyId: number
  currencyCode: string
  principal: number
  downPayment: number
  months: number
  cycle: InstallmentCycle
  firstDue: string
  totalPaid: number
  remaining: number
  status: string
  createdAt: string
  installmentsCount: number
  paidCount: number
  lateCount: number
  /** تاريخ الاستحقاق القادم (أقرب قسط غير مسدد) */
  nextDue: string | null
  nextDueAmount: number | null
  nextIsLate: boolean
}

function toPlanDto(
  plan: Prisma.InstallmentPlanGetPayload<{
    include: {
      customer: { select: { name: true; phone: true; whatsapp: true } }
      invoice: { select: { invoiceNo: true } }
      currency: { select: { code: true } }
      installments: true
    }
  }>
): InstallmentPlanDto {
  const today = todayStr()
  const unpaid = plan.installments.filter((i) => i.status !== "paid")
  const next = unpaid
    .slice()
    .sort((a, b) => (a.dueDate === b.dueDate ? a.seq - b.seq : a.dueDate < b.dueDate ? -1 : 1))[0]
  const lateCount = plan.installments.filter((i) => isLate(i, today)).length
  return {
    id: plan.id,
    customerId: plan.customerId,
    customerName: plan.customer.name,
    customerPhone: plan.customer.phone,
    customerWhatsapp: plan.customer.whatsapp,
    invoiceId: plan.invoiceId,
    invoiceNo: plan.invoice?.invoiceNo ?? null,
    currencyId: plan.currencyId,
    currencyCode: plan.currency.code,
    principal: plan.principal,
    downPayment: plan.downPayment,
    months: plan.months,
    cycle: plan.cycle as InstallmentCycle,
    firstDue: plan.firstDue,
    totalPaid: round2(plan.totalPaid),
    remaining: round2(Math.max(0, plan.principal - plan.totalPaid)),
    status: plan.status,
    createdAt: plan.createdAt.toISOString(),
    installmentsCount: plan.installments.length,
    paidCount: plan.installments.filter((i) => i.status === "paid").length,
    lateCount,
    nextDue: next?.dueDate ?? null,
    nextDueAmount: next ? round2(next.amount - next.paidAmount) : null,
    nextIsLate: next ? isLate(next, today) : false,
  }
}

export const planInclude = {
  customer: { select: { name: true, phone: true, whatsapp: true } },
  invoice: { select: { invoiceNo: true } },
  currency: { select: { code: true } },
  installments: { orderBy: { seq: "asc" as const } },
} satisfies Prisma.InstallmentPlanInclude

export function toInstallmentDto(
  inst: Prisma.InstallmentGetPayload<Record<string, never>>,
  today: string = todayStr()
): InstallmentDto {
  return {
    id: inst.id,
    seq: inst.seq,
    dueDate: inst.dueDate,
    amount: inst.amount,
    paidAmount: round2(inst.paidAmount),
    remaining: round2(Math.max(0, inst.amount - inst.paidAmount)),
    status: isLate(inst, today) && inst.status !== "paid" ? "late" : inst.status,
    isLate: isLate(inst, today),
    paidAt: inst.paidAt,
    cashTxId: inst.cashTxId,
  }
}

// ═══════════════ إنشاء الخطط ═══════════════

export interface CreatePlanBase {
  months: number
  downPayment?: number
  firstDue: string
  cycle?: InstallmentCycle
  cashboxId?: number | null
  txDate?: string
}

export interface CreatePlanFromInvoicePayload extends CreatePlanBase {
  invoiceId: number
}

export interface CreateStandalonePlanPayload extends CreatePlanBase {
  customerId: number
  principal: number
  currencyId?: number | null
  exchangeRate?: number | null
  notes?: string | null
}

/** إنشاء خطة من فاتورة آجلة — principal = due الفاتورة (بعملتها) */
export async function createPlanFromInvoice(
  db: PrismaClient,
  payload: CreatePlanFromInvoicePayload
): Promise<{ plan: InstallmentPlanDto; installments: InstallmentDto[] }> {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: payload.invoiceId, docType: "sale", status: "completed" },
      include: { installmentPlans: { where: { status: { in: ["active", "defaulted"] } } } },
    })
    if (!invoice) throw new DomainError("الفاتورة غير موجودة أو غير مكتملة", 404)
    if (!invoice.customerId) throw new DomainError("لا يمكن تقسيط فاتورة بلا عميل")
    if (invoice.dueAmount <= 0.005) throw new DomainError("الفاتورة مسددة بالكامل — لا مبلغ للتقسيط")
    if (invoice.installmentPlans.length > 0) {
      throw new DomainError("هذه الفاتورة مربوطة بخطة تقسيط نشطة بالفعل")
    }

    const down = Math.max(0, round2(payload.downPayment ?? 0))
    if (down >= invoice.dueAmount - 0.005) {
      throw new DomainError("الدفعة الأولى تغطي كامل المتبقي — لا حاجة لخطة تقسيط")
    }

    const cycle = payload.cycle ?? "monthly"
    const schedule = generateSchedule({
      principal: invoice.dueAmount,
      downPayment: down,
      months: payload.months,
      cycle,
      firstDue: payload.firstDue,
    })

    const plan = await tx.installmentPlan.create({
      data: {
        customerId: invoice.customerId,
        invoiceId: invoice.id,
        currencyId: invoice.currencyId,
        principal: round4(invoice.dueAmount),
        downPayment: down,
        months: payload.months,
        cycle,
        firstDue: payload.firstDue,
        totalPaid: 0,
        status: "active",
      },
    })
    for (const s of schedule) {
      await tx.installment.create({
        data: { planId: plan.id, seq: s.seq, dueDate: s.dueDate, amount: s.amount, status: "pending" },
      })
    }

    // الدفعة الأولى — سند قبض فوري مرتبط بالخطة
    let totalPaid = 0
    if (down > 0) {
      if (!payload.cashboxId) throw new DomainError("اختر الصندوق لتسجيل الدفعة الأولى")
      const cashbox = await tx.cashbox.findFirst({
        where: { id: payload.cashboxId, isArchived: false },
      })
      if (!cashbox) throw new DomainError("الصندوق غير موجود أو مؤرشف")
      const customer = await tx.customer.findUnique({ where: { id: invoice.customerId }, select: { name: true } })
      await tx.cashTx.create({
        data: {
          txType: "receipt",
          cashboxId: cashbox.id,
          currencyId: invoice.currencyId,
          amount: down,
          exchangeRate: invoice.exchangeRate,
          txDate: payload.txDate || todayStr(),
          refType: "installment",
          refId: plan.id,
          customerId: invoice.customerId,
          description: `الدفعة الأولى لخطة التقسيط PLAN-${plan.id} — ${customer?.name ?? ""}`.trim(),
        },
      })
      totalPaid = down
    }
    if (totalPaid > 0) {
      await tx.installmentPlan.update({ where: { id: plan.id }, data: { totalPaid } })
    }

    const full = await tx.installmentPlan.findUnique({ where: { id: plan.id }, include: planInclude })
    return { plan: toPlanDto(full!), installments: full!.installments.map((i) => toInstallmentDto(i)) }
  })
}

/** خطة بمبلغ مخصص بلا فاتورة (FR-05-01) — دين جديد على العميل */
export async function createStandalonePlan(
  db: PrismaClient,
  payload: CreateStandalonePlanPayload
): Promise<{ plan: InstallmentPlanDto; installments: InstallmentDto[] }> {
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({
      where: { id: payload.customerId, isArchived: false },
    })
    if (!customer) throw new DomainError("العميل غير موجود أو مؤرشف")
    if (!(payload.principal > 0)) throw new DomainError("مبلغ الخطة يجب أن يكون أكبر من صفر")

    const down = Math.max(0, round2(payload.downPayment ?? 0))
    if (down >= payload.principal - 0.005) {
      throw new DomainError("الدفعة الأولى تغطي كامل المبلغ — لا حاجة لخطة تقسيط")
    }

    const cycle = payload.cycle ?? "monthly"
    const schedule = generateSchedule({
      principal: payload.principal,
      downPayment: down,
      months: payload.months,
      cycle,
      firstDue: payload.firstDue,
    })

    // العملة: الأساس افتراضياً
    const base = await tx.currency.findFirst({ where: { isBase: true } })
    if (!base) throw new DomainError("لا توجد عملة أساسية معرّفة")
    const currencyId = payload.currencyId ?? base.id
    const resolved = await resolveRate(
      tx,
      currencyId,
      payload.exchangeRate ?? null,
      payload.txDate || todayStr()
    )

    const plan = await tx.installmentPlan.create({
      data: {
        customerId: customer.id,
        invoiceId: null,
        currencyId: resolved.id,
        principal: round4(payload.principal),
        downPayment: down,
        months: payload.months,
        cycle,
        firstDue: payload.firstDue,
        totalPaid: 0,
        status: "active",
      },
    })
    for (const s of schedule) {
      await tx.installment.create({
        data: { planId: plan.id, seq: s.seq, dueDate: s.dueDate, amount: s.amount, status: "pending" },
      })
    }

    let totalPaid = 0
    if (down > 0) {
      if (!payload.cashboxId) throw new DomainError("اختر الصندوق لتسجيل الدفعة الأولى")
      const cashbox = await tx.cashbox.findFirst({ where: { id: payload.cashboxId, isArchived: false } })
      if (!cashbox) throw new DomainError("الصندوق غير موجود أو مؤرشف")
      await tx.cashTx.create({
        data: {
          txType: "receipt",
          cashboxId: cashbox.id,
          currencyId: resolved.id,
          amount: down,
          exchangeRate: resolved.rate,
          txDate: payload.txDate || todayStr(),
          refType: "installment",
          refId: plan.id,
          customerId: customer.id,
          description: `الدفعة الأولى لخطة التقسيط PLAN-${plan.id} — ${customer.name}`,
        },
      })
      totalPaid = down
      await tx.installmentPlan.update({ where: { id: plan.id }, data: { totalPaid } })
    }

    const full = await tx.installmentPlan.findUnique({ where: { id: plan.id }, include: planInclude })
    return { plan: toPlanDto(full!), installments: full!.installments.map((i) => toInstallmentDto(i)) }
  })
}

// ═══════════════ التحصيل ═══════════════

export interface CollectInstallmentPayload {
  installmentId: number
  /** افتراضياً المتبقي كاملاً — جزئي مسموح (≤ المتبقي) */
  amount?: number
  cashboxId: number
  txDate?: string
  exchangeRate?: number | null
}

export interface CollectResult {
  installment: InstallmentDto
  plan: InstallmentPlanDto
  customerBalance: number
  cashTxId: number
  commissionCreated: boolean
}

/**
 * تحصيل قسط (كامل أو جزئي) — FR-05-02:
 * قبض في الصندوق refType='installment' + تحديث القسط والخطة
 * + عمولة مندوب التحصيل إن كانت الفاتورة الأصلية مربوطة بمندوب (collection/both) — FR-05-06.
 */
export async function collectInstallment(
  db: PrismaClient,
  payload: CollectInstallmentPayload
): Promise<CollectResult> {
  return db.$transaction(async (tx) => {
    const inst = await tx.installment.findUnique({ where: { id: payload.installmentId } })
    if (!inst) throw new DomainError("القسط غير موجود", 404)
    if (inst.status === "paid") throw new DomainError("القسط محصّل بالكامل")

    const plan = await tx.installmentPlan.findUnique({
      where: { id: inst.planId },
      include: {
        customer: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNo: true, salesRepId: true, exchangeRate: true } },
        currency: { select: { id: true, code: true, isBase: true } },
      },
    })
    if (!plan) throw new DomainError("خطة التقسيط غير موجودة", 404)
    if (plan.status === "cancelled") throw new DomainError("الخطة ملغاة")

    const remaining = round2(inst.amount - inst.paidAmount)
    const amount = payload.amount == null ? remaining : round2(payload.amount)
    if (!(amount > 0)) throw new DomainError("مبلغ التحصيل يجب أن يكون أكبر من صفر")
    if (amount > remaining + 0.005) {
      throw new DomainError(`المبلغ يتجاوز المتبقي من القسط (${remaining}) — حصّل القسط التالي للمزيد`)
    }

    const cashbox = await tx.cashbox.findFirst({
      where: { id: payload.cashboxId, isArchived: false },
    })
    if (!cashbox) throw new DomainError("الصندوق غير موجود أو مؤرشف")

    const txDate = payload.txDate || todayStr()
    const resolved = await resolveRate(tx, plan.currency.id, payload.exchangeRate ?? null, txDate)

    // 1) قبض في الصندوق
    const cash = await tx.cashTx.create({
      data: {
        txType: "receipt",
        cashboxId: cashbox.id,
        currencyId: plan.currency.id,
        amount,
        exchangeRate: resolved.rate,
        txDate,
        refType: "installment",
        refId: inst.id,
        customerId: plan.customer.id,
        description: `تحصيل القسط #${inst.seq} — خطة PLAN-${plan.id} — ${plan.customer.name}`,
      },
    })

    // 2) تحديث القسط
    const newPaid = round2(inst.paidAmount + amount)
    const fullyPaid = newPaid >= inst.amount - 0.005
    await tx.installment.update({
      where: { id: inst.id },
      data: {
        paidAmount: newPaid,
        status: fullyPaid ? "paid" : "partial",
        paidAt: fullyPaid ? txDate : inst.paidAt,
        cashTxId: cash.id,
      },
    })

    // 3) تحديث الخطة (اكتمال عند سداد الكل)
    const newTotalPaid = round2(plan.totalPaid + amount)
    const all = await tx.installment.findMany({ where: { planId: plan.id } })
    const allPaid = all.every((i) =>
      i.id === inst.id ? fullyPaid : i.status === "paid"
    )
    await tx.installmentPlan.update({
      where: { id: plan.id },
      data: {
        totalPaid: newTotalPaid,
        status: allPaid ? "completed" : plan.status,
      },
    })

    // 4) عمولة مندوب التحصيل (collection/both) — على فاتورة الخطة (FR-05-06)
    let commissionCreated = false
    if (plan.invoice?.salesRepId) {
      const rep = await tx.salesRep.findUnique({ where: { id: plan.invoice.salesRepId } })
      if (
        rep &&
        !rep.isArchived &&
        (rep.commissionType === "collection" || rep.commissionType === "both") &&
        rep.commissionPercent > 0
      ) {
        const baseAmount = round4(amount * resolved.rate)
        await tx.commission.create({
          data: {
            salesRepId: rep.id,
            refType: "collection",
            refId: inst.id,
            baseAmount,
            percent: rep.commissionPercent,
            amount: round2((baseAmount * rep.commissionPercent) / 100),
            status: "due",
          },
        })
        commissionCreated = true
      }
    }

    const customerBalance = await computeCustomerBalance(tx, plan.customer.id)
    const updatedPlan = await tx.installmentPlan.findUnique({ where: { id: plan.id }, include: planInclude })
    const updatedInst = await tx.installment.findUnique({ where: { id: inst.id } })

    return {
      installment: toInstallmentDto(updatedInst!),
      plan: toPlanDto(updatedPlan!),
      customerBalance,
      cashTxId: cash.id,
      commissionCreated,
    }
  })
}

// ═══════════════ إعادة جدولة المتأخر (FR-05-04) ═══════════════

export interface ReschedulePayload {
  planId: number
  newFirstDue: string
  months?: number
}

/**
 * إعادة جدولة الأقساط غير المسددة: تُحذف الصفوف غير المسددة (pending/partial)
 * ويُولَّد جدول جديد من المتبقي (principal − totalPaid) ابتداءً من newFirstDue.
 * يُدوَّن الأثر في سجل التدقيق (audit_log).
 */
export async function rescheduleLate(
  db: PrismaClient,
  payload: ReschedulePayload
): Promise<{ plan: InstallmentPlanDto; installments: InstallmentDto[] }> {
  return db.$transaction(async (tx) => {
    const plan = await tx.installmentPlan.findUnique({
      where: { id: payload.planId },
      include: { installments: true },
    })
    if (!plan) throw new DomainError("خطة التقسيط غير موجودة", 404)
    if (plan.status === "completed") throw new DomainError("الخطة مكتملة — لا حاجة لإعادة جدولة")

    const remainingPrincipal = round2(plan.principal - plan.totalPaid)
    if (remainingPrincipal <= 0.005) throw new DomainError("لا يوجد مبلغ متبقٍ لإعادة جدولته")

    const months = Math.max(1, Math.floor(payload.months ?? plan.months))
    const cycle = plan.cycle as InstallmentCycle
    const schedule = generateSchedule({
      principal: remainingPrincipal,
      downPayment: 0,
      months,
      cycle,
      firstDue: payload.newFirstDue,
    })

    // حذف غير المسدد وإعادة التوليد بترقيم يواصل المدفوع
    const keep = plan.installments.filter((i) => i.status === "paid")
    const maxSeq = plan.installments.reduce((m, i) => Math.max(m, i.seq), 0)
    const deleted = await tx.installment.deleteMany({
      where: { planId: plan.id, status: { in: ["pending", "partial", "late", "rescheduled"] } },
    })
    for (let i = 0; i < schedule.length; i++) {
      await tx.installment.create({
        data: {
          planId: plan.id,
          seq: maxSeq + i + 1,
          dueDate: schedule[i].dueDate,
          amount: schedule[i].amount,
          status: "pending",
        },
      })
    }

    await tx.installmentPlan.update({
      where: { id: plan.id },
      data: { months, status: "active" },
    })

    await tx.auditLog.create({
      data: {
        action: "installment_reschedule",
        entity: "installment_plan",
        entityId: plan.id,
        details: JSON.stringify({
          newFirstDue: payload.newFirstDue,
          months,
          remainingPrincipal,
          deletedInstallments: deleted.count,
          keptPaid: keep.length,
        }),
        at: new Date().toISOString(),
      },
    })

    const full = await tx.installmentPlan.findUnique({ where: { id: plan.id }, include: planInclude })
    return { plan: toPlanDto(full!), installments: full!.installments.map((i) => toInstallmentDto(i)) }
  })
}

// ═══════════════ قوائم واستعلامات ═══════════════

export interface DueItem {
  installmentId: number
  planId: number
  seq: number
  installmentsCount: number
  customerId: number
  customerName: string
  customerPhone: string | null
  customerWhatsapp: string | null
  invoiceNo: string | null
  dueDate: string
  amount: number
  paidAmount: number
  remaining: number
  currencyCode: string
  isLate: boolean
  /** أيام التأخير (للمتأخر فقط) */
  daysLate: number
}

function daysBetween(a: string, b: string): number {
  const d1 = parseISO(`${a}T00:00:00`).getTime()
  const d2 = parseISO(`${b}T00:00:00`).getTime()
  return Math.round((d2 - d1) / 86_400_000)
}

/** أقساط غير مسددة باستحقاق داخل [from,to] + قائمة المتأخر كاملة — FR-05-02 */
export async function listDue(
  db: AnyDb,
  opts: { from: string; to: string }
): Promise<{ due: DueItem[]; late: DueItem[] }> {
  const today = todayStr()
  const rows = await db.installment.findMany({
    where: { status: { in: ["pending", "partial"] }, dueDate: { lte: opts.to } },
    include: {
      plan: {
        include: {
          customer: { select: { id: true, name: true, phone: true, whatsapp: true } },
          invoice: { select: { invoiceNo: true } },
          currency: { select: { code: true } },
          installments: { select: { seq: true } },
        },
      },
    },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  })

  const activeOnly = rows.filter((r) => r.plan.status === "active" || r.plan.status === "defaulted")
  const toDueItem = (r: (typeof activeOnly)[number]): DueItem => {
    const late = isLate(r, today)
    return {
      installmentId: r.id,
      planId: r.plan.id,
      seq: r.seq,
      installmentsCount: r.plan.installments.length,
      customerId: r.plan.customer.id,
      customerName: r.plan.customer.name,
      customerPhone: r.plan.customer.phone,
      customerWhatsapp: r.plan.customer.whatsapp,
      invoiceNo: r.plan.invoice?.invoiceNo ?? null,
      dueDate: r.dueDate,
      amount: r.amount,
      paidAmount: round2(r.paidAmount),
      remaining: round2(r.amount - r.paidAmount),
      currencyCode: r.plan.currency.code,
      isLate: late,
      daysLate: late ? Math.max(0, daysBetween(r.dueDate, today)) : 0,
    }
  }

  const due = activeOnly.filter((r) => r.dueDate >= opts.from && r.dueDate <= opts.to).map(toDueItem)
  const late = activeOnly.filter((r) => isLate(r, today)).map(toDueItem)
  late.sort((a, b) =>
    a.dueDate === b.dueDate ? a.seq - b.seq : a.dueDate < b.dueDate ? -1 : 1
  )
  return { due, late }
}

/** قائمة الخطط مع فلاتر — للعرض */
export async function listPlans(
  db: AnyDb,
  filters: { customerId?: number; status?: string; limit?: number } = {}
): Promise<InstallmentPlanDto[]> {
  const rows = await db.installmentPlan.findMany({
    where: {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: planInclude,
    orderBy: { id: "desc" },
    take: Math.min(200, filters.limit ?? 100),
  })
  return rows.map(toPlanDto)
}

/** تفاصيل خطة: DTO + الجدول كاملاً */
export async function getPlanDetail(
  db: AnyDb,
  planId: number
): Promise<{ plan: InstallmentPlanDto; installments: InstallmentDto[] } | null> {
  const plan = await db.installmentPlan.findUnique({ where: { id: planId }, include: planInclude })
  if (!plan) return null
  return { plan: toPlanDto(plan), installments: plan.installments.map((i) => toInstallmentDto(i)) }
}
