/**
 * Domain — الخزينة والنقدية (Task 4-a) — FR-04 + FR-08.
 *
 * ═══════════════ اتفاقية اتجاه الحركات (موثقة للجميع) ═══════════════
 * الرصيد يُحسب بعملة الصندوق نفسه. لكل حركة cash_tx جانبان:
 *   • cashbox_id  = الصندوق «الرئيسي» للحركة.
 *   • to_cashbox_id = الطرف المقابل (للتحويل/البنكي فقط).
 * خريطة الإشارة (من منظور صندوق النقدية — متسقة مع /api/dashboard):
 *   قبض receipt / افتتاحي opening / سحب بنكي bank_withdraw  ← داخل (+)
 *     • سحب بنكي: النقد يدخل صندوق cashbox_id قادماً من البنك
 *       (to_cashbox_id = صندوق البنك إن وُجد فيُخصم منه).
 *   صرف payment / مصروف expense / سحبية employee_advance / عمولة
 *   commission_payout / إيداع بنكي bank_deposit / رواتب salary_batch ← خارج (−)
 *     • إيداع بنكي: النقد يخرج من صندوق cashbox_id إلى البنك
 *       (to_cashbox_id = صندوق البنك إن وُجد فيُضاف له).
 *   تحويل box_transfer: يخرج من cashbox_id (−) ويدخل to_cashbox_id (+).
 *   سندات 3-b (refType='voucher') والفواتير (refType='invoice') والأقساط
 *   (refType='installment') كلها txType receipt/payment — تدخل في الرصيد طبيعياً.
 * ملاحظة: تعليمة المهمة الأصلية اعتبرت إيداع/سحب بنكي من منظور «حساب البنك»
 * (إيداع=+)؛ اعتمدنا منظور صندوق النقدية للاتساق مع dashboard المُسلَّم
 * (IN= receipt+bank_withdraw / OUT= …+bank_deposit) ولصحة UX بلا صندوق بنك.
 * ═════════════════════════════════════════════════════════════════════
 */
import type { Prisma, PrismaClient } from "@prisma/client"
import { round2, round4, toBase } from "./money"
import { DomainError } from "./invoice-save"
import { todayStr } from "./parties"

type Tx = Prisma.TransactionClient
type AnyDb = PrismaClient | Prisma.TransactionClient

// ─── الأنواع والتسميات ───

export type CashTxType =
  | "receipt"
  | "payment"
  | "expense"
  | "employee_advance"
  | "commission_payout"
  | "box_transfer"
  | "bank_deposit"
  | "bank_withdraw"
  | "salary_batch"
  | "opening"

export const CASH_TX_TYPES: CashTxType[] = [
  "receipt",
  "payment",
  "expense",
  "employee_advance",
  "commission_payout",
  "box_transfer",
  "bank_deposit",
  "bank_withdraw",
  "salary_batch",
  "opening",
]

export const TX_TYPE_LABELS: Record<CashTxType, string> = {
  receipt: "قبض",
  payment: "صرف",
  expense: "مصروف",
  employee_advance: "سحبية موظف",
  commission_payout: "صرف عمولة",
  box_transfer: "تحويل بين صندوقين",
  bank_deposit: "إيداع بنكي",
  bank_withdraw: "سحب بنكي",
  salary_batch: "مسير رواتب",
  opening: "رصيد افتتاحي",
}

/** إشارة الحركة على جانب cashbox_id (داخل +1 / خارج −1 / محايد 0) */
const SIGN_CASHBOX: Record<CashTxType, number> = {
  receipt: 1,
  opening: 1,
  bank_withdraw: 1,
  payment: -1,
  expense: -1,
  employee_advance: -1,
  commission_payout: -1,
  bank_deposit: -1,
  salary_batch: -1,
  box_transfer: -1,
}

/** إشارة الحركة على جانب to_cashbox_id (لا معنى له إلا للتحويل/البنكي) */
const SIGN_TO: Partial<Record<CashTxType, number>> = {
  box_transfer: 1,
  bank_deposit: 1, // البنك يستقبل الإيداع
  bank_withdraw: -1, // البنك يخرج منه المسحوب
}

/** أنواع الحركات الخارجة من صندوق cashbox_id — تُفحص ضد السالب */
export function isOutflowOnCashbox(txType: string): boolean {
  return SIGN_CASHBOX[txType as CashTxType] === -1
}

