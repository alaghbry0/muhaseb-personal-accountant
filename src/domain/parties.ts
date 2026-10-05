/**
 * Domain — الأطراف (العملاء/الموردون) — Task 3-b ⭐
 * أرصدة حية + سندات قبض/صرف + كشوف الحسابات — FR-03.
 *
 * ═══════════════ اتفاقية الأرصدة (متسقة مع Task 2 — موثقة في worklog) ═══════════════
 * رصيد العميل (مدين موجب = مديون لنا):
 *   opening + Σ(due فواتير البيع المكتملة × السعر)   ← الجزء الآجل وقت الإصدار (ثابت لا يُعدَّل لاحقاً)
 *          − Σ(due مرتجعات البيع × السعر)             ← الجزء المُسقط من حساب العميل (ائتمان)
 *          + Σ(أصل الخطط المستقلة)                     ← خطط «مبلغ مخصص» بلا فاتورة (FR-05-01)
 *          − Σ(قبض من العميل بأي refType ≠ 'invoice')  ← سندات قبض حرة/مرتبطة + دفعات أولى + تحصيل أقساط
 *          + Σ(صرف للعميل بأي refType ≠ 'invoice')     ← مستردات نقدية للعميل (سند صرف)
 * • دفع البيع النقدي وقت الحفظ (refType='invoice') مستثنى — منعكس أصلاً في due الفاتورة (اتفاقية Task 2).
 * • due الفاتورة لا يُعدَّل أبداً بعد الإصدار → تاريخ الكشف مستقر (كل تحصيل لاحق = سند قبض).
 * رصيد المورد (موجب = مستحق له):
 *   opening + Σ(due فواتير الشراء) − Σ(due مرتجعات الشراء)
 *          − Σ(صرف للمورد refType ≠ 'invoice') + Σ(قبض من المورد refType ≠ 'invoice')
 */
import type { Prisma, PrismaClient } from "@prisma/client"
import { round2, round4, toBase } from "./money"
import { DomainError } from "./invoice-save"

type Tx = Prisma.TransactionClient
type AnyDb = PrismaClient | Prisma.TransactionClient

export type PartyType = "customer" | "supplier"
export type VoucherKind = "receipt" | "payment"

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ═══════════════ سعر الصرف ═══════════════

export async function resolveRate(
  tx: Tx,
  currencyId: number,
  rate: number | null | undefined,
  date: string
): Promise<{ id: number; isBase: boolean; rate: number }> {
  const currency = await tx.currency.findUnique({ where: { id: currencyId } })
  if (!currency || !currency.isActive) throw new DomainError("العملة غير متاحة")
  if (currency.isBase) return { id: currency.id, isBase: true, rate: 1 }
  const given = Number(rate ?? 0)
  if (given > 0) return { id: currency.id, isBase: false, rate: given }
  const row =
    (await tx.exchangeRate.findUnique({
      where: { currencyId_rateDate: { currencyId: currency.id, rateDate: date } },
    })) ??
    (await tx.exchangeRate.findFirst({
      where: { currencyId: currency.id },
      orderBy: { rateDate: "desc" },
    }))
  if (!row || row.rate <= 0) {
    throw new DomainError("لا يوجد سعر صرف لهذه العملة بتاريخ العملية — أدخل السعر يدوياً")
  }
  return { id: currency.id, isBase: false, rate: row.rate }
}

async function baseCurrency(tx: Tx): Promise<{ id: number; code: string }> {
  const base = await tx.currency.findFirst({ where: { isBase: true } })
  if (!base) throw new DomainError("لا توجد عملة أساسية معرّفة")
  return { id: base.id, code: base.code }
}

// ═══════════════ الأرصدة الحية ═══════════════

