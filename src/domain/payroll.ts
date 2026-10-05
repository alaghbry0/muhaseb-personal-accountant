/**
 * Domain — الموظفون والرواتب والمناديب (Task 4-b) ⭐
 * حضور يومي + سحبيات + مسير رواتب شهري + صرف عمولات المناديب — FR-06 / FR-07.
 * ذرّي بالكامل (db.$transaction)، مكتفٍ بذاته (يكتب cash_tx مباشرة بلا اعتماد على domain/cash.ts).
 *
 * ═══════════════ معادلات الرواتب (موثقة — تنعكس حرفياً في شاشة employees-payroll) ═══════════════
 * قيمة اليوم   : شهري = الراتب ÷ 30 | أسبوعي = ÷ 7 | يومي = × 1 (الراتب نفسه أجرة يوم).
 * الخصومات    : غائب = يوم كامل | نص يوم (half) = نصف يوم | إجازة (leave) = بلا خصم (مدفوعة).
 * التأخير      : كل 60 دقيقة تأخير = خصم نصف يوم، يقرَّب لربع يوم (0.25) وبحد أقصى يوم واحد للمرة الواحدة.
 *                lateDays_row = min(1, round¼(lateMinutes/60 × 0.5))
 * خصم الحضور   = absentDays×قيمة اليوم + halfDays×0.5×قيمة اليوم + lateDays×قيمة اليوم
 *                (يُخزَّن: absent_days = أيام الغياب الكاملة، late_deduction = قيمة خصم التأخير + أنصاف الأيام).
 * السحبيات    : كل السحبيات غير المخصومة حتى نهاية الشهر تُخصم من مسيره:
 *                unpaid = Σ(سحبيات الموظف بالأساس حتى نهاية الفترة) − Σ(advances_deducted لمسيرات «مدفوعة» سابقة ≤ الفترة)
 *                (تتبّع بالمبالغ لا بالبنود — بلا تغيير سكيما؛ المسيرات المدفوعة تاريخ غير قابل للتعديل FR-07-05).
 * الصافي       : preNet = الأساسي − خصم الحضور + المكافآت − خصومات أخرى
 *                advancesApplied = min(unpaid, max(0, preNet))  ← يضمن صافياً ≥ 0 ولا تضيع سحبية
 *                net = max(0, preNet − advancesApplied)
 *
 * cash_tx tx_type المستخدمة: employee_advance (سحبية) / salary_batch (صرف راتب، refType='salary_period')
 * / commission_payout (صرف عمولة، refType='commission' و refId=رقم المندوب).
 */
import type { Prisma, PrismaClient } from "@prisma/client"
import { round2, round4, toBase, fromBase } from "./money"
import { DomainError } from "./invoice-save"
import { resolveRate } from "./parties"

type Tx = Prisma.TransactionClient
type AnyDb = PrismaClient | Prisma.TransactionClient

// ═══════════════ أنواع ═══════════════

export type SalaryCycle = "monthly" | "weekly" | "daily"
export type AttendanceStatus = "present" | "absent" | "leave" | "late" | "half"

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "absent", "leave", "late", "half"]

export const CYCLE_LABELS: Record<SalaryCycle, string> = {
  monthly: "شهري",
  weekly: "أسبوعي",
  daily: "يومي",
}

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  present: "حاضر",
  absent: "غائب",
  leave: "إجازة",
  late: "تأخير",
  half: "نص يوم",
}

const DAY_DIVISOR: Record<SalaryCycle, number> = { monthly: 30, weekly: 7, daily: 1 }

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function currentPeriod(): string {
  return todayStr().slice(0, 7)
}

function isValidDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(new Date(day).getTime())
}

function isValidPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period)
}