// ─── أسعار الصرف المساعدة ───

/** أفضل سعر متاح لعملة عند تاريخ معين (ليومه، أو آخر سعر ≤ التاريخ، أو الأحدث مطلقاً) */
export async function rateAt(
  tx: Tx,
  currencyId: number,
  date: string
): Promise<number> {
  const currency = await tx.currency.findUnique({ where: { id: currencyId } })
  if (!currency) throw new DomainError("العملة غير موجودة")
  if (currency.isBase) return 1
  const rows = await tx.exchangeRate.findMany({
    where: { currencyId },
    orderBy: { rateDate: "desc" },
    select: { rateDate: true, rate: true },
  })
  if (rows.length === 0) return 1
  const exact = rows.find((r) => r.rateDate === date)
  if (exact) return exact.rate
  const before = rows.find((r) => r.rateDate < date)
  return before?.rate ?? rows[0].rate
}

// ─── أرصدة الصناديق ───

export interface CashboxBalanceRow {
  id: number
  name: string
  currencyId: number
  currencyCode: string
  isDefault: boolean
  /** الرصيد بعملة الصندوق */
  balance: number
  /** الرصيد محوّلاً للعملة الأساسية */
  balanceBase: number
  lastTxDate: string | null
  txCount: number
}

/**
 * رصيد صندوق واحد بعملته — Σ(حركات بعملة الصندوق أو محوّلة إليها).
 * الحركات بعملة غير عملة الصندوق تُحوَّل: المبلغ×سعره → الأساس → ÷ سعر عملة الصندوق.
 * (الكتابة تمنع أصلاً عدم التطابق إلا في تحويل/بنكي بين صندوقين بعملتين مختلفتين.)
 */
export async function computeCashboxBalance(tx: Tx, cashboxId: number): Promise<number> {
  const box = await tx.cashbox.findUnique({
    where: { id: cashboxId },
    include: { currency: true },
  })
  if (!box) throw new DomainError("الصندوق غير موجود")
  const rows = await tx.cashTx.findMany({
    where: { OR: [{ cashboxId }, { toCashboxId: cashboxId }] },
    select: {
      txType: true,
      cashboxId: true,
      toCashboxId: true,
      currencyId: true,
      amount: true,
      exchangeRate: true,
      txDate: true,
    },
  })
  let balance = 0
  for (const r of rows) {
    const sign =
      r.cashboxId === cashboxId
        ? (SIGN_CASHBOX[r.txType as CashTxType] ?? 0)
        : r.toCashboxId === cashboxId
          ? (SIGN_TO[r.txType as CashTxType] ?? 0)
          : 0
    if (sign === 0) continue
    let amount = r.amount
    if (r.currencyId !== box.currencyId) {
      // حولة عملة الحركة → الأساس → عملة الصندوق
      const boxRate = await rateAt(tx, box.currencyId, r.txDate)
      if (boxRate <= 0) continue
      amount = (r.amount * (r.exchangeRate || 1)) / boxRate
    }
    balance += sign * amount
  }
  return round2(balance)
}

/** كل الصناديق بأرصدتها الحية + الإجمالي بالأساس */
export async function listCashboxesWithBalances(db: PrismaClient) {
  return db.$transaction(async (tx) => {
    const boxes = await tx.cashbox.findMany({
      where: { isArchived: false },
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      include: { currency: true },
    })
    const out: CashboxBalanceRow[] = []
    for (const b of boxes) {
      const [balance, last, count] = await Promise.all([
        computeCashboxBalance(tx, b.id),
        tx.cashTx.findFirst({
          where: { OR: [{ cashboxId: b.id }, { toCashboxId: b.id }] },
          orderBy: [{ txDate: "desc" }, { id: "desc" }],
          select: { txDate: true },
        }),
        tx.cashTx.count({ where: { OR: [{ cashboxId: b.id }, { toCashboxId: b.id }] } }),
      ])
      out.push({
        id: b.id,
        name: b.name,
        currencyId: b.currencyId,
        currencyCode: b.currency.code,
        isDefault: b.isDefault,
        balance,
        balanceBase: round2(toBase(balance, b.currency.isBase ? 1 : await rateAt(tx, b.currencyId, todayStr()))),
        lastTxDate: last?.txDate ?? null,
        txCount: count,
      })
    }
    const totalBase = round2(out.reduce((s, b) => s + b.balanceBase, 0))
    return { cashboxes: out, totalBase }
  })
}