/** due فواتير الطرف بالأساس: saleDue/purchaseDue و returnDue (المرتجعات) */
async function partyInvoiceDue(
  db: AnyDb,
  party: PartyType,
  partyId: number
): Promise<{ purchaseDue: number; returnDue: number; movements: number }> {
  const rows = await db.invoice.findMany({
    where:
      party === "customer"
        ? { customerId: partyId, status: "completed", docType: { in: ["sale", "sale_return"] } }
        : { supplierId: partyId, status: "completed", docType: { in: ["purchase", "purchase_return"] } },
    select: { docType: true, dueAmount: true, exchangeRate: true },
  })
  let purchaseDue = 0 // «purchaseDue» = بيع آجل للعميل (موجب) أو مشتريات آجلة من المورد (موجب)
  let returnDue = 0 // المرتجعات: due سالب إلزامياً (اتفاقية Task 3-a: refundMethod='credit' → due = −total)
  for (const r of rows) {
    const v = round4(toBase(r.dueAmount, r.exchangeRate))
    if (r.docType === "sale_return" || r.docType === "purchase_return") returnDue = round4(returnDue + v)
    else purchaseDue = round4(purchaseDue + v)
  }
  return { purchaseDue, returnDue, movements: rows.length }
}

/** أصل الخطط المستقلة (بلا فاتورة) — دين يُنشأ عند إنشاء الخطة (تلغى فقط إن لم يُدفع منها شيء) */
async function standalonePrincipal(db: AnyDb, customerId: number) {
  const plans = await db.installmentPlan.findMany({
    where: { customerId, invoiceId: null },
    select: { principal: true, status: true, totalPaid: true },
  })
  let total = 0
  for (const p of plans) {
    if (p.status === "cancelled" && p.totalPaid <= 0.005) continue
    total = round4(total + p.principal)
  }
  return total
}

/** صافي السندات غير المرتبطة بدفع وقت الإصدار: refType ≠ 'invoice' — محوّل للأساس */
async function partyVouchersBase(
  db: AnyDb,
  party: PartyType,
  partyId: number
): Promise<{ receiptsBase: number; paymentsBase: number }> {
  const where =
    party === "customer"
      ? { customerId: partyId, refType: { not: "invoice" as const } }
      : { supplierId: partyId, refType: { not: "invoice" as const } }
  const [recRows, payRows] = await Promise.all([
    db.cashTx.findMany({
      where: { ...where, txType: "receipt" },
      select: { amount: true, exchangeRate: true },
    }),
    db.cashTx.findMany({
      where: { ...where, txType: "payment" },
      select: { amount: true, exchangeRate: true },
    }),
  ])
  let receiptsBase = 0
  for (const r of recRows) receiptsBase = round4(receiptsBase + toBase(r.amount, r.exchangeRate))
  let paymentsBase = 0
  for (const p of payRows) paymentsBase = round4(paymentsBase + toBase(p.amount, p.exchangeRate))
  return { receiptsBase, paymentsBase }
}

/**
 * رصيد العميل الحالي (مدين موجب؛ سالب = دائن — دفعات مقدمة/مستردات).
 * الدالة المرجعية لكل الشاشات (Task 4/5 يستوردونها من هنا).
 */
export async function computeCustomerBalance(db: AnyDb, customerId: number): Promise<number> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { openingBalance: true },
  })
  if (!customer) return 0
  const [inv, standalone, vouch] = await Promise.all([
    partyInvoiceDue(db, "customer", customerId),
    standalonePrincipal(db, customerId),
    partyVouchersBase(db, "customer", customerId),
  ])
  return round2(
    customer.openingBalance +
      inv.purchaseDue +
      inv.returnDue + // سالب — المرتجعات المُسقطة من حساب العميل (ائتمان)
      standalone -
      vouch.receiptsBase +
      vouch.paymentsBase
  )
}

