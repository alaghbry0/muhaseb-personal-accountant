/**
 * Domain — التقارير (Task 4-a) — FR-09 (+ FR-05-05 أقساط + FR-06-04 مناديب).
 *
 * كل المبالغ بالعملة الأساسية (YER) ما لم يُذكر خلاف ذلك —
 * الفواتير: totalBase/costTotal محوّلة وقت الإصدار (Snapshot FR-08-05).
 * الحركات النقدية: amount × exchangeRate.
 * الفترة [from, to] شاملة الطرفين (نصوص YYYY-MM-DD).
 */
import type { Prisma, PrismaClient } from "@prisma/client"
import { round2, round4, toBase } from "./money"
import { todayStr } from "./parties"
import { computeCustomerBalance } from "./parties"
import { resolvePeriod } from "@/lib/format"

type AnyDb = PrismaClient | Prisma.TransactionClient

export interface PeriodFilter {
  from: string
  to: string
}

// ─── أدوات الفترات ───

/** تحليل from/to من الطلب — الافتراضي: الشهر الحالي حتى اليوم */
export function parsePeriod(from?: string | null, to?: string | null): PeriodFilter {
  if (from && to) return { from, to }
  const def = resolvePeriod("month")
  return { from: from || def.from, to: to || def.to }
}

export function daysBetween(a: string, b: string): number {
  const d1 = new Date(`${a}T00:00:00`).getTime()
  const d2 = new Date(`${b}T00:00:00`).getTime()
  return Math.round((d2 - d1) / 86_400_000)
}