// ─── حفظ حركة نقدية ───

export interface SaveCashTxPayload {
  txType: CashTxType
  cashboxId: number
  toCashboxId?: number | null
  currencyId?: number | null
  exchangeRate?: number | null
  amount: number
  txDate?: string
  description?: string | null
  expenseCategoryId?: number | null
  employeeId?: number | null
  customerId?: number | null
  supplierId?: number | null
  refType?: string | null
  refId?: number | null
}

export interface CashTxDto {
  id: number
  txType: string
  txTypeLabel: string
  cashboxId: number
  cashboxName: string
  toCashboxId: number | null
  toCashboxName: string | null
  currencyId: number
  currencyCode: string
  amount: number
  exchangeRate: number
  amountBase: number
  txDate: string
  refType: string | null
  refId: number | null
  expenseCategoryId: number | null
  expenseCategoryName: string | null
  employeeId: number | null
  employeeName: string | null
  customerId: number | null
  customerName: string | null
  supplierId: number | null
  supplierName: string | null
  description: string | null
  /** إشارة العرض: داخل (+1) / خارج (−1) */
  direction: number
  createdAt: string
}

const txInclude = {
  cashbox: { select: { name: true } },
  toCashbox: { select: { name: true } },
  currency: { select: { code: true } },
  expenseCategory: { select: { name: true } },
  employee: { select: { name: true } },
  customer: { select: { name: true } },
  supplier: { select: { name: true } },
} satisfies Prisma.CashTxInclude

type TxRow = Prisma.CashTxGetPayload<{ include: typeof txInclude }>

export function toCashTxDto(r: TxRow): CashTxDto {
  return {
    id: r.id,
    txType: r.txType,
    txTypeLabel: TX_TYPE_LABELS[r.txType as CashTxType] ?? r.txType,
    cashboxId: r.cashboxId,
    cashboxName: r.cashbox.name,
    toCashboxId: r.toCashboxId,
    toCashboxName: r.toCashbox?.name ?? null,
    currencyId: r.currencyId,
    currencyCode: r.currency.code,
    amount: round2(r.amount),
    exchangeRate: r.exchangeRate,
    amountBase: round2(toBase(r.amount, r.exchangeRate)),
    txDate: r.txDate,
    refType: r.refType,
    refId: r.refId,
    expenseCategoryId: r.expenseCategoryId,
    expenseCategoryName: r.expenseCategory?.name ?? null,
    employeeId: r.employeeId,
    employeeName: r.employee?.name ?? null,
    customerId: r.customerId,
    customerName: r.customer?.name ?? null,
    supplierId: r.supplierId,
    supplierName: r.supplier?.name ?? null,
    description: r.description,
    direction:
      (SIGN_CASHBOX[r.txType as CashTxType] ?? 0) >= 0 && r.txType !== "box_transfer" ? 1 : -1,
    createdAt: r.createdAt.toISOString(),
  }
}

/**
 * حفظ حركة نقدية (ذرّي) — FR-04-02/03.
 * قواعد الربط: مصروف ← فئة إلزامياً، سحبية ← موظف إلزامياً،
 * قبض/صرف ← طرف (عميل/مورد) مستحسن. العملة يجب أن تطابق عملة الصندوق
 * (عدا التحويل/البنكي حيث تعملة الحركة = عملة المصدر ويُحوَّل للوجهة).
 */