/** رصيد المورد الحالي (موجب = مستحق له) */
export async function computeSupplierBalance(db: AnyDb, supplierId: number): Promise<number> {
  const supplier = await db.supplier.findUnique({
    where: { id: supplierId },
    select: { openingBalance: true },
  })
  if (!supplier) return 0
  const [inv, vouch] = await Promise.all([
    partyInvoiceDue(db, "supplier", supplierId),
    partyVouchersBase(db, "supplier", supplierId),
  ])
  return round2(
    supplier.openingBalance + inv.purchaseDue + inv.returnDue - vouch.paymentsBase + vouch.receiptsBase
  )
}

// ═══════════════ سندات القبض/الصرف ═══════════════

export interface SaveVoucherPayload {
  kind: VoucherKind
  partyType: PartyType
  partyId: number
  amount: number
  currencyId?: number | null
  exchangeRate?: number | null
  cashboxId: number
  txDate?: string
  description?: string | null
  /** ربط السند بفاتورة مفتوحة (اختياري — للعرض والتذكير؛ لا يغيّر due الفاتورة) */
  refInvoiceId?: number | null
}

export interface VoucherDto {
  id: number
  kind: VoucherKind
  partyType: PartyType
  partyId: number
  partyName: string
  partyPhone: string | null
  amount: number
  currencyCode: string
  exchangeRate: number
  amountBase: number
  cashboxId: number
  cashboxName: string
  txDate: string
  createdAt: string
  description: string | null
  refInvoiceId: number | null
  refInvoiceNo: string | null
  /** رقم العرض: V-{cashTx.id} */
  number: string
}

export async function saveVoucher(
  db: PrismaClient,
  payload: SaveVoucherPayload
): Promise<{ voucher: VoucherDto; partyBalance: number; overpayWarning: boolean }> {
  const txDate = payload.txDate || todayStr()
  return db.$transaction(async (tx) => {
    if (!(Number(payload.amount) > 0)) throw new DomainError("مبلغ السند يجب أن يكون أكبر من صفر")
    if (!payload.cashboxId) throw new DomainError("اختر الصندوق")

    const cashbox = await tx.cashbox.findFirst({ where: { id: payload.cashboxId, isArchived: false } })
    if (!cashbox) throw new DomainError("الصندوق غير موجود أو مؤرشف")

    // الطرف
    let partyName = ""
    let partyPhone: string | null = null
    if (payload.partyType === "customer") {
      const c = await tx.customer.findFirst({ where: { id: payload.partyId, isArchived: false } })
      if (!c) throw new DomainError("العميل غير موجود أو مؤرشف")
      partyName = c.name
      partyPhone = c.whatsapp || c.phone
    } else {
      const s = await tx.supplier.findFirst({ where: { id: payload.partyId, isArchived: false } })
      if (!s) throw new DomainError("المورد غير موجود أو مؤرشف")
      partyName = s.name
      partyPhone = s.phone
    }

    // العملة والسعر
    const base = await baseCurrency(tx)
    const resolved = await resolveRate(tx, payload.currencyId ?? base.id, payload.exchangeRate ?? null, txDate)
    const currencyCode = (
      await tx.currency.findUnique({ where: { id: resolved.id }, select: { code: true } })
    )?.code

    // ربط فاتورة مفتوحة (اختياري)
    let refInvoiceId: number | null = null
    let refInvoiceNo: string | null = null
    if (payload.refInvoiceId) {
      const inv = await tx.invoice.findFirst({
        where: {
          id: payload.refInvoiceId,
          status: "completed",
          dueAmount: { gt: 0 },
          ...(payload.partyType === "customer"
            ? { docType: { in: ["sale", "sale_return"] } }
            : { docType: { in: ["purchase", "purchase_return"] } }),
          ...(payload.partyType === "customer"
            ? { customerId: payload.partyId }
            : { supplierId: payload.partyId }),
        },
        select: { id: true, invoiceNo: true },
      })
      if (!inv) throw new DomainError("الفاتورة المرتبطة غير موجودة أو مسددة بالكامل")
      refInvoiceId = inv.id
      refInvoiceNo = inv.invoiceNo
    }

    const kindLabel = payload.kind === "receipt" ? "قبض" : "صرف"
    const row = await tx.cashTx.create({
      data: {
        txType: payload.kind,
        cashboxId: cashbox.id,
        currencyId: resolved.id,
        amount: round4(payload.amount),
        exchangeRate: resolved.rate,
        txDate,
        refType: "voucher",
        refId: refInvoiceId,
        customerId: payload.partyType === "customer" ? payload.partyId : null,
        supplierId: payload.partyType === "supplier" ? payload.partyId : null,
        description:
          payload.description?.trim() ||
          `سند ${kindLabel} — ${partyName}${refInvoiceNo ? ` (فاتورة ${refInvoiceNo})` : ""}`,
      },
      include: { cashbox: { select: { name: true } }, currency: { select: { code: true } } },
    })

    const partyBalance =
      payload.partyType === "customer"
        ? await computeCustomerBalance(tx, payload.partyId)
        : await computeSupplierBalance(tx, payload.partyId)

    // تحذير الدفعات المقدمة (مسموح لكن يُعلم): قبض من عميل أكبر من مديونيته / صرف لمورد أكبر من مستحقه
    const overpayWarning =
      (payload.partyType === "customer" && payload.kind === "receipt" && partyBalance < 0) ||
      (payload.partyType === "supplier" && payload.kind === "payment" && partyBalance < 0)

    const voucher: VoucherDto = {
      id: row.id,
      kind: payload.kind,
      partyType: payload.partyType,
      partyId: payload.partyId,
      partyName,
      partyPhone,
      amount: row.amount,
      currencyCode: row.currency.code,
      exchangeRate: row.exchangeRate,
      amountBase: round4(toBase(row.amount, row.exchangeRate)),
      cashboxId: cashbox.id,
      cashboxName: row.cashbox.name,
      txDate: row.txDate,
      createdAt: row.createdAt.toISOString(),
      description: row.description,
      refInvoiceId,
      refInvoiceNo,
      number: `V-${row.id}`,
    }
    return { voucher, partyBalance, overpayWarning }
  })
}