/** آخر يوم في الشهر كنص YYYY-MM-DD */
export function periodEnd(period: string): string {
  const [y, m] = period.split("-").map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${period}-${String(last).padStart(2, "0")}`
}

function assertPeriod(period: string): void {
  if (!isValidPeriod(period)) throw new DomainError("صيغة الشهر غير صحيحة — استخدم YYYY-MM")
}

function quarterRound(n: number): number {
  return Math.round(n * 4) / 4
}

// ═══════════════ الموظفون (CRUD) ═══════════════

export interface EmployeePayload {
  name: string
  phone?: string | null
  role?: string | null
  salary: number
  salaryCycle: SalaryCycle
  hiredAt?: string | null
}

function validateEmployeePayload(p: EmployeePayload): void {
  if (!p.name?.trim()) throw new DomainError("اسم الموظف إلزامي")
  if (!(p.salary >= 0)) throw new DomainError("الراتب لا يمكن أن يكون سالباً")
  if (!DAY_DIVISOR[p.salaryCycle]) throw new DomainError("دورة الراتب غير صحيحة (شهري/أسبوعي/يومي)")
  if (p.hiredAt && !isValidDay(p.hiredAt)) throw new DomainError("صيغة تاريخ التعيين غير صحيحة")
}

export async function saveEmployee(db: AnyDb, payload: EmployeePayload) {
  validateEmployeePayload(payload)
  return db.employee.create({
    data: {
      name: payload.name.trim(),
      phone: payload.phone?.trim() || null,
      role: payload.role?.trim() || null,
      salary: round2(payload.salary),
      salaryCycle: payload.salaryCycle,
      hiredAt: payload.hiredAt || null,
    },
  })
}

export async function updateEmployee(
  db: AnyDb,
  id: number,
  payload: Partial<EmployeePayload> & { isArchived?: boolean }
) {
  const emp = await db.employee.findUnique({ where: { id } })
  if (!emp) throw new DomainError("الموظف غير موجود", 404)
  if (payload.name !== undefined && !payload.name.trim()) throw new DomainError("اسم الموظف إلزامي")
  if (payload.salary !== undefined && !(payload.salary >= 0)) throw new DomainError("الراتب لا يمكن أن يكون سالباً")
  if (payload.salaryCycle !== undefined && !DAY_DIVISOR[payload.salaryCycle]) {
    throw new DomainError("دورة الراتب غير صحيحة (شهري/أسبوعي/يومي)")
  }
  return db.employee.update({
    where: { id },
    data: {
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.phone !== undefined ? { phone: payload.phone?.trim() || null } : {}),
      ...(payload.role !== undefined ? { role: payload.role?.trim() || null } : {}),
      ...(payload.salary !== undefined ? { salary: round2(payload.salary) } : {}),
      ...(payload.salaryCycle !== undefined ? { salaryCycle: payload.salaryCycle } : {}),
      ...(payload.hiredAt !== undefined ? { hiredAt: payload.hiredAt || null } : {}),
      ...(payload.isArchived !== undefined ? { isArchived: payload.isArchived } : {}),
    },
  })
}

/** ملف الموظف للبطاقة: حضور الشهر الحالي + آخر السحبيات + مسيرات الرواتب */
export async function getEmployeeFile(db: AnyDb, employeeId: number, month?: string) {
  const emp = await db.employee.findUnique({ where: { id: employeeId } })
  if (!emp) throw new DomainError("الموظف غير موجود", 404)
  const m = month ?? todayStr().slice(0, 7)
  const [attendance, advances, periods, unpaidBase] = await Promise.all([
    db.attendance.findMany({
      where: { employeeId, day: { startsWith: `${m}-` } },
      orderBy: { day: "asc" },
    }),
    db.cashTx.findMany({
      where: { employeeId, txType: "employee_advance" },
      orderBy: [{ txDate: "desc" }, { id: "desc" }],
      take: 5,
      include: { currency: { select: { code: true } } },
    }),
    db.salaryPeriod.findMany({
      where: { employeeId },
      orderBy: { period: "desc" },
      take: 6,
    }),
    employeeUnpaidAdvancesBase(db, employeeId, currentPeriod()),
  ])
  return {
    employee: emp,
    month: m,
    attendance,
    advances,
    salaryPeriods: periods,
    unpaidAdvancesBase: unpaidBase,
  }
}

// ═══════════════ الحضور (حصّة يومية) ═══════════════

export interface AttendanceEntry {
  employeeId: number
  day: string
  status: AttendanceStatus
  lateMinutes?: number
  notes?: string | null
}

function validateEntry(e: AttendanceEntry): void {
  if (!isValidDay(e.day)) throw new DomainError("صيغة اليوم غير صحيحة — استخدم YYYY-MM-DD")
  if (!ATTENDANCE_STATUSES.includes(e.status)) {
    throw new DomainError("حالة الحضور غير صحيحة (حاضر/غائب/إجازة/تأخير/نص يوم)")
  }
  if (e.status === "late" && (e.lateMinutes ?? 0) <= 0) {
    throw new DomainError("أدخل دقائق التأخير (أكبر من صفر) عند اختيار «تأخير»")
  }
}

/** Upsert حالة موظف ليوم واحد (فريد employee+day) */
export async function markAttendance(db: AnyDb, e: AttendanceEntry) {
  validateEntry(e)
  return db.attendance.upsert({
    where: { employeeId_day: { employeeId: e.employeeId, day: e.day } },
    create: {
      employeeId: e.employeeId,
      day: e.day,
      status: e.status,
      lateMinutes: Math.max(0, Math.round(e.lateMinutes ?? 0)),
      notes: e.notes?.trim() || null,
    },
    update: {
      status: e.status,
      lateMinutes: Math.max(0, Math.round(e.lateMinutes ?? 0)),
      notes: e.notes?.trim() || null,
    },
  })
}

/** حفظ دفعة حضور يوم كامل — ذرّي */
export async function markAttendanceBatch(db: AnyDb, day: string, entries: Array<Omit<AttendanceEntry, "day">>) {
  if (!isValidDay(day)) throw new DomainError("صيغة اليوم غير صحيحة — استخدم YYYY-MM-DD")
  if (!entries.length) throw new DomainError("لا توجد حالات للحفظ")
  return db.$transaction(async (tx) => {
    const saved: number[] = []
    for (const e of entries) {
      const row = await markAttendance(tx, { ...e, day })
      saved.push(row.id)
    }
    return { saved: saved.length, day }
  })
}

/** حصة يومية: كل الموظفين النشطين + حالتهم في اليوم (بلا تسجيل = null) */
export async function getAttendanceDay(db: AnyDb, day: string) {
  if (!isValidDay(day)) throw new DomainError("صيغة اليوم غير صحيحة — استخدم YYYY-MM-DD")
  const [employees, rows] = await Promise.all([
    db.employee.findMany({ where: { isArchived: false }, orderBy: { id: "asc" } }),
    db.attendance.findMany({ where: { day } }),
  ])
  const byEmp = new Map(rows.map((r) => [r.employeeId, r]))
  const merged = employees.map((e) => {
    const r = byEmp.get(e.id)
    return {
      employeeId: e.id,
      name: e.name,
      role: e.role,
      status: (r?.status ?? null) as AttendanceStatus | null,
      lateMinutes: r?.lateMinutes ?? 0,
      notes: r?.notes ?? null,
    }
  })
  const summary = { present: 0, absent: 0, leave: 0, late: 0, half: 0, marked: 0 }
  for (const r of merged) {
    if (!r.status) continue
    summary.marked += 1
    summary[r.status] += 1
  }
  return { day, rows: merged, summary, employeesCount: employees.length }
}

// ═══════════════ السحبيات (سلف تُخصم من الراتب) ═══════════════

export interface AdvancePayload {
  employeeId: number
  amount: number
  cashboxId: number
  currencyId?: number | null
  exchangeRate?: number | null
  txDate: string
  description?: string | null
  /** للـ seed فقط */
  createdAt?: string
}

/** صرف سحبية من صندوق — ذرّي: cash_tx(tx_type=employee_advance) وتُخصم من مسير الشهر */
export async function saveAdvance(db: AnyDb, payload: AdvancePayload) {
  if (!isValidDay(payload.txDate)) throw new DomainError("صيغة تاريخ السحبية غير صحيحة")
  if (!(payload.amount > 0)) throw new DomainError("مبلغ السحبية يجب أن يكون أكبر من صفر")
  return db.$transaction(async (tx) => {
    const emp = await tx.employee.findUnique({ where: { id: payload.employeeId } })
    if (!emp) throw new DomainError("الموظف غير موجود", 404)
    if (emp.isArchived) throw new DomainError("لا يمكن صرف سحبية لموظف مؤرشف")
    const box = await tx.cashbox.findUnique({ where: { id: payload.cashboxId } })
    if (!box || box.isArchived) throw new DomainError("الصندوق غير موجود أو مؤرشف")
    const rate = await resolveRate(tx, payload.currencyId ?? box.currencyId, payload.exchangeRate ?? null, payload.txDate)
    if (rate.id !== box.currencyId) {
      throw new DomainError("عملة الصرف لا توافق عملة الصندوق — اختر صندوقاً بعملة العملية")
    }
    const cashTx = await tx.cashTx.create({
      data: {
        txType: "employee_advance",
        cashboxId: box.id,
        currencyId: rate.id,
        amount: round2(payload.amount),
        exchangeRate: rate.rate,
        txDate: payload.txDate,
        refType: "advance",
        refId: null,
        employeeId: emp.id,
        description: payload.description?.trim() || `سحبية من الراتب — ${emp.name}`,
        ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      },
    })
    return {
      advance: {
        id: cashTx.id,
        employeeId: emp.id,
        employeeName: emp.name,
        amount: cashTx.amount,
        currencyId: rate.id,
        amountBase: toBase(cashTx.amount, rate.rate),
        txDate: cashTx.txDate,
        description: cashTx.description,
      },
    }
  })
}

/**
 * السحبيات غير المخصومة (بالأساس) حتى نهاية فترة «YYYY-MM»:
 * Σ(سحبيات حتى نهاية الفترة) − Σ(advances_deducted للمسيرات المدفوعة ≤ الفترة).
 */
export async function employeeUnpaidAdvancesBase(
  db: AnyDb,
  employeeId: number,
  period: string
): Promise<number> {
  assertPeriod(period)
  const end = periodEnd(period)
  const [advances, deducted] = await Promise.all([
    db.cashTx.findMany({
      where: { employeeId, txType: "employee_advance", txDate: { lte: end } },
      select: { amount: true, exchangeRate: true },
    }),
    db.salaryPeriod.aggregate({
      _sum: { advancesDeducted: true },
      where: { employeeId, status: "paid", period: { lte: period } },
    }),
  ])
  const issued = advances.reduce((s, a) => s + toBase(a.amount, a.exchangeRate), 0)
  return round2(Math.max(0, issued - (deducted._sum.advancesDeducted ?? 0)))
}

/** قائمة السحبيات + أرصدة غير مخصومة لكل الموظفين النشطين */
export async function listAdvances(
  db: AnyDb,
  filters: { employeeId?: number; from?: string; to?: string; limit?: number } = {}
) {
  const where = {
    txType: "employee_advance" as const,
    ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
    ...(filters.from || filters.to
      ? {
          txDate: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  }
  const [rows, employees] = await Promise.all([
    db.cashTx.findMany({
      where,
      orderBy: [{ txDate: "desc" }, { id: "desc" }],
      take: Math.min(200, filters.limit ?? 50),
      include: {
        employee: { select: { id: true, name: true, role: true } },
        currency: { select: { code: true } },
        cashbox: { select: { id: true, name: true } },
      },
    }),
    db.employee.findMany({ where: { isArchived: false }, orderBy: { id: "asc" } }),
  ])
  const period = currentPeriod()
  const balances = await Promise.all(
    employees.map(async (e) => ({
      employeeId: e.id,
      name: e.name,
      unpaidBase: await employeeUnpaidAdvancesBase(db, e.id, period),
    }))
  )
  return {
    advances: rows.map((r) => ({
      id: r.id,
      txDate: r.txDate,
      employeeId: r.employeeId,
      employeeName: r.employee?.name ?? "—",
      amount: r.amount,
      currencyCode: r.currency.code,
      exchangeRate: r.exchangeRate,
      amountBase: toBase(r.amount, r.exchangeRate),
      description: r.description,
      cashboxName: r.cashbox?.name ?? "—",
    })),
    balances,
  }
}

// ═══════════════ حساب مسير الرواتب (رياضيات نقية) ═══════════════

export interface PayrollCalcInput {
  salary: number
  salaryCycle: SalaryCycle
  /** صفوف حضور الشهر [{status, lateMinutes}] */
  rows: Array<{ status: AttendanceStatus; lateMinutes?: number }>
  bonus: number
  otherDeduction: number
  /** السحبيات غير المخصومة المتاحة للخصم */
  unpaidAdvances: number
}

export interface PayrollCalcLine {
  divisor: number
  dayValue: number
  absentDays: number
  halfDays: number
  lateDays: number
  absentDeduction: number
  halfDeduction: number
  lateDeduction: number
  /** إجمالي خصم الحضور (غياب + نص + تأخير) */
  attendanceDeduction: number
  /** ما يُخزَّن في عمود late_deduction: خصم التأخير + أنصاف الأيام */
  lateDeductionStored: number
  bonus: number
  otherDeduction: number
  unpaidAdvances: number
  advancesApplied: number
  net: number
}

export function calcPayrollLine(input: PayrollCalcInput): PayrollCalcLine {
  const divisor = DAY_DIVISOR[input.salaryCycle] ?? 30
  const dayValue = round2(input.salary / divisor)
  let absentDays = 0
  let halfDays = 0
  let lateDays = 0
  for (const r of input.rows) {
    if (r.status === "absent") absentDays += 1
    else if (r.status === "half") halfDays += 1
    else if (r.status === "late") {
      lateDays += Math.min(1, quarterRound((Math.max(0, r.lateMinutes ?? 0) / 60) * 0.5))
    }
  }
  const absentDeduction = round2(absentDays * dayValue)
  const halfDeduction = round2(halfDays * 0.5 * dayValue)
  const lateDeduction = round2(lateDays * dayValue)
  const attendanceDeduction = round2(absentDeduction + halfDeduction + lateDeduction)
  const preNet = round2(input.salary - attendanceDeduction + input.bonus - input.otherDeduction)
  const advancesApplied = round2(Math.min(Math.max(0, input.unpaidAdvances), Math.max(0, preNet)))
  const net = Math.max(0, round2(preNet - advancesApplied))
  return {
    divisor,
    dayValue,
    absentDays,
    halfDays,
    lateDays,
    absentDeduction,
    halfDeduction,
    lateDeduction,
    attendanceDeduction,
    lateDeductionStored: round2(halfDeduction + lateDeduction),
    bonus: round2(input.bonus),
    otherDeduction: round2(input.otherDeduction),
    unpaidAdvances: round2(input.unpaidAdvances),
    advancesApplied,
    net,
  }
}

// ─── تجميع بيانات سطر موظف داخل الفترة ───

interface EmployeePayrollRow {
  employeeId: number
  name: string
  role: string | null
  salary: number
  salaryCycle: SalaryCycle
  calc: PayrollCalcLine
  /** حالة المسير الموجود: draft|paid|null */
  existingStatus: "draft" | "paid" | null
}

async function computePeriodRows(
  db: AnyDb,
  period: string,
  lines: Array<{ employeeId: number; bonus?: number; otherDeduction?: number }> = []
): Promise<EmployeePayrollRow[]> {
  assertPeriod(period)
  const employees = await db.employee.findMany({ where: { isArchived: false }, orderBy: { id: "asc" } })
  const rows: EmployeePayrollRow[] = []
  for (const emp of employees) {
    const [attRows, existing] = await Promise.all([
      db.attendance.findMany({
        where: { employeeId: emp.id, day: { startsWith: `${period}-` } },
        select: { status: true, lateMinutes: true },
      }),
      db.salaryPeriod.findUnique({ where: { employeeId_period: { employeeId: emp.id, period } } }),
    ])
    const line = lines.find((l) => l.employeeId === emp.id)
    // القيم اليدوية: من الطلب، وإلا من المسودة الموجودة (حتى لا تضيع عند إعادة التوليد)، وإلا صفر
    const bonus = line?.bonus ?? existing?.bonus ?? 0
    const otherDeduction = line?.otherDeduction ?? existing?.otherDeduction ?? 0
    const unpaid = await employeeUnpaidAdvancesBase(db, emp.id, period)
    const calc = calcPayrollLine({
      salary: emp.salary,
      salaryCycle: emp.salaryCycle as SalaryCycle,
      rows: attRows.map((r) => ({ status: r.status as AttendanceStatus, lateMinutes: r.lateMinutes })),
      bonus,
      otherDeduction,
      unpaidAdvances: unpaid,
    })
    rows.push({
      employeeId: emp.id,
      name: emp.name,
      role: emp.role,
      salary: emp.salary,
      salaryCycle: emp.salaryCycle as SalaryCycle,
      calc,
      existingStatus: (existing?.status as "draft" | "paid" | null) ?? null,
    })
  }
  return rows
}

function payrollTotals(rows: EmployeePayrollRow[]) {
  return {
    employees: rows.length,
    gross: round2(rows.reduce((s, r) => s + r.salary, 0)),
    attendanceDeduction: round2(rows.reduce((s, r) => s + r.calc.attendanceDeduction, 0)),
    bonus: round2(rows.reduce((s, r) => s + r.calc.bonus, 0)),
    otherDeduction: round2(rows.reduce((s, r) => s + r.calc.otherDeduction, 0)),
    advances: round2(rows.reduce((s, r) => s + r.calc.advancesApplied, 0)),
    net: round2(rows.reduce((s, r) => s + r.calc.net, 0)),
  }
}

/** معاينة المسير — حساب فقط بلا كتابة (الشاشة تعدّل المكافآت/الخصومات ثم تولّد) */
export async function previewPayroll(db: AnyDb, period: string) {
  const rows = await computePeriodRows(db, period)
  return { period, rows, totals: payrollTotals(rows) }
}

/** توليد/تحديث مسودة المسير (UNIQUE employee+period) — لا يمس المسيرات المدفوعة */
export async function generatePayroll(
  db: AnyDb,
  payload: { period: string; lines?: Array<{ employeeId: number; bonus?: number; otherDeduction?: number }> }
) {
  assertPeriod(payload.period)
  const rows = await computePeriodRows(db, payload.period, payload.lines ?? [])
  return db.$transaction(async (tx) => {
    for (const r of rows) {
      if (r.existingStatus === "paid") continue // تاريخ مدفوع غير قابل للتعديل (FR-07-05)
      await tx.salaryPeriod.upsert({
        where: { employeeId_period: { employeeId: r.employeeId, period: payload.period } },
        create: {
          employeeId: r.employeeId,
          period: payload.period,
          baseSalary: r.salary,
          absentDays: r.calc.absentDays,
          lateDeduction: r.calc.lateDeductionStored,
          bonus: r.calc.bonus,
          otherDeduction: r.calc.otherDeduction,
          advancesDeducted: r.calc.advancesApplied,
          netSalary: r.calc.net,
          status: "draft",
        },
        update: {
          baseSalary: r.salary,
          absentDays: r.calc.absentDays,
          lateDeduction: r.calc.lateDeductionStored,
          bonus: r.calc.bonus,
          otherDeduction: r.calc.otherDeduction,
          advancesDeducted: r.calc.advancesApplied,
          netSalary: r.calc.net,
        },
      })
    }
    return {
      period: payload.period,
      rows: rows.map((r) => ({ ...r, existingStatus: r.existingStatus === "paid" ? "paid" : "draft" })),
      totals: payrollTotals(rows),
    }
  })
}

/**
 * صرف المسير: يعتمد المسيرات (يُعيد حساب الغياب/التأخير/السحبيات لحظة الصرف مع المكافآت
 * والخصومات المطلوبة) + cash_tx واحدة لكل موظف (salary_batch) من الصندوق → status=paid.
 * ذرّي بالكامل. الموظف صافيه 0 يُعتمد بلا حركة صندوق.
 */
export async function commitPayroll(
  db: AnyDb,
  payload: {
    period: string
    lines?: Array<{ employeeId: number; bonus?: number; otherDeduction?: number }>
    cashboxId: number
    currencyId?: number | null
    exchangeRate?: number | null
    txDate: string
    /** للـ seed فقط */
    createdAt?: string
  }
) {
  assertPeriod(payload.period)
  if (!isValidDay(payload.txDate)) throw new DomainError("صيغة تاريخ الصرف غير صحيحة")
  return db.$transaction(async (tx) => {
    const box = await tx.cashbox.findUnique({ where: { id: payload.cashboxId } })
    if (!box || box.isArchived) throw new DomainError("الصندوق غير موجود أو مؤرشف")
    const rate = await resolveRate(tx, payload.currencyId ?? box.currencyId, payload.exchangeRate ?? null, payload.txDate)
    if (rate.id !== box.currencyId) {
      throw new DomainError("عملة الصرف لا توافق عملة الصندوق — اختر صندوقاً بعملة العملية")
    }
    const rows = await computePeriodRows(tx, payload.period, payload.lines ?? [])
    const drafts = rows.filter((r) => r.existingStatus !== "paid")
    if (drafts.length === 0) {
      throw new DomainError("مسير هذا الشهر مصروف فعلاً ولا يمكن صرفه مرتين", 400)
    }
    const paidRows: Array<{
      employeeId: number
      name: string
      period: string
      net: number
      cashTxId: number | null
      cashAmount: number
    }> = []
    let totalNet = 0
    for (const r of drafts) {
      const net = r.calc.net
      totalNet = round2(totalNet + net)
      let cashTxId: number | null = null
      if (net > 0) {
        const cashTx = await tx.cashTx.create({
          data: {
            txType: "salary_batch",
            cashboxId: box.id,
            currencyId: rate.id,
            amount: fromBase(net, rate.rate),
            exchangeRate: rate.rate,
            txDate: payload.txDate,
            refType: "salary_period",
            refId: null, // يُربط بصف المسير بعد إنشائه/اعتماده أدناه
            employeeId: r.employeeId,
            description: `صرف راتب ${payload.period} — ${r.name}`,
            ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
          },
        })
        cashTxId = cashTx.id
      }
      const saved = await tx.salaryPeriod.upsert({
        where: { employeeId_period: { employeeId: r.employeeId, period: payload.period } },
        create: {
          employeeId: r.employeeId,
          period: payload.period,
          baseSalary: r.salary,
          absentDays: r.calc.absentDays,
          lateDeduction: r.calc.lateDeductionStored,
          bonus: r.calc.bonus,
          otherDeduction: r.calc.otherDeduction,
          advancesDeducted: r.calc.advancesApplied,
          netSalary: net,
          status: "paid",
          paidAt: payload.txDate,
          cashTxId,
        },
        update: {
          baseSalary: r.salary,
          absentDays: r.calc.absentDays,
          lateDeduction: r.calc.lateDeductionStored,
          bonus: r.calc.bonus,
          otherDeduction: r.calc.otherDeduction,
          advancesDeducted: r.calc.advancesApplied,
          netSalary: net,
          status: "paid",
          paidAt: payload.txDate,
          cashTxId,
        },
      })
      if (cashTxId) {
        await tx.cashTx.update({ where: { id: cashTxId }, data: { refId: saved.id } })
      }
      paidRows.push({
        employeeId: r.employeeId,
        name: r.name,
        period: payload.period,
        net,
        cashTxId,
        cashAmount: cashTxId ? fromBase(net, rate.rate) : 0,
      })
    }
    return {
      period: payload.period,
      paid: paidRows.length,
      totalNet: round2(totalNet),
      currencyId: rate.id,
      cashbox: { id: box.id, name: box.name },
      rows: paidRows,
    }
  })
}

/** سجل مسيرات الرواتب: لشهر معين (بنوده) أو ملخص كل الأشهر */
export async function getPayrollHistory(db: AnyDb, period?: string) {
  if (period) {
    assertPeriod(period)
    const rows = await db.salaryPeriod.findMany({
      where: { period },
      orderBy: { employeeId: "asc" },
      include: { employee: { select: { id: true, name: true, role: true } } },
    })
    return {
      period,
      rows: rows.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: r.employee?.name ?? "—",
        role: r.employee?.role ?? null,
        baseSalary: r.baseSalary,
        absentDays: r.absentDays,
        lateDeduction: r.lateDeduction,
        bonus: r.bonus,
        otherDeduction: r.otherDeduction,
        advancesDeducted: r.advancesDeducted,
        netSalary: r.netSalary,
        status: r.status,
        paidAt: r.paidAt,
      })),
      totals: {
        employees: rows.length,
        net: round2(rows.reduce((s, r) => s + r.netSalary, 0)),
        paid: rows.every((r) => r.status === "paid"),
      },
    }
  }
  const grouped = await db.salaryPeriod.groupBy({
    by: ["period", "status"],
    _count: { _all: true },
    _sum: { netSalary: true },
    orderBy: { period: "desc" },
  })
  const periods = new Map<
    string,
    { period: string; employees: number; net: number; status: "draft" | "paid" | "mixed" }
  >()
  for (const g of grouped) {
    const cur = periods.get(g.period) ?? {
      period: g.period,
      employees: 0,
      net: 0,
      status: g.status === "paid" ? "paid" : "draft",
    }
    cur.employees += g._count._all
    cur.net = round2(cur.net + (g._sum.netSalary ?? 0))
    if (cur.status !== g.status) cur.status = "mixed"
    periods.set(g.period, cur)
  }
  return { periods: [...periods.values()] }
}

// ═══════════════ المناديب: حساب المندوب وصرف العمولات ═══════════════

export interface RepAccountFilters {
  repId: number
  from?: string
  to?: string
}

/** حساب المندوب (FR-06-03): مبيعاته + مرتجعاته + تحصيلاته + عمولاته المستحقة/المدفوعة = صافي المستحق */
export async function repAccount(db: AnyDb, filters: RepAccountFilters) {
  const rep = await db.salesRep.findUnique({ where: { id: filters.repId } })
  if (!rep) throw new DomainError("المندوب غير موجود", 404)
  const from = filters.from && isValidDay(filters.from) ? filters.from : "0000-01-01"
  const to = filters.to && isValidDay(filters.to) ? filters.to : "9999-12-31"
  const toDateEnd = new Date(`${to}T23:59:59.999Z`)

  const [salesAgg, salesCount, returnsAgg, returnsCount, commissions, dueAgg, paidAgg] = await Promise.all([
    db.invoice.aggregate({
      _sum: { totalBase: true },
      where: {
        salesRepId: rep.id,
        docType: "sale",
        status: "completed",
        issuedAt: { gte: from, lte: to },
      },
    }),
    db.invoice.count({
      where: {
        salesRepId: rep.id,
        docType: "sale",
        status: "completed",
        issuedAt: { gte: from, lte: to },
      },
    }),
    db.invoice.aggregate({
      _sum: { totalBase: true },
      where: {
        salesRepId: rep.id,
        docType: "sale_return",
        status: "completed",
        issuedAt: { gte: from, lte: to },
      },
    }),
    db.invoice.count({
      where: {
        salesRepId: rep.id,
        docType: "sale_return",
        status: "completed",
        issuedAt: { gte: from, lte: to },
      },
    }),
    db.commission.findMany({
      where: { salesRepId: rep.id, createdAt: { gte: new Date(`${from}T00:00:00.000Z`), lte: toDateEnd } },
      orderBy: { id: "desc" },
      take: 100,
    }),
    db.commission.aggregate({ _sum: { amount: true }, _count: true, where: { salesRepId: rep.id, status: "due" } }),
    db.commission.aggregate({ _sum: { amount: true }, where: { salesRepId: rep.id, status: "paid" } }),
  ])

  const salesComm = commissions.filter((c) => c.refType === "invoice")
  const collectComm = commissions.filter((c) => c.refType === "collection")
  const commissionDue = round2(dueAgg._sum.amount ?? 0)

  return {
    rep: {
      id: rep.id,
      name: rep.name,
      phone: rep.phone,
      commissionType: rep.commissionType,
      commissionPercent: rep.commissionPercent,
      areas: rep.areas,
      isArchived: rep.isArchived,
    },
    range: { from: filters.from ?? null, to: filters.to ?? null },
    performance: {
      salesCount,
      salesTotalBase: round4(salesAgg._sum.totalBase ?? 0),
      returnsCount,
      returnsTotalBase: round4(returnsAgg._sum.totalBase ?? 0),
      collectionsCount: collectComm.length,
      collectionsBase: round4(collectComm.reduce((s, c) => s + c.baseAmount, 0)),
      commissionsCount: commissions.length,
      commissionsAmount: round2(commissions.reduce((s, c) => s + c.amount, 0)),
    },
    commissions: {
      dueCount: dueAgg._count,
      due: commissionDue,
      paid: round2(paidAgg._sum.amount ?? 0),
      /** صافي المستحق = العمولات المستحقة (لا سحبيات للمناديب في هذه النسخة) */
      netDue: commissionDue,
    },
    dueList: commissions
      .filter((c) => c.status === "due")
      .map((c) => ({
        id: c.id,
        refType: c.refType,
        refId: c.refId,
        baseAmount: c.baseAmount,
        percent: c.percent,
        amount: c.amount,
        createdAt: c.createdAt.toISOString(),
      })),
    recentSalesCount: salesComm.length,
  }
}

/** صرف عمولات مندوب — ذرّي: تعليم العمولات مدفوعة + cash_tx(commission_payout) */
export async function payCommission(
  db: AnyDb,
  payload: {
    repId: number
    commissionIds?: number[]
    all?: boolean
    cashboxId: number
    currencyId?: number | null
    exchangeRate?: number | null
    txDate: string
    /** للـ seed فقط */
    createdAt?: string
  }
) {
  if (!isValidDay(payload.txDate)) throw new DomainError("صيغة تاريخ الصرف غير صحيحة")
  return db.$transaction(async (tx) => {
    const rep = await tx.salesRep.findUnique({ where: { id: payload.repId } })
    if (!rep) throw new DomainError("المندوب غير موجود", 404)
    if (rep.isArchived) throw new DomainError("لا يمكن صرف عمولات لمندوب مؤرشف")
    const box = await tx.cashbox.findUnique({ where: { id: payload.cashboxId } })
    if (!box || box.isArchived) throw new DomainError("الصندوق غير موجود أو مؤرشف")
    const rate = await resolveRate(tx, payload.currencyId ?? box.currencyId, payload.exchangeRate ?? null, payload.txDate)
    if (rate.id !== box.currencyId) {
      throw new DomainError("عملة الصرف لا توافق عملة الصندوق — اختر صندوقاً بعملة العملية")
    }

    let commissions: Array<{ id: number; amount: number; refType: string; refId: number }>
    if (payload.commissionIds?.length) {
      const rows = await tx.commission.findMany({
        where: { id: { in: payload.commissionIds }, salesRepId: rep.id },
      })
      const invalid = rows.find((r) => r.status === "paid")
      if (invalid) throw new DomainError("إحدى العمولات المحددة مصروفة مسبقاً")
      if (rows.length !== payload.commissionIds.length) {
        throw new DomainError("إحدى العمولات المحددة لا تخص هذا المندوب")
      }
      commissions = rows.map((r) => ({ id: r.id, amount: r.amount, refType: r.refType, refId: r.refId }))
    } else {
      const rows = await tx.commission.findMany({ where: { salesRepId: rep.id, status: "due" } })
      commissions = rows.map((r) => ({ id: r.id, amount: r.amount, refType: r.refType, refId: r.refId }))
    }
    if (commissions.length === 0) throw new DomainError("لا عمولات مستحقة للصرف لهذا المندوب")

    const amountBase = round2(commissions.reduce((s, c) => s + c.amount, 0))
    if (amountBase <= 0) throw new DomainError("قيمة العمولات المحددة صفر")

    const cashTx = await tx.cashTx.create({
      data: {
        txType: "commission_payout",
        cashboxId: box.id,
        currencyId: rate.id,
        amount: fromBase(amountBase, rate.rate),
        exchangeRate: rate.rate,
        txDate: payload.txDate,
        refType: "commission",
        refId: rep.id,
        employeeId: null,
        description: `صرف عمولات — ${rep.name} (${commissions.length} عمولة)`,
        ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      },
    })
    await tx.commission.updateMany({
      where: { id: { in: commissions.map((c) => c.id) } },
      data: { status: "paid", payoutTxId: cashTx.id },
    })
    return {
      repId: rep.id,
      repName: rep.name,
      paidCount: commissions.length,
      amountBase,
      currencyId: rate.id,
      cashAmount: cashTx.amount,
      cashTxId: cashTx.id,
      remainingDue: round2(
        (await tx.commission.aggregate({
          _sum: { amount: true },
          where: { salesRepId: rep.id, status: "due" },
        }))._sum.amount ?? 0
      ),
    }
  })
}