export async function saveCashTx(
  db: PrismaClient,
  payload: SaveCashTxPayload
): Promise<{ tx: CashTxDto; cashboxBalance: number; toCashboxBalance: number | null }> {
  const txDate = payload.txDate || todayStr()
  return db.$transaction(async (tx) => {
    const amount = Number(payload.amount)
    if (!(amount > 0)) throw new DomainError("المبلغ يجب أن يكون أكبر من صفر")
    const txType = payload.txType
    if (!CASH_TX_TYPES.includes(txType)) throw new DomainError("نوع الحركة غير معروف")

    const box = await tx.cashbox.findFirst({ where: { id: payload.cashboxId, isArchived: false } })
    if (!box) throw new DomainError("الصندوق غير موجود أو مؤرشف")

    // الطرف المقابل (تحويل/بنكي)
    let toBox: { id: number; name: string; currencyId: number } | null = null
    if (payload.toCashboxId) {
      const t = await tx.cashbox.findFirst({
        where: { id: payload.toCashboxId, isArchived: false },
      })
      if (!t) throw new DomainError("الصندوق الوجهة غير موجود أو مؤرشف")
      if (t.id === box.id) throw new DomainError("لا يمكن التحويل إلى نفس الصندوق")
      toBox = { id: t.id, name: t.name, currencyId: t.currencyId }
    }

    // ─── قواعد الربط FR-04-03 ───
    let categoryId: number | null = null
    let categoryName: string | null = null
    if (txType === "expense") {
      if (!payload.expenseCategoryId) throw new DomainError("اختر فئة المصروف")
      const cat = await tx.expenseCategory.findFirst({
        where: { id: payload.expenseCategoryId, isArchived: false },
      })
      if (!cat) throw new DomainError("فئة المصروف غير موجودة")
      categoryId = cat.id
      categoryName = cat.name
    }
    let employeeId: number | null = null
    let employeeName: string | null = null
    if (txType === "employee_advance" || txType === "salary_batch") {
      if (!payload.employeeId) throw new DomainError("اختر الموظف")
      const emp = await tx.employee.findFirst({
        where: { id: payload.employeeId, isArchived: false },
      })
      if (!emp) throw new DomainError("الموظف غير موجود أو مؤرشف")
      employeeId = emp.id
      employeeName = emp.name
    }
    let customerId: number | null = null
    let customerName: string | null = null
    if (payload.customerId) {
      const c = await tx.customer.findFirst({ where: { id: payload.customerId, isArchived: false } })
      if (!c) throw new DomainError("العميل غير موجود أو مؤرشف")
      customerId = c.id
      customerName = c.name
    }
    let supplierId: number | null = null
    let supplierName: string | null = null
    if (payload.supplierId) {
      const s = await tx.supplier.findFirst({ where: { id: payload.supplierId, isArchived: false } })
      if (!s) throw new DomainError("المورد غير موجود أو مؤرشف")
      supplierId = s.id
      supplierName = s.name
    }

    // ─── العملة والسعر ───
    const base = await tx.currency.findFirst({ where: { isBase: true } })
    if (!base) throw new DomainError("لا توجد عملة أساسية معرّفة")
    const currencyId = payload.currencyId ?? box.currencyId
    const currency = await tx.currency.findUnique({ where: { id: currencyId } })
    if (!currency || !currency.isActive) throw new DomainError("العملة غير متاحة")
    // إلزام تطابق عملة الحركة مع عملة الصندوق (المصدر في التحويل/البنكي)
    if (currencyId !== box.currencyId) {
      throw new DomainError("عملة الحركة يجب أن تطابق عملة الصندوق")
    }
    let exchangeRate = 1
    if (!currency.isBase) {
      const given = Number(payload.exchangeRate ?? 0)
      if (given > 0) exchangeRate = given
      else {
        const row =
          (await tx.exchangeRate.findUnique({
            where: { currencyId_rateDate: { currencyId, rateDate: txDate } },
          })) ??
          (await tx.exchangeRate.findFirst({
            where: { currencyId },
            orderBy: { rateDate: "desc" },
          }))
        if (!row || row.rate <= 0)
          throw new DomainError("لا يوجد سعر صرف لهذه العملة — أدخل السعر يدوياً")
        exchangeRate = row.rate
      }
    }

    // ─── منع الرصيد السالب ───
    await ensureBoxNotNegative(tx, box.id, amount, txType)
    if (toBox && txType === "bank_withdraw") {
      // السحب البنكي: to_cashbox = حساب البنك المصدر — يُخصم منه المبلغ
      const toBoxRow = await tx.cashbox.findUnique({ where: { id: toBox.id } })
      if (toBoxRow) {
        const toBalance = await computeCashboxBalance(tx, toBox.id)
        const boxRate =
          toBoxRow.currencyId === currencyId ? 1 : await rateAt(tx, toBoxRow.currencyId, txDate)
        const converted = round2((amount * exchangeRate) / (boxRate > 0 ? boxRate : 1))
        if (toBalance - converted < -0.01)
          throw new DomainError(
            `رصيد «${toBox.name}» غير كافٍ — المتاح: ${toBalance.toLocaleString("en-US")}`
          )
      }
    }

    // ─── وصف افتراضي ───
    const label = TX_TYPE_LABELS[txType]
    const partyLabel =
      customerName ?? supplierName ?? employeeName ?? categoryName ?? null
    const description =
      payload.description?.trim() ||
      `${label}${partyLabel ? ` — ${partyLabel}` : ""}${
        txType === "box_transfer" && toBox ? ` (${box.name} ← ${toBox.name})` : ""
      }`

    const row = await tx.cashTx.create({
      data: {
        txType,
        cashboxId: box.id,
        toCashboxId: toBox?.id ?? null,
        currencyId,
        amount: round4(amount),
        exchangeRate,
        txDate,
        refType: payload.refType ?? null,
        refId: payload.refId ?? null,
        expenseCategoryId: categoryId,
        employeeId,
        customerId,
        supplierId,
        description,
      },
      include: txInclude,
    })

    const cashboxBalance = await computeCashboxBalance(tx, box.id)
    const toCashboxBalance = toBox ? await computeCashboxBalance(tx, toBox.id) : null
    return { tx: toCashTxDto(row), cashboxBalance, toCashboxBalance }
  })
}