/** قائمة سندات القبض/الصرف (refType='voucher') بفلاتر الطرف/النوع/التاريخ */
export async function listVouchers(
  db: PrismaClient,
  filters: { kind?: string; partyType?: string; partyId?: number; from?: string; to?: string; limit?: number }
): Promise<VoucherDto[]> {
  const rows = await db.cashTx.findMany({
    where: {
      refType: "voucher",
      ...(filters.kind === "receipt" || filters.kind === "payment" ? { txType: filters.kind } : {}),
      ...(filters.partyType === "customer" && filters.partyId ? { customerId: filters.partyId } : {}),
      ...(filters.partyType === "supplier" && filters.partyId ? { supplierId: filters.partyId } : {}),
      ...(filters.from || filters.to
        ? {
            txDate: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ txDate: "desc" }, { id: "desc" }],
    take: Math.min(200, Math.max(1, filters.limit ?? 50)),
    include: { cashbox: { select: { name: true } }, currency: { select: { code: true } } },
  })

  const customerIds = rows.filter((r) => r.customerId).map((r) => r.customerId!)
  const supplierIds = rows.filter((r) => r.supplierId).map((r) => r.supplierId!)
  const invoiceIds = rows.filter((r) => r.refId).map((r) => r.refId!)
  const [customers, suppliers, invoices] = await Promise.all([
    customerIds.length
      ? db.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, whatsapp: true, phone: true } })
      : Promise.resolve([] as Array<{ id: number; name: string; whatsapp: string | null; phone: string | null }>),
    supplierIds.length
      ? db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, name: true, phone: true } })
      : Promise.resolve([] as Array<{ id: number; name: string; phone: string | null }>),
    invoiceIds.length
      ? db.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, invoiceNo: true } })
      : Promise.resolve([] as Array<{ id: number; invoiceNo: string }>),
  ])
  const cMap = new Map(customers.map((c) => [c.id, c]))
  const sMap = new Map(suppliers.map((s) => [s.id, s]))
  const iMap = new Map(invoices.map((i) => [i.id, i.invoiceNo]))

  return rows.map((r) => {
    const c = r.customerId ? cMap.get(r.customerId) : undefined
    const s = r.supplierId ? sMap.get(r.supplierId) : undefined
    return {
      id: r.id,
      kind: r.txType as VoucherKind,
      partyType: (r.customerId ? "customer" : "supplier") as PartyType,
      partyId: (r.customerId ?? r.supplierId)!,
      partyName: c?.name ?? s?.name ?? "—",
      partyPhone: c ? c.whatsapp || c.phone : s?.phone ?? null,
      amount: r.amount,
      currencyCode: r.currency.code,
      exchangeRate: r.exchangeRate,
      amountBase: round4(toBase(r.amount, r.exchangeRate)),
      cashboxId: r.cashboxId,
      cashboxName: r.cashbox.name,
      txDate: r.txDate,
      createdAt: r.createdAt.toISOString(),
      description: r.description,
      refInvoiceId: r.refId,
      refInvoiceNo: r.refId ? iMap.get(r.refId) ?? null : null,
      number: `V-${r.id}`,
    }
  })
}