export function addDaysStr(d: string, n: number): string {
  const dt = new Date(`${d}T00:00:00`)
  dt.setDate(dt.getDate() + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`
}

/** الفترة السابقة بنفس الطول مباشرة قبل [from, to] */
export function previousPeriod(p: PeriodFilter): PeriodFilter {
  const len = daysBetween(p.from, p.to) + 1
  return { from: addDaysStr(p.from, -len), to: addDaysStr(p.from, -1) }
}

function dateOnly(iso: Date | string): string {
  if (typeof iso === "string") return iso.slice(0, 10)
  return `${iso.getFullYear()}-${String(iso.getMonth() + 1).padStart(2, "0")}-${String(iso.getDate()).padStart(2, "0")}`
}

/** دلو يومي أو شهري حسب طول الفترة */
function bucketLabel(dateStr: string, byMonth: boolean): string {
  return byMonth ? dateStr.slice(0, 7) : dateStr.slice(5)
}

function pctChange(cur: number, prev: number): number | null {
  if (prev === 0) return cur > 0 ? 100 : null
  return Math.round(((cur - prev) / prev) * 1000) / 10
}

async function baseCurrencyCode(db: AnyDb): Promise<string> {
  const base = await db.currency.findFirst({ where: { isBase: true } })
  return base?.code ?? "YER"
}

/** أحدث سعر لكل عملة (لتحويل تقارير الأقساط) */
async function latestRates(db: AnyDb): Promise<Map<number, number>> {
  const rows = await db.exchangeRate.findMany({
    orderBy: { rateDate: "desc" },
    select: { currencyId: true, rate: true },
  })
  const map = new Map<number, number>()
  const base = await db.currency.findFirst({ where: { isBase: true } })
  if (base) map.set(base.id, 1)
  for (const r of rows) if (!map.has(r.currencyId)) map.set(r.currencyId, r.rate)
  return map
}

// ═══════════════════════════════════════════════════════════════
// 1) الأرباح والخسائر — حركة الشركة (FR-09-02)
// ═══════════════════════════════════════════════════════════════

export interface PlSeriesPoint {
  label: string
  date: string
  revenue: number
  cogs: number
  expenses: number
  salaries: number
  commissions: number
  net: number
}

export interface ProfitLossReport {
  period: PeriodFilter
  baseCurrency: string
  summary: {
    salesRevenue: number
    salesReturns: number
    revenue: number
    cogs: number
    grossProfit: number
    expenses: number
    /** الرواتب — صف مستقل من salary_batch (مسير 4-b) — ليست ضمن المصروفات (منع الازدواج) */
    salaries: number
    commissions: number
    netProfit: number
    salesCount: number
    returnsCount: number
    purchasesTotal: number
    purchaseReturnsTotal: number
    marginPercent: number | null
  }
  expenseByCategory: Array<{ name: string; total: number }>
  series: PlSeriesPoint[]
}

export async function profitAndLoss(db: AnyDb, p: PeriodFilter): Promise<ProfitLossReport> {
  const invWhere = (docType: string, period: PeriodFilter) => ({
    docType,
    status: "completed" as const,
    issuedAt: { gte: period.from, lte: period.to },
  })
  const [salesAgg, returnsAgg, purchasesAgg, purchReturnsAgg, expenseRows, commissionRows, salaryRows, base] =
    await Promise.all([
      db.invoice.aggregate({
        _sum: { totalBase: true, costTotal: true },
        _count: true,
        where: invWhere("sale", p),
      }),
      db.invoice.aggregate({
        _sum: { totalBase: true, costTotal: true },
        _count: true,
        where: invWhere("sale_return", p),
      }),
      db.invoice.aggregate({
        _sum: { totalBase: true },
        where: invWhere("purchase", p),
      }),
      db.invoice.aggregate({
        _sum: { totalBase: true },
        where: invWhere("purchase_return", p),
      }),
      db.cashTx.findMany({
        where: { txType: "expense", txDate: { gte: p.from, lte: p.to } },
        select: { amount: true, exchangeRate: true, txDate: true, expenseCategoryId: true },
      }),
      db.commission.findMany({
        where: { createdAt: { gte: new Date(`${p.from}T00:00:00`), lte: new Date(`${p.to}T23:59:59`) } },
        select: { amount: true, createdAt: true },
      }),
      // الرواتب: حركات مسير الرواتب (tx_type='salary_batch' من 4-b) — تُعرض صفاً مستقلاً
      // «الرواتب» وليس ضمن المصروفات، وإلا ازدوج العد (ملاحظة تسليم 4-a)
      db.cashTx.findMany({
        where: { txType: "salary_batch", txDate: { gte: p.from, lte: p.to } },
        select: { amount: true, exchangeRate: true, txDate: true },
      }),
      baseCurrencyCode(db),
    ])

  const salesRevenue = round2(salesAgg._sum.totalBase ?? 0)
  const salesReturns = round2(returnsAgg._sum.totalBase ?? 0)
  const revenue = round2(salesRevenue - salesReturns)
  const cogs = round2((salesAgg._sum.costTotal ?? 0) - (returnsAgg._sum.costTotal ?? 0))
  const grossProfit = round2(revenue - cogs)

  // فصل فئة «رواتب» اليدوية عن المصروفات وضمّها لصف الرواتب (منع الازدواج مع salary_batch)
  const catIdsAll = [...new Set(expenseRows.map((r) => r.expenseCategoryId).filter((x): x is number => x != null))]
  const catsAll = catIdsAll.length
    ? await db.expenseCategory.findMany({ where: { id: { in: catIdsAll } }, select: { id: true, name: true } })
    : []
  const catMapAll = new Map(catsAll.map((c) => [c.id, c.name.trim()]))
  const isSalaryCat = (id: number | null) => id != null && catMapAll.get(id) === "رواتب"

  const expenses = round2(
    expenseRows
      .filter((r) => !isSalaryCat(r.expenseCategoryId))
      .reduce((s, r) => s + toBase(r.amount, r.exchangeRate), 0)
  )
  const salaries = round2(
    salaryRows.reduce((s, r) => s + toBase(r.amount, r.exchangeRate), 0) +
      expenseRows
        .filter((r) => isSalaryCat(r.expenseCategoryId))
        .reduce((s, r) => s + toBase(r.amount, r.exchangeRate), 0)
  )
  const commissions = round2(commissionRows.reduce((s, r) => s + r.amount, 0))
  const netProfit = round2(grossProfit - expenses - salaries - commissions)

  // مصروفات حسب الفئة (فئة رواتب اليدوية تُدمج في صف الرواتب المستقل)
  const cats = catsAll.filter((c) => c.name.trim() !== "رواتب")
  const catMap = new Map(cats.map((c) => [c.id, c.name]))
  const catTotals = new Map<string, number>()
  for (const r of expenseRows) {
    if (r.expenseCategoryId == null || isSalaryCat(r.expenseCategoryId)) continue
    const name = catMap.get(r.expenseCategoryId) ?? "أخرى"
    catTotals.set(name, round2((catTotals.get(name) ?? 0) + toBase(r.amount, r.exchangeRate)))
  }

  // سلسلة زمنية (يومي ≤ 60 يوماً وإلا شهري)
  const byMonth = daysBetween(p.from, p.to) > 60
  const buckets = new Map<string, PlSeriesPoint>()
  const ensureBucket = (dateStr: string): PlSeriesPoint => {
    const label = bucketLabel(dateStr, byMonth)
    let b = buckets.get(label)
    if (!b) {
      b = { label, date: byMonth ? `${label}-01` : dateStr, revenue: 0, cogs: 0, expenses: 0, salaries: 0, commissions: 0, net: 0 }
      buckets.set(label, b)
    }
    return b
  }
  const [salesSeries, returnsSeries] = await Promise.all([
    db.invoice.groupBy({
      by: ["issuedAt"],
      _sum: { totalBase: true, costTotal: true },
      where: invWhere("sale", p),
    }),
    db.invoice.groupBy({
      by: ["issuedAt"],
      _sum: { totalBase: true, costTotal: true },
      where: invWhere("sale_return", p),
    }),
  ])
  for (const s of salesSeries) {
    const b = ensureBucket(s.issuedAt)
    b.revenue = round2(b.revenue + (s._sum.totalBase ?? 0))
    b.cogs = round2(b.cogs + (s._sum.costTotal ?? 0))
  }
  for (const s of returnsSeries) {
    const b = ensureBucket(s.issuedAt)
    b.revenue = round2(b.revenue - (s._sum.totalBase ?? 0))
    b.cogs = round2(b.cogs - (s._sum.costTotal ?? 0))
  }
  for (const r of expenseRows) {
    const b = ensureBucket(r.txDate)
    if (isSalaryCat(r.expenseCategoryId)) {
      b.salaries = round2(b.salaries + toBase(r.amount, r.exchangeRate))
    } else {
      b.expenses = round2(b.expenses + toBase(r.amount, r.exchangeRate))
    }
  }
  for (const r of salaryRows) ensureBucket(r.txDate).salaries = round2(ensureBucket(r.txDate).salaries + toBase(r.amount, r.exchangeRate))
  for (const c of commissionRows) ensureBucket(dateOnly(c.createdAt)).commissions = round2(ensureBucket(dateOnly(c.createdAt)).commissions + c.amount)
  for (const b of buckets.values()) b.net = round2(b.revenue - b.cogs - b.expenses - b.salaries - b.commissions)
  const series = [...buckets.values()].sort((a, b) => (a.date < b.date ? -1 : 1))

  return {
    period: p,
    baseCurrency: base,
    summary: {
      salesRevenue,
      salesReturns,
      revenue,
      cogs,
      grossProfit,
      expenses,
      salaries,
      commissions,
      netProfit,
      salesCount: salesAgg._count,
      returnsCount: returnsAgg._count,
      purchasesTotal: round2(purchasesAgg._sum.totalBase ?? 0),
      purchaseReturnsTotal: round2(purchReturnsAgg._sum.totalBase ?? 0),
      marginPercent: revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : null,
    },
    expenseByCategory: [...catTotals.entries()]
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total),
    series,
  }
}

// ═══════════════════════════════════════════════════════════════
// 2) المبيعات حسب (عميل/مندوب/فئة/صنف/يوم) — FR-09-06
// ═══════════════════════════════════════════════════════════════

export type SalesDimension = "customer" | "rep" | "category" | "product" | "day"

export const SALES_DIMENSIONS: Array<{ id: SalesDimension; label: string }> = [
  { id: "customer", label: "العميل" },
  { id: "rep", label: "المندوب" },
  { id: "category", label: "الفئة" },
  { id: "product", label: "الصنف" },
  { id: "day", label: "اليوم" },
]

export interface SalesByRow {
  key: string
  name: string
  invoices: number
  total: number
  qty: number
  prevInvoices: number
  prevTotal: number
  changePct: number | null
}

export interface SalesByReport {
  period: PeriodFilter
  previous: PeriodFilter
  dimension: SalesDimension
  baseCurrency: string
  total: number
  prevTotal: number
  changePct: number | null
  invoiceCount: number
  rows: SalesByRow[]
}

export async function salesBy(
  db: AnyDb,
  opts: { dimension: SalesDimension } & PeriodFilter
): Promise<SalesByReport> {
  const { dimension, from, to } = opts
  const prev = previousPeriod({ from, to })

  const fetchRows = async (period: PeriodFilter) => {
    const invoices = await db.invoice.findMany({
      where: {
        docType: { in: ["sale", "sale_return"] },
        status: "completed",
        issuedAt: { gte: period.from, lte: period.to },
      },
      select: {
        id: true
        , docType: true
        , issuedAt: true
        , totalBase: true
        , customerId: true
        , salesRepId: true
        , customer: { select: { name: true } }
        , salesRep: { select: { name: true } }
        , items: {
          select: {
            qty: true
            , unitFactor: true
            , product: { select: { id: true, name: true, category: { select: { id: true, name: true } } } }
          },
        },
      },
      orderBy: { issuedAt: "asc" },
    })
    return invoices
  }

  const [curInvoices, prevInvoices] = await Promise.all([fetchRows({ from, to }), fetchRows(prev)])

  type Agg = { name: string; invoices: number; total: number; qty: number }
  const aggregate = (invoices: Awaited<ReturnType<typeof fetchRows>>) => {
    const map = new Map<string, Agg>()
    const add = (key: string, name: string, total: number, qty: number, sign: number, countInvoice: boolean) => {
      let a = map.get(key)
      if (!a) {
        a = { name, invoices: 0, total: 0, qty: 0 }
        map.set(key, a)
      }
      a.total = round2(a.total + sign * total)
      a.qty = round2(a.qty + sign * qty)
      if (countInvoice) a.invoices += 1
    }
    for (const inv of invoices) {
      const sign = inv.docType === "sale_return" ? -1 : 1
      const countInvoice = inv.docType === "sale"
      switch (dimension) {
        case "customer":
          add(
            inv.customerId ? `c${inv.customerId}` : "none",
            inv.customer?.name ?? "عميل نقدي",
            inv.totalBase,
            0,
            sign,
            countInvoice
          )
          break
        case "rep":
          add(
            inv.salesRepId ? `r${inv.salesRepId}` : "none",
            inv.salesRep?.name ?? "بدون مندوب",
            inv.totalBase,
            0,
            sign,
            countInvoice
          )
          break
        case "day":
          add(inv.issuedAt, inv.issuedAt, inv.totalBase, 0, sign, countInvoice)
          break
        case "product":
        case "category": {
          if (inv.items.length === 0) {
            add("none", "بنود محذوفة", inv.totalBase, 0, sign, false)
          }
          for (const it of inv.items) {
            const qty = (it.qty || 0) * (it.unitFactor || 1)
            if (dimension === "product") {
              add(`p${it.product.id}`, it.product.name, inv.totalBase, qty, sign, false)
            } else {
              const cat = it.product.category
              add(cat ? `cat${cat.id}` : "none", cat?.name ?? "بدون فئة", inv.totalBase, qty, sign, false)
            }
          }
          break
        }
      }
    }
    return map
  }

  const cur = aggregate(curInvoices)
  const prv = aggregate(prevInvoices)
  const rows: SalesByRow[] = [...cur.entries()]
    .map(([key, a]) => {
      const p = prv.get(key)
      return {
        key,
        name: a.name,
        invoices: a.invoices,
        total: a.total,
        qty: a.qty,
        prevInvoices: p?.invoices ?? 0,
        prevTotal: p?.total ?? 0,
        changePct: pctChange(a.total, p?.total ?? 0),
      }
    })
    .sort((a, b) => b.total - a.total)

  const total = round2(rows.reduce((s, r) => s + r.total, 0))
  const prevTotal = round2([...prv.values()].reduce((s, a) => s + a.total, 0))
  const base = await baseCurrencyCode(db)
  return {
    period: { from, to },
    previous: prev,
    dimension,
    baseCurrency: base,
    total,
    prevTotal,
    changePct: pctChange(total, prevTotal),
    invoiceCount: curInvoices.filter((i) => i.docType === "sale").length,
    rows,
  }
}

// ═══════════════════════════════════════════════════════════════
// 3) حركة صنف — بطاقة الصنف (FR-09-03)
// ═══════════════════════════════════════════════════════════════

export const MOVEMENT_LABELS: Record<string, string> = {
  purchase: "مشتريات",
  sale: "بيع",
  sale_return: "مرتجع بيع",
  purchase_return: "مرتجع شراء",
  adjustment: "تسوية جرد",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  opening: "افتتاحي",
}

export interface ItemMovementRow {
  date: string
  type: string
  typeLabel: string
  qty: number
  refType: string | null
  refId: number | null
  notes: string | null
  balance: number
}

export interface ItemMovementReport {
  period: PeriodFilter
  productId: number
  productName: string
  warehouseId: number | null
  warehouseName: string | null
  unitName: string | null
  openingQty: number
  closingQty: number
  totals: { in: number; out: number; saleReturns: number; net: number }
  rows: ItemMovementRow[]
}

export async function itemMovementCard(
  db: AnyDb,
  opts: { productId: number; warehouseId?: number | null } & PeriodFilter
): Promise<ItemMovementReport> {
  const { productId, warehouseId, from, to } = opts
  const product = await db.product.findUnique({
    where: { id: productId },
    include: { unit: { select: { name: true } } },
  })
  if (!product) throw new Error("الصنف غير موجود")
  const warehouse = warehouseId
    ? await db.warehouse.findUnique({ where: { id: warehouseId } })
    : null

  const movements = await db.stockMovement.findMany({
    where: {
      productId,
      ...(warehouseId ? { warehouseId } : {}),
      movedAt: { lte: to },
    },
    orderBy: [{ movedAt: "asc" }, { id: "asc" }],
  })

  let openingQty = 0
  let running = 0
  const rows: ItemMovementRow[] = []
  let inTotal = 0
  let outTotal = 0
  let saleReturns = 0
  // حركات قبل الفترة → رصيد افتتاحي
  for (const m of movements) {
    if (m.movedAt >= from) break
    openingQty = round4(openingQty + m.qty)
  }
  running = openingQty
  // حركات داخل الفترة → رصيد تراكمي
  for (const m of movements) {
    if (m.movedAt < from) continue
    running = round4(running + m.qty)
    if (m.qty > 0) inTotal = round4(inTotal + m.qty)
    else outTotal = round4(outTotal - m.qty)
    if (m.movementType === "sale_return") saleReturns = round4(saleReturns + m.qty)
    rows.push({
      date: m.movedAt,
      type: m.movementType,
      typeLabel: MOVEMENT_LABELS[m.movementType] ?? m.movementType,
      qty: m.qty,
      refType: m.refType,
      refId: m.refId,
      notes: m.notes,
      balance: running,
    })
  }

  return {
    period: { from, to },
    productId,
    productName: product.name,
    warehouseId: warehouse?.id ?? null,
    warehouseName: warehouse?.name ?? null,
    unitName: product.unit?.name ?? null,
    openingQty: round4(openingQty),
    closingQty: round4(running),
    totals: {
      in: inTotal,
      out: outTotal,
      saleReturns,
      net: round4(inTotal - outTotal),
    },
    rows,
  }
}

// ═══════════════════════════════════════════════════════════════
// 4) أعمار الديون (FR-09-05) — FIFO للتحصيلات على أقدم الديون
// ═══════════════════════════════════════════════════════════════

export const AGING_BUCKETS = [
  { id: "d30", label: "0–30 يوم" },
  { id: "d60", label: "31–60 يوم" },
  { id: "d90", label: "61–90 يوم" },
  { id: "d90p", label: "أكثر من 90" },
  { id: "other", label: "غير مصنّف" },
] as const

export type AgingBucketId = (typeof AGING_BUCKETS)[number]["id"]

export interface AgingRow {
  customerId: number
  name: string
  phone: string | null
  balance: number
  buckets: Record<AgingBucketId, number>
  oldestDate: string | null
}

export interface AgingReport {
  asOf: string
  baseCurrency: string
  totals: Record<AgingBucketId, number>
  totalBalance: number
  debtorsCount: number
  rows: AgingRow[]
}

function bucketOf(ageDays: number): AgingBucketId {
  if (ageDays <= 30) return "d30"
  if (ageDays <= 60) return "d60"
  if (ageDays <= 90) return "d90"
  return "d90p"
}

export async function receivablesAging(db: AnyDb): Promise<AgingReport> {
  const asOf = todayStr()
  const customers = await db.customer.findMany({
    where: { isArchived: false },
    select: { id: true, name: true, phone: true, openingBalance: true },
    orderBy: { id: "asc" },
  })
  const base = await baseCurrencyCode(db)
  const rows: AgingRow[] = []
  const totals: Record<AgingBucketId, number> = { d30: 0, d60: 0, d90: 0, d90p: 0, other: 0 }

  for (const c of customers) {
    const [balance, invoices, plans, vouchers] = await Promise.all([
      computeCustomerBalance(db, c.id),
      db.invoice.findMany({
        where: {
          customerId: c.id,
          status: "completed",
          docType: { in: ["sale", "sale_return"] },
          dueAmount: { not: 0 },
        },
        select: { docType: true, dueAmount: true, exchangeRate: true, issuedAt: true },
        orderBy: { issuedAt: "asc" },
      }),
      db.installmentPlan.findMany({
        where: { customerId: c.id, invoiceId: null, status: { in: ["active", "defaulted"] } },
        select: { principal: true, firstDue: true },
      }),
      db.cashTx.findMany({
        where: { customerId: c.id, refType: { not: "invoice" }, txType: { in: ["receipt", "payment"] } },
        select: { txType: true, amount: true, exchangeRate: true },
      }),
    ])
    if (Math.abs(balance) < 0.01 && invoices.length === 0 && plans.length === 0) continue

    // ديون مؤرخة: افتتاحي (غير مصنّف) + فواتير آجلة + خطط مستقلة
    type DebtItem = { amount: number; date: string | null }
    const items: DebtItem[] = []
    if (Math.abs(c.openingBalance) > 0.005) items.push({ amount: c.openingBalance, date: null })
    for (const inv of invoices) {
      items.push({ amount: toBase(inv.dueAmount, inv.exchangeRate), date: inv.issuedAt })
    }
    for (const plan of plans) items.push({ amount: plan.principal, date: plan.firstDue })

    // صافي السندات يُطبَّق FIFO على الأقدم
    const netVouchers = vouchers.reduce(
      (s, v) => s + (v.txType === "receipt" ? -1 : 1) * toBase(v.amount, v.exchangeRate),
      0
    )
    let remaining = netVouchers
    const dated = items
      .filter((i) => i.date)
      .sort((a, b) => ((a.date as string) < (b.date as string) ? -1 : 1))
    const undated = items.filter((i) => !i.date)
    const buckets: Record<AgingBucketId, number> = { d30: 0, d60: 0, d90: 0, d90p: 0, other: 0 }
    for (const it of dated) {
      let amt = it.amount
      if (remaining > 0) {
        const applied = Math.min(remaining, amt)
        amt -= applied
        remaining -= applied
      }
      if (Math.abs(amt) > 0.005) buckets[bucketOf(daysBetween(it.date as string, asOf))] = round2(buckets[bucketOf(daysBetween(it.date as string, asOf))] + amt)
    }
    for (const it of undated) {
      let amt = it.amount
      if (remaining > 0) {
        const applied = Math.min(remaining, amt)
        amt -= applied
        remaining -= applied
      }
      buckets.other = round2(buckets.other + amt)
    }
    if (Math.abs(remaining) > 0.005) buckets.other = round2(buckets.other + remaining)

    const oldestDate = dated.length ? (dated[0].date as string) : null
    for (const k of Object.keys(totals) as AgingBucketId[]) totals[k] = round2(totals[k] + buckets[k])
    rows.push({ customerId: c.id, name: c.name, phone: c.phone, balance: round2(balance), buckets, oldestDate })
  }

  rows.sort((a, b) => b.balance - a.balance)
  return {
    asOf,
    baseCurrency: base,
    totals,
    totalBalance: round2(totals.d30 + totals.d60 + totals.d90 + totals.d90p + totals.other),
    debtorsCount: rows.filter((r) => r.balance > 0.01).length,
    rows,
  }
}

// ═══════════════════════════════════════════════════════════════
// 5) تقرير الأقساط (FR-05-05) — المحصّل/المستحق/المتأخر + توقع 6 أشهر
// ═══════════════════════════════════════════════════════════════

export interface InstallmentsReport {
  asOf: string
  baseCurrency: string
  summary: {
    collected: number
    pending: number
    late: number
    plansCount: number
    activePlans: number
    completedPlans: number
  }
  forecast: Array<{ month: string; label: string; expected: number; count: number }>
  plans: Array<{
    id: number
    customerName: string
    invoiceNo: string | null
    currencyCode: string
    principal: number
    totalPaid: number
    remaining: number
    remainingBase: number
    nextDue: string | null
    lateCount: number
    status: string
  }>
}

export async function installmentsForecast(db: AnyDb): Promise<InstallmentsReport> {
  const asOf = todayStr()
  const [base, rates] = await Promise.all([baseCurrencyCode(db), latestRates(db)])
  const plans = await db.installmentPlan.findMany({
    where: { status: { not: "cancelled" } },
    include: {
      customer: { select: { name: true } },
      invoice: { select: { invoiceNo: true } },
      currency: { select: { code: true } },
      installments: { orderBy: { seq: "asc" } },
    },
    orderBy: { id: "asc" },
  })

  const toBaseByCurrency = (amount: number, currencyId: number) => amount * (rates.get(currencyId) ?? 1)

  let collected = 0
  let pending = 0
  let late = 0
  const forecastMap = new Map<string, { expected: number; count: number }>()
  const planRows: InstallmentsReport["plans"] = []

  for (const plan of plans) {
    const rate = rates.get(plan.currencyId) ?? 1
    collected = round2(collected + toBaseByCurrency(plan.totalPaid, plan.currencyId))
    let planRemaining = 0
    let planLate = 0
    let nextDue: string | null = null
    for (const inst of plan.installments) {
      const remaining = inst.amount - inst.paidAmount
      if (inst.status === "paid" || remaining <= 0.005) continue
      planRemaining = round4(planRemaining + remaining)
      if (inst.dueDate < asOf) planLate = round4(planLate + remaining)
      if (!nextDue) nextDue = inst.dueDate
      // توقع التدفق النقدي: أول 6 أشهر من هذا الشهر
      const month = inst.dueDate.slice(0, 7)
      const curMonth = asOf.slice(0, 7)
      const [y, m] = month.split("-").map(Number)
      const [cy, cm] = curMonth.split("-").map(Number)
      const diff = (y - cy) * 12 + (m - cm)
      if (diff >= 0 && diff < 6) {
        const f = forecastMap.get(month) ?? { expected: 0, count: 0 }
        f.expected = round2(f.expected + toBaseByCurrency(remaining, plan.currencyId))
        f.count += 1
        forecastMap.set(month, f)
      }
    }
    pending = round2(pending + toBaseByCurrency(planRemaining, plan.currencyId))
    late = round2(late + toBaseByCurrency(planLate, plan.currencyId))
    planRows.push({
      id: plan.id,
      customerName: plan.customer.name,
      invoiceNo: plan.invoice?.invoiceNo ?? null,
      currencyCode: plan.currency.code,
      principal: round2(plan.principal),
      totalPaid: round2(plan.totalPaid),
      remaining: round2(planRemaining),
      remainingBase: round2(toBaseByCurrency(planRemaining, plan.currencyId)),
      nextDue,
      lateCount: plan.installments.filter((i) => i.status !== "paid" && i.dueDate < asOf).length,
      status: plan.status,
    })
  }

  const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"]
  const forecast: InstallmentsReport["forecast"] = []
  const [cy, cm] = asOf.slice(0, 7).split("-").map(Number)
  for (let i = 0; i < 6; i++) {
    const m = cm - 1 + i
    const y = cy + Math.floor(m / 12)
    const mm = String((m % 12) + 1).padStart(2, "0")
    const month = `${y}-${mm}`
    const f = forecastMap.get(month) ?? { expected: 0, count: 0 }
    forecast.push({ month, label: `${AR_MONTHS[m % 12]} ${y}`, expected: f.expected, count: f.count })
  }

  planRows.sort((a, b) => (a.nextDue ?? "9999") .localeCompare(b.nextDue ?? "9999"))
  return {
    asOf,
    baseCurrency: base,
    summary: {
      collected,
      pending,
      late,
      plansCount: plans.length,
      activePlans: plans.filter((p) => p.status === "active").length,
      completedPlans: plans.filter((p) => p.status === "completed").length,
    },
    forecast,
    plans: planRows,
  }
}

// ═══════════════════════════════════════════════════════════════
// 6) تقرير المصروفات حسب الفئة (FR-04-05/FR-09-08)
// ═══════════════════════════════════════════════════════════════

export interface ExpensesReport {
  period: PeriodFilter
  previous: PeriodFilter
  baseCurrency: string
  total: number
  prevTotal: number
  changePct: number | null
  count: number
  byCategory: Array<{ id: number | null; name: string; total: number; count: number; sharePct: number }>
  series: Array<{ label: string; date: string; total: number }>
  rows: Array<{
    id: number
    txDate: string
    categoryName: string
    description: string | null
    amount: number
    amountBase: number
    currencyCode: string
    cashboxName: string
  }>
}

export async function expensesByCategory(db: AnyDb, p: PeriodFilter): Promise<ExpensesReport> {
  const prev = previousPeriod(p)
  const fetch = async (period: PeriodFilter) =>
    db.cashTx.findMany({
      where: { txType: "expense", txDate: { gte: period.from, lte: period.to } },
      include: {
        expenseCategory: { select: { id: true, name: true } },
        currency: { select: { code: true } },
        cashbox: { select: { name: true } },
      },
      orderBy: [{ txDate: "desc" }, { id: "desc" }],
    })
  const [rows, prevRows, base] = await Promise.all([fetch(p), fetch(prev), baseCurrencyCode(db)])

  const total = round2(rows.reduce((s, r) => s + toBase(r.amount, r.exchangeRate), 0))
  const prevTotal = round2(prevRows.reduce((s, r) => s + toBase(r.amount, r.exchangeRate), 0))
  const catMap = new Map<string, { id: number | null; total: number; count: number }>()
  for (const r of rows) {
    const key = r.expenseCategory?.name ?? "غير مصنّف"
    let a = catMap.get(key)
    if (!a) {
      a = { id: r.expenseCategoryId, total: 0, count: 0 }
      catMap.set(key, a)
    }
    a.total = round2(a.total + toBase(r.amount, r.exchangeRate))
    a.count += 1
  }
  const byCategory = [...catMap.entries()]
    .map(([name, a]) => ({
      id: a.id,
      name,
      total: a.total,
      count: a.count,
      sharePct: total > 0 ? Math.round((a.total / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total)

  const byMonth = daysBetween(p.from, p.to) > 60
  const seriesMap = new Map<string, { date: string; total: number }>()
  for (const r of rows) {
    const label = bucketLabel(r.txDate, byMonth)
    const s = seriesMap.get(label) ?? { date: byMonth ? `${label}-01` : r.txDate, total: 0 }
    s.total = round2(s.total + toBase(r.amount, r.exchangeRate))
    seriesMap.set(label, s)
  }

  return {
    period: p,
    previous: prev,
    baseCurrency: base,
    total,
    prevTotal,
    changePct: pctChange(total, prevTotal),
    count: rows.length,
    byCategory,
    series: [...seriesMap.entries()]
      .map(([label, s]) => ({ label, date: s.date, total: s.total }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    rows: rows.map((r) => ({
      id: r.id,
      txDate: r.txDate,
      categoryName: r.expenseCategory?.name ?? "غير مصنّف",
      description: r.description,
      amount: round2(r.amount),
      amountBase: round2(toBase(r.amount, r.exchangeRate)),
      currencyCode: r.currency.code,
      cashboxName: r.cashbox.name,
    })),
  }
}

// ═══════════════════════════════════════════════════════════════
// 7) تقرير الصناديق (FR-09-08) — افتتاحي/وارد/صادر/ختامي
// ═══════════════════════════════════════════════════════════════

export interface CashboxReportRow {
  id: number
  name: string
  currencyCode: string
  opening: number
  in: number
  out: number
  closing: number
  current: number
  txCount: number
}

export interface CashboxesReport {
  period: PeriodFilter
  rows: CashboxReportRow[]
  totalsBase: { opening: number; in: number; out: number; closing: number }
}

export async function cashboxesReport(db: AnyDb, p: PeriodFilter): Promise<CashboxesReport> {
  const boxes = await db.cashbox.findMany({
    where: { isArchived: false },
    include: { currency: true },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  })
  const rates = await latestRates(db)
  const rows: CashboxReportRow[] = []
  const totalsBase = { opening: 0, in: 0, out: 0, closing: 0 }
  for (const b of boxes) {
    const txs = await db.cashTx.findMany({
      where: { OR: [{ cashboxId: b.id }, { toCashboxId: b.id }], txDate: { lte: p.to } },
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
    let opening = 0
    let inSum = 0
    let outSum = 0
    let count = 0
    let current = 0
    const boxRate = b.currency.isBase ? 1 : (rates.get(b.currencyId) ?? 1)
    for (const t of txs) {
      let amount = t.amount
      if (t.currencyId !== b.currencyId) {
        const r = b.currency.isBase ? 1 : (rates.get(b.currencyId) ?? 1)
        amount = (t.amount * (t.exchangeRate || 1)) / (r > 0 ? r : 1)
      }
      const sign =
        t.cashboxId === b.id
          ? t.txType === "receipt" || t.txType === "opening" || t.txType === "bank_withdraw"
            ? 1
            : -1
          : t.toCashboxId === b.id
            ? t.txType === "box_transfer" || t.txType === "bank_deposit"
              ? 1
              : t.txType === "bank_withdraw"
                ? -1
                : 0
            : 0
      current += sign * amount
      if (t.txDate < p.from) {
        opening += sign * amount
      } else {
        count += 1
        if (sign > 0) inSum += amount
        else if (sign < 0) outSum += amount
      }
    }
    const closing = opening + inSum - outSum
    rows.push({
      id: b.id,
      name: b.name,
      currencyCode: b.currency.code,
      opening: round2(opening),
      in: round2(inSum),
      out: round2(outSum),
      closing: round2(closing),
      current: round2(current),
      txCount: count,
    })
    totalsBase.opening = round2(totalsBase.opening + opening * boxRate)
    totalsBase.in = round2(totalsBase.in + inSum * boxRate)
    totalsBase.out = round2(totalsBase.out + outSum * boxRate)
    totalsBase.closing = round2(totalsBase.closing + closing * boxRate)
  }
  return { period: p, rows, totalsBase }
}

// ═══════════════════════════════════════════════════════════════
// 8) تقرير الضريبة (FR-09-07)
// ═══════════════════════════════════════════════════════════════

export interface TaxReport {
  period: PeriodFilter
  baseCurrency: string
  sales: { count: number; total: number; totalBase: number; tax: number }
  purchases: { count: number; total: number; totalBase: number; tax: number }
  returns: { salesReturnsBase: number; purchaseReturnsBase: number }
  netTax: number
}

export async function taxReport(db: AnyDb, p: PeriodFilter): Promise<TaxReport> {
  const agg = (docType: string) =>
    db.invoice.aggregate({
      _sum: { total: true, totalBase: true, taxAmount: true },
      _count: true,
      where: {
        docType,
        status: "completed",
        issuedAt: { gte: p.from, lte: p.to },
      },
    })
  const [sales, purchases, salesTax, purchasesTax, salesReturns, purchaseReturns, base] =
    await Promise.all([
      agg("sale"),
      agg("purchase"),
      sumTaxBase(db, "sale", p),
      sumTaxBase(db, "purchase", p),
      db.invoice.aggregate({
        _sum: { totalBase: true },
        where: { docType: "sale_return", status: "completed", issuedAt: { gte: p.from, lte: p.to } },
      }),
      db.invoice.aggregate({
        _sum: { totalBase: true },
        where: { docType: "purchase_return", status: "completed", issuedAt: { gte: p.from, lte: p.to } },
      }),
      baseCurrencyCode(db),
    ])
  return {
    period: p,
    baseCurrency: base,
    sales: {
      count: sales._count,
      total: round2(sales._sum.total ?? 0),
      totalBase: round2(sales._sum.totalBase ?? 0),
      tax: round2(salesTax),
    },
    purchases: {
      count: purchases._count,
      total: round2(purchases._sum.total ?? 0),
      totalBase: round2(purchases._sum.totalBase ?? 0),
      tax: round2(purchasesTax),
    },
    returns: {
      salesReturnsBase: round2(salesReturns._sum.totalBase ?? 0),
      purchaseReturnsBase: round2(purchaseReturns._sum.totalBase ?? 0),
    },
    netTax: round2(salesTax - purchasesTax),
  }
}

async function sumTaxBase(db: AnyDb, docType: string, p: PeriodFilter): Promise<number> {
  const rows = await db.invoice.findMany({
    where: { docType, status: "completed", issuedAt: { gte: p.from, lte: p.to } },
    select: { taxAmount: true, exchangeRate: true },
  })
  return rows.reduce((s, r) => s + toBase(r.taxAmount, r.exchangeRate), 0)
}

// ═══════════════════════════════════════════════════════════════
// 9) تقرير أداء المناديب (FR-06-04)
// ═══════════════════════════════════════════════════════════════

export interface RepReportRow {
  repId: number
  name: string
  commissionType: string
  commissionPercent: number
  invoices: number
  salesBase: number
  returnsBase: number
  collectionsBase: number
  commissionsEarned: number
  commissionsPaid: number
  commissionsDue: number
}

export interface RepsReport {
  period: PeriodFilter
  baseCurrency: string
  rows: RepReportRow[]
  totals: {
    invoices: number
    salesBase: number
    returnsBase: number
    collectionsBase: number
    commissionsEarned: number
    commissionsPaid: number
    commissionsDue: number
  }
}

export async function repsReport(db: AnyDb, p: PeriodFilter): Promise<RepsReport> {
  const reps = await db.salesRep.findMany({ where: { isArchived: false }, orderBy: { id: "asc" } })
  const base = await baseCurrencyCode(db)
  const rows: RepReportRow[] = []
  const totals = {
    invoices: 0,
    salesBase: 0,
    returnsBase: 0,
    collectionsBase: 0,
    commissionsEarned: 0,
    commissionsPaid: 0,
    commissionsDue: 0,
  }

  for (const rep of reps) {
    const [salesAgg, returnsAgg, commissionRows] = await Promise.all([
      db.invoice.aggregate({
        _sum: { totalBase: true },
        _count: true,
        where: {
          docType: "sale",
          status: "completed",
          salesRepId: rep.id,
          issuedAt: { gte: p.from, lte: p.to },
        },
      }),
      db.invoice.aggregate({
        _sum: { totalBase: true },
        where: {
          docType: "sale_return",
          status: "completed",
          salesRepId: rep.id,
          issuedAt: { gte: p.from, lte: p.to },
        },
      }),
      db.commission.findMany({
        where: { salesRepId: rep.id },
        select: {
          refType: true
          , baseAmount: true
          , amount: true
          , status: true
          , createdAt: true
          , payoutTx: { select: { txDate: true } }
        },
      }),
    ])
    let collections = 0
    let earned = 0
    let paid = 0
    let due = 0
    for (const c of commissionRows) {
      const createdDay = dateOnly(c.createdAt)
      if (c.refType === "collection" && createdDay >= p.from && createdDay <= p.to) {
        collections += c.baseAmount
      }
      if (createdDay >= p.from && createdDay <= p.to) earned += c.amount
      if (c.status === "paid" && c.payoutTx && c.payoutTx.txDate >= p.from && c.payoutTx.txDate <= p.to) {
        paid += c.amount
      }
      if (c.status === "due") due += c.amount
    }
    const row: RepReportRow = {
      repId: rep.id,
      name: rep.name,
      commissionType: rep.commissionType,
      commissionPercent: rep.commissionPercent,
      invoices: salesAgg._count,
      salesBase: round2(salesAgg._sum.totalBase ?? 0),
      returnsBase: round2(returnsAgg._sum.totalBase ?? 0),
      collectionsBase: round2(collections),
      commissionsEarned: round2(earned),
      commissionsPaid: round2(paid),
      commissionsDue: round2(due),
    }
    rows.push(row)
    totals.invoices += row.invoices
    totals.salesBase = round2(totals.salesBase + row.salesBase)
    totals.returnsBase = round2(totals.returnsBase + row.returnsBase)
    totals.collectionsBase = round2(totals.collectionsBase + row.collectionsBase)
    totals.commissionsEarned = round2(totals.commissionsEarned + row.commissionsEarned)
    totals.commissionsPaid = round2(totals.commissionsPaid + row.commissionsPaid)
    totals.commissionsDue = round2(totals.commissionsDue + row.commissionsDue)
  }
  rows.sort((a, b) => b.salesBase - a.salesBase)
  return { period: p, baseCurrency: base, rows, totals }
}