/** فحص عدم سالبية رصيد الصندوق قبل أي حركة خارجة */
async function ensureBoxNotNegative(
  tx: Tx,
  cashboxId: number,
  amount: number,
  txType: CashTxType
): Promise<void> {
  if (!isOutflowOnCashbox(txType)) return
  const box = await tx.cashbox.findUnique({ where: { id: cashboxId }, include: { currency: true } })
  if (!box) return
  const balance = await computeCashboxBalance(tx, cashboxId)
  if (balance - amount < -0.01) {
    throw new DomainError(
      `رصيد «${box.name}» غير كافٍ — المتاح: ${balance.toLocaleString("en-US")} ${box.currency.code}`
    )
  }
}

// ─── سجل الحركات ───

export async function listCashTx(
  db: AnyDb,
  filters: {
    cashboxId?: number
    type?: string
    from?: string
    to?: string
    q?: string
    page?: number
    limit?: number
  }
): Promise<{ txs: CashTxDto[]; total: number; page: number; pages: number; totals: { in: number; out: number } }> {
  const page = Math.max(1, filters.page ?? 1)
  const limit = Math.min(100, filters.limit ?? 25)
  const where: Prisma.CashTxWhereInput = {
    ...(filters.cashboxId
      ? { OR: [{ cashboxId: filters.cashboxId }, { toCashboxId: filters.cashboxId }] }
      : {}),
    ...(filters.type ? { txType: filters.type } : {}),
    ...(filters.from || filters.to
      ? { txDate: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
    ...(filters.q ? { description: { contains: filters.q } } : {}),
  }
  const [rows, total, inAgg, outAgg] = await Promise.all([
    db.cashTx.findMany({
      where,
      orderBy: [{ txDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: txInclude,
    }),
    db.cashTx.count({ where }),
    db.cashTx.aggregate({
      _sum: { amount: true },
      where: { ...where, txType: { in: ["receipt", "bank_withdraw", "opening"] } },
    }),
    db.cashTx.aggregate({
      _sum: { amount: true },
      where: {
        ...where,
        txType: { in: ["payment", "expense", "employee_advance", "commission_payout", "bank_deposit", "salary_batch"] },
      },
    }),
  ])
  return {
    txs: rows.map(toCashTxDto),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    totals: { in: round2(inAgg._sum.amount ?? 0), out: round2(outAgg._sum.amount ?? 0) },
  }
}

// ─── الوردية (Shift) ───

export interface ShiftBreakdown {
  cashSales: number // مبيعات نقدية (قبض مرتبط بفواتير)
  collections: number // تحصيلات (سندات + أقساط + قبض حر)
  otherIn: number // سحب بنكي/افتتاحي
  expenses: number
  payments: number // صرف لموردين
  advances: number // سحبيات
  commissions: number
  salaries: number
  bankDeposits: number
  transfersOut: number
  transfersIn: number
  net: number
}

export interface ShiftStateDto {
  cashboxId: number
  cashboxName: string
  currencyCode: string
  openShift: {
    id: number
    openedAt: string
    openingCount: number
    notes: string | null
  } | null
  /** الرصيد الحالي المتوقع بالعد */
  expected: number
  /** حركات الفترة منذ فتح الوردية (أو اليوم) */
  breakdown: ShiftBreakdown
  history: Array<{
    id: number
    openedAt: string
    closedAt: string
    openingCount: number | null
    expected: number | null
    counted: number | null
    difference: number | null
    notes: string | null
  }>
}

function shiftStartDate(openedAt: string): string {
  return openedAt.slice(0, 10) // YYYY-MM-DD من ISO
}

/** حركات صندوق منذ تاريخ (تصنيفها لتقرير الوردية) */
async function shiftBreakdown(tx: Tx, cashboxId: number, from: string): Promise<ShiftBreakdown> {
  const rows = await tx.cashTx.findMany({
    where: {
      txDate: { gte: from },
      OR: [{ cashboxId }, { toCashboxId: cashboxId }],
    },
    select: { txType: true, refType: true, cashboxId: true, toCashboxId: true, amount: true },
  })
  const b: ShiftBreakdown = {
    cashSales: 0,
    collections: 0,
    otherIn: 0,
    expenses: 0,
    payments: 0,
    advances: 0,
    commissions: 0,
    salaries: 0,
    bankDeposits: 0,
    transfersOut: 0,
    transfersIn: 0,
    net: 0,
  }
  for (const r of rows) {
    const onSource = r.cashboxId === cashboxId
    switch (r.txType) {
      case "receipt":
        if (onSource) {
          if (r.refType === "invoice") b.cashSales += r.amount
          else b.collections += r.amount
        }
        break
      case "bank_withdraw":
        if (onSource) b.otherIn += r.amount
        break
      case "opening":
        if (onSource) b.otherIn += r.amount
        break
      case "expense":
        if (onSource) b.expenses += r.amount
        break
      case "payment":
        if (onSource) b.payments += r.amount
        break
      case "employee_advance":
        if (onSource) b.advances += r.amount
        break
      case "commission_payout":
        if (onSource) b.commissions += r.amount
        break
      case "salary_batch":
        if (onSource) b.salaries += r.amount
        break
      case "bank_deposit":
        if (onSource) b.bankDeposits += r.amount
        break
      case "box_transfer":
        if (onSource) b.transfersOut += r.amount
        else if (r.toCashboxId === cashboxId) b.transfersIn += r.amount
        break
    }
  }
  b.net =
    b.cashSales +
    b.collections +
    b.otherIn +
    b.transfersIn -
    (b.expenses +
      b.payments +
      b.advances +
      b.commissions +
      b.salaries +
      b.bankDeposits +
      b.transfersOut)
  for (const k of Object.keys(b) as Array<keyof ShiftBreakdown>) {
    b[k] = round2(b[k])
  }
  return b
}

/** حالة وردية صندوق: المفتوحة + الرصيد المتوقع + التصنيف + السجل */
export async function getShiftState(db: PrismaClient, cashboxId: number): Promise<ShiftStateDto> {
  return db.$transaction(async (tx) => {
    const box = await tx.cashbox.findUnique({ where: { id: cashboxId }, include: { currency: true } })
    if (!box) throw new DomainError("الصندوق غير موجود")
    const [open, history, expected] = await Promise.all([
      tx.shift.findFirst({ where: { cashboxId, closedAt: null }, orderBy: { id: "desc" } }),
      tx.shift.findMany({
        where: { cashboxId, closedAt: { not: null } },
        orderBy: { id: "desc" },
        take: 20,
      }),
      computeCashboxBalance(tx, cashboxId),
    ])
    const from = open ? shiftStartDate(open.openedAt) : todayStr()
    const breakdown = await shiftBreakdown(tx, cashboxId, from)
    return {
      cashboxId,
      cashboxName: box.name,
      currencyCode: box.currency.code,
      openShift: open
        ? { id: open.id, openedAt: open.openedAt, openingCount: open.openingCount ?? 0, notes: open.notes }
        : null,
      expected,
      breakdown,
      history: history.map((h) => ({
        id: h.id,
        openedAt: h.openedAt,
        closedAt: h.closedAt ?? "",
        openingCount: h.openingCount,
        expected: h.expected,
        counted: h.counted,
        difference: h.difference,
        notes: h.notes,
      })),
    }
  })
}

/** فتح وردية — openingCount افتراضياً الرصيد الحالي */
export async function openShift(
  db: PrismaClient,
  payload: { cashboxId: number; openingCount?: number; notes?: string }
) {
  return db.$transaction(async (tx) => {
    const box = await tx.cashbox.findUnique({ where: { id: payload.cashboxId } })
    if (!box) throw new DomainError("الصندوق غير موجود")
    const existing = await tx.shift.findFirst({ where: { cashboxId: box.id, closedAt: null } })
    if (existing) throw new DomainError("هناك وردية مفتوحة لهذا الصندوق بالفعل")
    const balance = await computeCashboxBalance(tx, box.id)
    const row = await tx.shift.create({
      data: {
        cashboxId: box.id,
        openedAt: new Date().toISOString(),
        openingCount: payload.openingCount != null ? payload.openingCount : balance,
        notes: payload.notes ?? null,
      },
    })
    return { shift: row, balance }
  })
}

export interface CloseShiftResult {
  shiftId: number
  cashboxName: string
  currencyCode: string
  openedAt: string
  closedAt: string
  expected: number
  counted: number
  difference: number
  breakdown: ShiftBreakdown
}

/** إقفال الوردية — FR-04-04: المتوقع (الرصيد المحسوب) مقابل العدّ الفعلي */
export async function closeShift(
  db: PrismaClient,
  payload: { cashboxId: number; counted: number; notes?: string }
): Promise<CloseShiftResult> {
  return db.$transaction(async (tx) => {
    const box = await tx.cashbox.findUnique({ where: { id: payload.cashboxId }, include: { currency: true } })
    if (!box) throw new DomainError("الصندوق غير موجود")
    const counted = Number(payload.counted)
    if (!(counted >= 0)) throw new DomainError("أدخل العدّ الفعلي للنقدية")
    let shift = await tx.shift.findFirst({ where: { cashboxId: box.id, closedAt: null }, orderBy: { id: "desc" } })
    if (!shift) {
      // لا وردية مفتوحة → ننشئ ونقفل فوراً (تقرير لحظي)
      shift = await tx.shift.create({
        data: {
          cashboxId: box.id,
          openedAt: new Date().toISOString(),
          openingCount: await computeCashboxBalance(tx, box.id),
        },
      })
    }
    const expected = await computeCashboxBalance(tx, box.id)
    const difference = round2(counted - expected)
    const closedAt = new Date().toISOString()
    await tx.shift.update({
      where: { id: shift.id },
      data: { closedAt, expected, counted, difference, notes: payload.notes ?? shift.notes },
    })
    const breakdown = await shiftBreakdown(tx, box.id, shiftStartDate(shift.openedAt))
    return {
      shiftId: shift.id,
      cashboxName: box.name,
      currencyCode: box.currency.code,
      openedAt: shift.openedAt,
      closedAt,
      expected,
      counted,
      difference,
      breakdown,
    }
  })
}

// ─── فئات المصروفات ───

export interface ExpenseCategoryDto {
  id: number
  name: string
  isArchived: boolean
  txCount: number
  totalBase: number
  lastUsedAt: string | null
}

export async function listExpenseCategories(db: AnyDb): Promise<ExpenseCategoryDto[]> {
  const cats = await db.expenseCategory.findMany({ orderBy: { id: "asc" } })
  const out: ExpenseCategoryDto[] = []
  for (const c of cats) {
    const [txCount, agg, last] = await Promise.all([
      db.cashTx.count({ where: { expenseCategoryId: c.id } }),
      db.cashTx.aggregate({
        _sum: { amount: true },
        where: { expenseCategoryId: c.id, txType: "expense" },
      }),
      db.cashTx.findFirst({
        where: { expenseCategoryId: c.id },
        orderBy: { txDate: "desc" },
        select: { txDate: true },
      }),
    ])
    out.push({
      id: c.id,
      name: c.name,
      isArchived: c.isArchived,
      txCount,
      totalBase: round2(agg._sum.amount ?? 0),
      lastUsedAt: last?.txDate ?? null,
    })
  }
  return out
}