// ═══════════════ كشف الحساب (Statement) ═══════════════

export interface StatementRow {
  date: string
  /** opening | sale_invoice | sale_return | purchase_invoice | purchase_return | plan | receipt_voucher | payment_voucher */
  docType: string
  docLabel: string
  docNo: string | null
  refId: number | null
  /** مدين — يزيد ما على الطرف */
  debit: number
  /** دائن — يخفض ما على الطرف */
  credit: number
  /** الرصيد بعد الحركة (مدين موجب) */
  balance: number
}

export interface StatementResult {
  partyType: PartyType
  partyId: number
  partyName: string
  from: string
  to: string
  /** رصيد أول الفترة (قبل حركاتها) */
  openingBalance: number
  rows: StatementRow[]
  totals: { debit: number; credit: number }
  closingBalance: number
  baseCurrencyCode: string
  transactionsCount: number
}

interface Movement {
  date: string
  seq: number
  docType: string
  docLabel: string
  docNo: string | null
  refId: number | null
  debit: number
  credit: number
}

/** حركات الطرف كاملة بالأساس — أساس كشوف الحساب (مرتبة تصاعدياً) */
export async function getPartyMovements(
  db: AnyDb,
  party: PartyType,
  partyId: number
): Promise<Movement[]> {
  const out: Movement[] = []
  let seq = 0
  const push = (m: Omit<Movement, "seq">) => out.push({ seq: ++seq, ...m })

  const partyRow =
    party === "customer"
      ? await db.customer.findUnique({ where: { id: partyId }, select: { id: true } })
      : await db.supplier.findUnique({ where: { id: partyId }, select: { id: true } })
  if (!partyRow) throw new DomainError(party === "customer" ? "العميل غير موجود" : "المورد غير موجود", 404)

  // فواتير آجلة (due وقت الإصدار — ثابت تاريخياً) ومرتجعاتها
  const invoices = await db.invoice.findMany({
    where:
      party === "customer"
        ? { customerId: partyId, status: "completed", docType: { in: ["sale", "sale_return"] } }
        : { supplierId: partyId, status: "completed", docType: { in: ["purchase", "purchase_return"] } },
    orderBy: [{ issuedAt: "asc" }, { id: "asc" }],
    select: { id: true, invoiceNo: true, docType: true, issuedAt: true, dueAmount: true, exchangeRate: true },
  })
  const isReturn = (d: string) => d === "sale_return" || d === "purchase_return"
  for (const inv of invoices) {
    // due موجب للبيع/الشراء الآجل، سالب للمرتجعات المُسقطة من الحساب (اتفاقية Task 3-a)
    const v = round4(toBase(inv.dueAmount, inv.exchangeRate))
    if (Math.abs(v) < 0.005) continue // مسددة نقداً وقت الإصدار — لا أثر على الحساب
    const ret = isReturn(inv.docType)
    push({
      date: inv.issuedAt,
      docType: ret
        ? party === "customer"
          ? "sale_return"
          : "purchase_return"
        : party === "customer"
          ? "sale_invoice"
          : "purchase_invoice",
      docLabel: ret
        ? party === "customer"
          ? "مرتجع بيع"
          : "مرتجع مشتريات"
        : party === "customer"
          ? "فاتورة بيع (آجل)"
          : "فاتورة مشتريات (آجل)",
      docNo: inv.invoiceNo,
      refId: inv.id,
      debit: ret ? 0 : v,
      credit: ret ? Math.abs(v) : 0,
    })
  }

  if (party === "customer") {
    // خطط مستقلة — دين مخصص بلا فاتورة: الأصل كاملاً عند الإنشاء (الدفعة الأولى والتحصيلات سندات قبض)
    const plans = await db.installmentPlan.findMany({
      where: { customerId: partyId, invoiceId: null },
      select: { id: true, principal: true, status: true, totalPaid: true, currencyId: true, createdAt: true },
    })
    for (const plan of plans) {
      if (plan.status === "cancelled" && plan.totalPaid <= 0.005) continue
      if (Math.abs(plan.principal) < 0.005) continue
      push({
        date: plan.createdAt.toISOString().slice(0, 10),
        docType: "plan",
        docLabel: "خطة تقسيط (مبلغ مخصص)",
        docNo: `PLAN-${plan.id}`,
        refId: plan.id,
        debit: round4(plan.principal),
        credit: 0,
      })
    }
  }

  // سندات القبض من الطرف (refType ≠ 'invoice') — تشمل دفعات أولى وتحصيلات أقساط
  const receipts = await db.cashTx.findMany({
    where:
      party === "customer"
        ? { customerId: partyId, txType: "receipt", refType: { not: "invoice" } }
        : { supplierId: partyId, txType: "receipt", refType: { not: "invoice" } },
    orderBy: [{ txDate: "asc" }, { id: "asc" }],
    select: { id: true, amount: true, exchangeRate: true, txDate: true, refType: true, refId: true },
  })
  for (const r of receipts) {
    const v = round4(toBase(r.amount, r.exchangeRate))
    if (Math.abs(v) < 0.005) continue
    let label = party === "customer" ? "سند قبض" : "سند قبض من مورد"
    if (r.refType === "installment") {
      label = "تحصيل قسط"
    }
    push({
      date: r.txDate,
      docType: "receipt_voucher",
      docLabel: label,
      docNo: `V-${r.id}`,
      refId: r.refId,
      debit: party === "supplier" ? v : 0,
      credit: party === "customer" ? v : 0,
    })
  }

  // سندات الصرف للطرف (refType ≠ 'invoice')
  const payments = await db.cashTx.findMany({
    where:
      party === "customer"
        ? { customerId: partyId, txType: "payment", refType: { not: "invoice" } }
        : { supplierId: partyId, txType: "payment", refType: { not: "invoice" } },
    orderBy: [{ txDate: "asc" }, { id: "asc" }],
    select: { id: true, amount: true, exchangeRate: true, txDate: true, refId: true },
  })
  for (const p of payments) {
    const v = round4(toBase(p.amount, p.exchangeRate))
    if (Math.abs(v) < 0.005) continue
    push({
      date: p.txDate,
      docType: "payment_voucher",
      docLabel: party === "customer" ? "سند صرف (مسترد للعميل)" : "سند صرف",
      docNo: `V-${p.id}`,
      refId: p.refId,
      debit: party === "customer" ? v : 0,
      credit: party === "supplier" ? v : 0,
    })
  }

  out.sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1))
  return out
}

/**
 * كشف حساب: رصيد ما قبل الفترة + صفوف الفترة (مدين/دائن/رصيد متحرك) + إجماليات.
 * from/to اختيارية. بدون from: يُدرج سطر «رصيد افتتاحي» بالرصيد الرأسي للطرف.
 */
export async function getStatement(
  db: AnyDb,
  opts: { partyType: PartyType; partyId: number; from?: string; to?: string }
): Promise<StatementResult> {
  const { partyType, partyId } = opts
  const from = opts.from || ""
  const to = opts.to || ""

  const partyRow =
    partyType === "customer"
      ? await db.customer.findUnique({ where: { id: partyId }, select: { name: true, openingBalance: true } })
      : await db.supplier.findUnique({ where: { id: partyId }, select: { name: true, openingBalance: true } })
  if (!partyRow) {
    throw new DomainError(partyType === "customer" ? "العميل غير موجود" : "المورد غير موجود", 404)
  }

  const movements = await getPartyMovements(db, partyType, partyId)

  // الرصيد أول الفترة: الرأسي + صافي كل الحركات قبل from
  // (بدون from = كل الحركات داخل الفترة — الافتتاحي الرأسي فقط)
  let openingAtFrom = partyRow.openingBalance
  if (from) {
    for (const m of movements) {
      if (m.date >= from) break
      openingAtFrom = round4(openingAtFrom + m.debit - m.credit)
    }
  }

  const rows: StatementRow[] = []
  let running = openingAtFrom

  // بدون from: نعرض الرصيد الرأسي كسطر افتتاحي
  if (!from) {
    rows.push({
      date: "",
      docType: "opening",
      docLabel: "رصيد افتتاحي",
      docNo: null,
      refId: null,
      debit: partyRow.openingBalance > 0 ? partyRow.openingBalance : 0,
      credit: partyRow.openingBalance < 0 ? -partyRow.openingBalance : 0,
      balance: partyRow.openingBalance,
    })
  }

  const inRange = movements.filter((m) => (!from || m.date >= from) && (!to || m.date <= to))
  for (const m of inRange) {
    running = round4(running + m.debit - m.credit)
    rows.push({
      date: m.date,
      docType: m.docType,
      docLabel: m.docLabel,
      docNo: m.docNo,
      refId: m.refId,
      debit: m.debit,
      credit: m.credit,
      balance: running,
    })
  }

  const totals = rows.reduce(
    (acc, r) => ({ debit: round4(acc.debit + r.debit), credit: round4(acc.credit + r.credit) }),
    { debit: 0, credit: 0 }
  )
  const base = await db.currency.findFirst({ where: { isBase: true }, select: { code: true } })

  return {
    partyType,
    partyId,
    partyName: partyRow.name,
    from,
    to,
    openingBalance: openingAtFrom,
    rows,
    totals,
    closingBalance: rows.length ? rows[rows.length - 1].balance! : openingAtFrom,
    baseCurrencyCode: base?.code ?? "YER",
    transactionsCount: inRange.length,
  }
}

// ═══════════════ DTO القوائم ═══════════════

export interface CustomerDto {
  id: number
  name: string
  phone: string | null
  whatsapp: string | null
  address: string | null
  area: string | null
  creditLimit: number
  openingBalance: number
  notes: string | null
  isArchived: boolean
  balance: number
  /** تجاوز حد الائتمان؟ (creditLimit > 0 && balance > creditLimit) */
  overLimit: boolean
}

export interface SupplierDto {
  id: number
  name: string
  phone: string | null
  address: string | null
  openingBalance: number
  notes: string | null
  isArchived: boolean
  balance: number
}

/** بطاقة عميل: بيانات + إحصاءات + آخر 5 فواتير + الأقساط المتأخرة */
export async function getCustomerFile(db: AnyDb, customerId: number) {
  const customer = await db.customer.findUnique({ where: { id: customerId } })
  if (!customer) throw new DomainError("العميل غير موجود", 404)
  const balance = await computeCustomerBalance(db, customerId)

  const [salesAgg, lastInvoices, plans] = await Promise.all([
    db.invoice.aggregate({
      _sum: { totalBase: true },
      _count: true,
      where: { customerId, docType: "sale", status: "completed" },
    }),
    db.invoice.findMany({
      where: { customerId, docType: "sale", status: "completed" },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true, invoiceNo: true, issuedAt: true, payStatus: true,
        total: true, dueAmount: true,
        currency: { select: { code: true } },
      },
    }),
    db.installmentPlan.findMany({
      where: { customerId, status: { in: ["active", "defaulted"] } },
      include: { installments: true, invoice: { select: { invoiceNo: true } } },
    }),
  ])

  const today = todayStr()
  const overdue: Array<{
    planId: number
    seq: number
    installmentId: number
    dueDate: string
    amount: number
    remaining: number
    invoiceNo: string | null
  }> = []
  for (const plan of plans) {
    for (const inst of plan.installments) {
      if ((inst.status === "pending" || inst.status === "partial") && inst.dueDate < today) {
        overdue.push({
          planId: plan.id,
          seq: inst.seq,
          installmentId: inst.id,
          dueDate: inst.dueDate,
          amount: inst.amount,
          remaining: round2(inst.amount - inst.paidAmount),
          invoiceNo: plan.invoice?.invoiceNo ?? null,
        })
      }
    }
  }
  overdue.sort((a, b) => (a.dueDate === b.dueDate ? a.seq - b.seq : a.dueDate < b.dueDate ? -1 : 1))

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      whatsapp: customer.whatsapp,
      address: customer.address,
      area: customer.area,
      creditLimit: customer.creditLimit,
      openingBalance: customer.openingBalance,
      notes: customer.notes,
      isArchived: customer.isArchived,
      balance,
      overLimit: customer.creditLimit > 0 && balance > customer.creditLimit,
    } satisfies CustomerDto,
    stats: {
      salesTotalBase: round4(salesAgg._sum.totalBase ?? 0),
      invoicesCount: salesAgg._count,
    },
    lastInvoices: lastInvoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      issuedAt: inv.issuedAt,
      payStatus: inv.payStatus,
      total: inv.total,
      dueAmount: inv.dueAmount,
      currencyCode: inv.currency.code,
    })),
    overdueInstallments: overdue,
  }
}

/** بطاقة مورد: بيانات + إحصاءات + آخر فواتير الشراء */
export async function getSupplierFile(db: AnyDb, supplierId: number) {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
  if (!supplier) throw new DomainError("المورد غير موجود", 404)
  const balance = await computeSupplierBalance(db, supplierId)
  const [purchasesAgg, lastInvoices] = await Promise.all([
    db.invoice.aggregate({
      _sum: { totalBase: true },
      _count: true,
      where: { supplierId, docType: "purchase", status: "completed" },
    }),
    db.invoice.findMany({
      where: { supplierId, docType: { in: ["purchase", "purchase_return"] }, status: "completed" },
      orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
      take: 5,
      select: {
        id: true, invoiceNo: true, issuedAt: true, payStatus: true, docType: true,
        total: true, dueAmount: true,
        currency: { select: { code: true } },
      },
    }),
  ])
  return {
    supplier: {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address,
      openingBalance: supplier.openingBalance,
      notes: supplier.notes,
      isArchived: supplier.isArchived,
      balance,
    } satisfies SupplierDto,
    stats: {
      purchasesTotalBase: round4(purchasesAgg._sum.totalBase ?? 0),
      invoicesCount: purchasesAgg._count,
    },
    lastInvoices: lastInvoices.map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      issuedAt: inv.issuedAt,
      payStatus: inv.payStatus,
      docType: inv.docType,
      total: inv.total,
      dueAmount: inv.dueAmount,
      currencyCode: inv.currency.code,
    })),
  }
}
