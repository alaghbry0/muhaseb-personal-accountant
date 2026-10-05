/**
 * Domain — الحفظ الذرّي لفاتورة البيع ⭐ (قلب التطبيق) — SRS FR-02 + قاعدة §5.4-3.
 *
 * saveSaleInvoice(db, payload) تنفَّذ كاملة داخل db.$transaction واحدة:
 *   1) التحقق من كل المدخلات (أصناف/مخزون/أطراف/صندوق) قبل أي كتابة.
 *   2) ترقيم PREFIX-YYYY-NNNNN لكل نوع مستند وسنة (لا يُعاد استخدام رقم أبداً — §5.4-1).
 *   3) الإجماليات عبر domain/invoice (نقية) + totalBase بالعملة الأساسية.
 *   4) لكل بند: حركة مخزون sale (سالبة بتكلفة الصنف الحالية) + خصم رصيد المخزن
 *      مع منع السالب («الكمية غير كافية في المخزن — المتوفر: X»).
 *   5) المعلّق (held): status='draft' بلا أي أثر مخزني/نقدي (FR-02-03).
 *   6) الدفع النقدي (ولو جزئي): حركة صندوق receipt مرتبطة بالفاتورة.
 *   7) عمولة المندوب (sales/both) على totalBase.
 * ملاحظات:
 *   - line_cost تُخزَّن بالعملة الأساسية (cost_price بالأساس حسب السكيما) وcost_total مجموعها.
 *   - الإلغاء بعد الحفظ ممنوع (FR-02-15) — المرتجعات مسؤولية المرحلة 3-a.
 */
import type { PrismaClient, Prisma } from "@prisma/client"
import { round2, round3, round4, toBase } from "./money"
import { nextInvoiceNo, parseSeq } from "./numbering"
import { calcLineTotal, calcInvoiceTotals, derivePayStatus } from "./invoice"
import { fetchInvoiceDetail } from "./dto"

/** خطأ نطاق برسالة عربية — يحوّله الـ API إلى 400 */
export class DomainError extends Error {
  status = 400
  constructor(message: string, status = 400) {
    super(message)
    this.name = "DomainError"
    this.status = status
  }
}

export type PayMode = "cash" | "credit" | "mixed" | "held"

export interface SaleItemPayload {
  productId: number
  qty: number
  unitPrice: number
  discountPercent?: number
  taxPercent?: number
  unitId?: number | null
  /** معامل تحويل الوحدة لوحدة الأساس (كرتون ×12) — افتراضياً 1 */
  unitFactor?: number
  notes?: string | null
}

export interface SaveSalePayload {
  issuedAt?: string
  customerId?: number | null
  supplierId?: number | null
  salesRepId?: number | null
  cashboxId?: number | null
  warehouseId: number
  currencyId: number
  /** سعر الصرف — إن لم يُمرَّر يُحلّ من جدول الأسعار لتاريخ الفاتورة */
  exchangeRate?: number | null
  items: SaleItemPayload[]
  /** خصم على إجمالي الفاتورة (قيمة بعملة الفاتورة) */
  invoiceDiscount?: number
  /** نسبة ضريبة الفاتورة % (تطبق على الإجمالي بعد الخصم) */
  taxRate?: number
  payMode: PayMode
  paidAmount?: number | null
  notesInternal?: string | null
  notesPrinted?: string | null
  quotationId?: number | null
  /** فاتورة معلّقة استُؤنف من شاشة البيع — تُحذف داخل نفس المعاملة بعد نجاح الحفظ */
  replaceHeldId?: number | null
  /** للـ seed فقط — طابع زمني تاريخي للسجل (ISO) */
  createdAt?: string
}

type Tx = Prisma.TransactionClient

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** بادئة الترقيم لكل نوع مستند من الإعدادات (invoice.prefixes JSON) أو الافتراضي */
export async function loadPrefixes(tx: Tx): Promise<Record<string, string>> {
  const row = await tx.settings.findUnique({ where: { key: "invoice.prefixes" } })
  const fallback: Record<string, string> = {
    sale: "INV",
    purchase: "PUR",
    sale_return: "SRN",
    purchase_return: "PRN",
    quotation: "QTE",
  }
  if (!row) return fallback
  try {
    const parsed = JSON.parse(row.value) as Record<string, string>
    return { ...fallback, ...parsed }
  } catch {
    return fallback
  }
}

/** الرقم التالي لمستند (داخل المعاملة) — لا يحجز الرقم، فقط يحسبه */
export async function computeNextDocNo(
  tx: Tx,
  table: "invoice" | "quotation",
  docType: string,
  issuedAt: string
): Promise<string> {
  const prefixes = await loadPrefixes(tx)
  const prefix = prefixes[docType] ?? "INV"
  const year = Number(issuedAt.slice(0, 4)) || new Date().getFullYear()
  let lastNo = 0
  if (table === "invoice") {
    const last = await tx.invoice.findFirst({
      where: { docType, invoiceNo: { startsWith: `${prefix}-${year}-` } },
      orderBy: { invoiceNo: "desc" },
      select: { invoiceNo: true },
    })
    lastNo = last ? parseSeq(last.invoiceNo) : 0
  } else {
    const last = await tx.quotation.findFirst({
      where: { quoteNo: { startsWith: `${prefix}-${year}-` } },
      orderBy: { quoteNo: "desc" },
      select: { quoteNo: true },
    })
    lastNo = last ? parseSeq(last.quoteNo) : 0
  }
  return nextInvoiceNo(prefix, year, lastNo)
}

/** حل سعر الصرف: الممرَّر ثم سعر تاريخ الفاتورة ثم آخر سعر متاح */
async function resolveExchangeRate(
  tx: Tx,
  currency: { id: number; isBase: boolean },
  exchangeRate: number | null | undefined,
  issuedAt: string
): Promise<number> {
  if (currency.isBase) return 1
  const given = Number(exchangeRate ?? 0)
  if (given > 0) return given
  const rate =
    (await tx.exchangeRate.findUnique({
      where: { currencyId_rateDate: { currencyId: currency.id, rateDate: issuedAt } },
    })) ??
    (await tx.exchangeRate.findFirst({
      where: { currencyId: currency.id },
      orderBy: { rateDate: "desc" },
    }))
  if (!rate || rate.rate <= 0) {
    throw new DomainError("لا يوجد سعر صرف لهذه العملة — أدخل السعر يدوياً")
  }
  return rate.rate
}

/**
 * رصيد العميل الحالي (مدين موجب):
 * افتتاحي + متبقّي فواتير البيع المكتملة − سندات القبض الحرة (غير المرتبطة بفاتورة).
 * (القبض المرتبط بفاتورة منعكس أصلاً في dueAmount — لا يُعد مرتين.)
 */
export async function computeCustomerBalance(
  db: PrismaClient | Prisma.TransactionClient,
  customerId: number
): Promise<number> {
  const [customer, invAgg, freeReceiptAgg] = await Promise.all([
    db.customer.findUnique({ where: { id: customerId }, select: { openingBalance: true } }),
    db.invoice.aggregate({
      _sum: { dueAmount: true },
      where: { customerId, docType: "sale", status: "completed" },
    }),
    db.cashTx.aggregate({
      _sum: { amount: true },
      where: { customerId, txType: "receipt", refType: null },
    }),
  ])
  if (!customer) return 0
  return round2(
    customer.openingBalance + (invAgg._sum.dueAmount ?? 0) - (freeReceiptAgg._sum.amount ?? 0)
  )
}

// ═══════════════ الحفظ الذرّي ═══════════════

export async function saveSaleInvoice(
  db: PrismaClient,
  payload: SaveSalePayload
): Promise<{ invoiceId: number; invoiceNo: string; customerBalance: number | null }> {
  const issuedAt = payload.issuedAt || isoDay(new Date())

  return db.$transaction(async (tx) => {
    // ─── 1) تحقق أساسي من المدخلات ───
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new DomainError("أضف صنفاً واحداً على الأقل للفاتورة")
    }
    for (const it of payload.items) {
      if (!it.productId) throw new DomainError("بند بلا صنف — أعد إضافة البند")
      if (!(it.qty > 0)) throw new DomainError("الكمية يجب أن تكون أكبر من صفر")
      if (!(it.unitPrice >= 0)) throw new DomainError("السعر غير صالح")
    }
    if (payload.invoiceDiscount && payload.invoiceDiscount < 0) {
      throw new DomainError("قيمة الخصم غير صالحة")
    }

    const payMode: PayMode = payload.payMode ?? "cash"
    if (!["cash", "credit", "mixed", "held"].includes(payMode)) {
      throw new DomainError("نوع دفع غير معروف")
    }
    const isHeld = payMode === "held"
    if ((payMode === "credit" || payMode === "mixed") && !payload.customerId) {
      throw new DomainError("الفاتورة الآجلة تتطلب اختيار عميل")
    }

    // ─── 2) المراجع: مخزن/عملة/عميل/مندوب/صندوق ───
    const warehouse = await tx.warehouse.findFirst({
      where: { id: payload.warehouseId, isArchived: false },
    })
    if (!warehouse) throw new DomainError("اختر مخزناً صالحاً")

    const currency = await tx.currency.findUnique({ where: { id: payload.currencyId } })
    if (!currency || !currency.isActive) throw new DomainError("اختر عملة صالحة")

    let customer: { id: number; name: string } | null = null
    if (payload.customerId) {
      const c = await tx.customer.findFirst({
        where: { id: payload.customerId, isArchived: false },
      })
      if (!c) throw new DomainError("العميل غير موجود أو مؤرشف")
      customer = { id: c.id, name: c.name }
    }

    let rep: { id: number; commissionType: string; commissionPercent: number } | null = null
    if (payload.salesRepId) {
      const r = await tx.salesRep.findFirst({
        where: { id: payload.salesRepId, isArchived: false },
      })
      if (!r) throw new DomainError("المندوب غير موجود أو مؤرشف")
      rep = { id: r.id, commissionType: r.commissionType, commissionPercent: r.commissionPercent }
    }

    let cashbox: { id: number } | null = null
    if (payload.cashboxId) {
      const b = await tx.cashbox.findFirst({
        where: { id: payload.cashboxId, isArchived: false },
      })
      if (!b) throw new DomainError("الصندوق غير موجود أو مؤرشف")
      cashbox = { id: b.id }
    }

    // ─── 3) سعر الصرف ───
    const exchangeRate = await resolveExchangeRate(tx, currency, payload.exchangeRate, issuedAt)

    // ─── 4) الأصناف والمخزون ───
    const productIds = [...new Set(payload.items.map((i) => i.productId))]
    const products = await tx.product.findMany({ where: { id: { in: productIds } } })
    const productMap = new Map(products.map((p) => [p.id, p]))
    for (const id of productIds) {
      const p = productMap.get(id)
      if (!p || p.isArchived) {
        throw new DomainError(`الصنف رقم ${id} غير موجود أو مؤرشف — احذفه من الفاتورة`)
      }
    }

    // الكميات موحدة الأساس (مع دمج البنود المكررة في فحص الرصيد)
    const baseQtyByProduct = new Map<number, number>()
    for (const it of payload.items) {
      const baseQty = round3(it.qty * (it.unitFactor && it.unitFactor > 0 ? it.unitFactor : 1))
      baseQtyByProduct.set(it.productId, round3((baseQtyByProduct.get(it.productId) ?? 0) + baseQty))
    }

    if (!isHeld) {
      const levels = await tx.stockLevel.findMany({
        where: { productId: { in: productIds }, warehouseId: warehouse.id },
      })
      const stockMap = new Map(levels.map((l) => [l.productId, l.qty]))
      for (const [pid, baseQty] of baseQtyByProduct) {
        const available = stockMap.get(pid) ?? 0
        if (baseQty > available + 1e-6) {
          throw new DomainError(
            `«${productMap.get(pid)?.name ?? pid}» الكمية غير كافية في المخزن — المتوفر: ${available}`
          )
        }
      }
    }

    // ─── 5) الإجماليات (نقية) + تسوية المدفوع ───
    const invoiceDiscount = Math.max(0, payload.invoiceDiscount ?? 0)
    const taxRate = payload.taxRate ?? 0
    const totals = calcInvoiceTotals(
      payload.items.map((it) => ({
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent ?? 0,
        taxPercent: it.taxPercent ?? 0,
      })),
      { invoiceDiscount, taxRate, paidAmount: payload.paidAmount ?? totalsDefault(payMode) }
    )

    let paidAmount: number
    let finalPayMode: PayMode = payMode
    if (isHeld) {
      paidAmount = 0
    } else if (payMode === "cash") {
      paidAmount = totals.total
    } else if (payMode === "credit") {
      paidAmount = 0
    } else {
      // mixed — قيمة مقصوصة بين 0 والإجمالي
      paidAmount = Math.min(Math.max(0, payload.paidAmount ?? 0), totals.total)
      finalPayMode = derivePayStatus(totals.total, paidAmount)
      if (finalPayMode === "credit" && !customer) {
        throw new DomainError("الفاتورة الآجلة تتطلب اختيار عميل")
      }
    }

    if (!isHeld && paidAmount > 0 && !cashbox) {
      throw new DomainError("اختر الصندوق لتسجيل المبلغ المدفوع")
    }

    // التكلفة بالعملة الأساسية (cost_price مخزَّن بالأساس حسب السكيما — §5.4-2)
    let costTotal = 0
    if (!isHeld) {
      for (const [pid, baseQty] of baseQtyByProduct) {
        const p = productMap.get(pid)!
        costTotal = round4(costTotal + round4(baseQty * p.costPrice))
      }
    }

    // ─── 6) الترقيم ───
    const invoiceNo = await computeNextDocNo(tx, "invoice", "sale", issuedAt)

    // ─── 7) إنشاء الفاتورة والبنود ───
    const invoice = await tx.invoice.create({
      data: {
        invoiceNo,
        docType: "sale",
        payStatus: isHeld ? "held" : finalPayMode,
        status: isHeld ? "draft" : "completed",
        issuedAt,
        customerId: customer?.id ?? null,
        supplierId: null,
        salesRepId: rep?.id ?? null,
        cashboxId: cashbox?.id ?? null,
        warehouseId: warehouse.id,
        currencyId: currency.id,
        exchangeRate,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        totalBase: toBase(totals.total, exchangeRate),
        paidAmount: isHeld ? 0 : paidAmount,
        dueAmount: isHeld ? 0 : round4(totals.total - paidAmount),
        costTotal,
        notesInternal: payload.notesInternal || null,
        notesPrinted: payload.notesPrinted || null,
        quotationId: payload.quotationId ?? null,
        ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      },
    })

    for (const it of payload.items) {
      const p = productMap.get(it.productId)!
      const line = calcLineTotal({
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent ?? 0,
        taxPercent: it.taxPercent ?? 0,
      })
      const baseQty = round3(it.qty * (it.unitFactor && it.unitFactor > 0 ? it.unitFactor : 1))
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productId: it.productId,
          qty: it.qty,
          unitId: it.unitId ?? p.unitId ?? null,
          unitFactor: it.unitFactor && it.unitFactor > 0 ? it.unitFactor : 1,
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent ?? 0,
          taxPercent: it.taxPercent ?? 0,
          lineTotal: line.total,
          lineCost: isHeld ? 0 : round4(baseQty * p.costPrice),
          notes: it.notes || null,
        },
      })

      // ─── 8) حركة المخزون + خصم الرصيد (مكتمل فقط) ───
      if (!isHeld) {
        await tx.stockMovement.create({
          data: {
            productId: it.productId,
            warehouseId: warehouse.id,
            movementType: "sale",
            qty: -baseQty,
            unitCost: p.costPrice,
            refType: "invoice",
            refId: invoice.id,
            movedAt: issuedAt,
            notes: `فاتورة بيع ${invoiceNo}`,
          },
        })
        await tx.stockLevel.updateMany({
          where: { productId: it.productId, warehouseId: warehouse.id },
          data: { qty: { decrement: baseQty } },
        })
      }
    }

    // ─── 9) حركة الصندوق (قبض) ───
    if (!isHeld && paidAmount > 0 && cashbox) {
      await tx.cashTx.create({
        data: {
          txType: "receipt",
          cashboxId: cashbox.id,
          currencyId: currency.id,
          amount: paidAmount,
          exchangeRate,
          txDate: issuedAt,
          refType: "invoice",
          refId: invoice.id,
          customerId: customer?.id ?? null,
          description: `تحصيل نقدي — فاتورة ${invoiceNo}`,
          ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
        },
      })
    }

    // ─── 10) عمولة المندوب (sales/both) ───
    if (!isHeld && rep && (rep.commissionType === "sales" || rep.commissionType === "both") && rep.commissionPercent > 0) {
      const base = toBase(totals.total, exchangeRate)
      await tx.commission.create({
        data: {
          salesRepId: rep.id,
          refType: "invoice",
          refId: invoice.id,
          baseAmount: base,
          percent: rep.commissionPercent,
          amount: round2((base * rep.commissionPercent) / 100),
          status: "due",
        },
      })
    }

    // ─── 11) ربط عرض السعر المحوَّل ───
    if (payload.quotationId) {
      const quote = await tx.quotation.findUnique({ where: { id: payload.quotationId } })
      if (quote && quote.status !== "converted") {
        await tx.quotation.update({
          where: { id: quote.id },
          data: { status: "converted", invoiceId: invoice.id },
        })
      }
    }

    // ─── 12) حذف الفاتورة المعلّقة المستؤنفة (بنفس المعاملة) ───
    if (payload.replaceHeldId) {
      await tx.invoice.deleteMany({
        where: { id: payload.replaceHeldId, docType: "sale", payStatus: "held", status: "draft" },
      })
    }

    const customerBalance = customer ? await computeCustomerBalance(tx, customer.id) : null
    return { invoiceId: invoice.id, invoiceNo, customerBalance }
  })
}

function totalsDefault(payMode: PayMode): number {
  // cash يحسب المدفوع كاملاً لاحقاً؛ يكفي 0 هنا ثم يُعاد ضبطه أدناه
  return payMode === "cash" ? Number.MAX_SAFE_INTEGER : 0
}

// ═══════════════ إتمام فاتورة معلّقة (draft → completed) ═══════════════

export interface ConvertHeldPayload {
  payMode: "cash" | "credit" | "mixed"
  paidAmount?: number | null
  cashboxId?: number | null
}

/**
 * إتمام فاتورة معلّقة: نفس الأثر الذرّي للحفظ لكن على نفس الصف ونفس الرقم.
 * يعيد التحقق من المخزون والتكلفة بتاريخ الإتمام (التكلفة الحالية للصنف).
 */
export async function convertHeldInvoice(
  db: PrismaClient,
  invoiceId: number,
  payload: ConvertHeldPayload
): Promise<number> {
  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true },
    })
    if (!invoice || invoice.docType !== "sale") {
      throw new DomainError("الفاتورة غير موجودة", 404)
    }
    if (invoice.status !== "draft" || invoice.payStatus !== "held") {
      throw new DomainError("هذه الفاتورة ليست معلّقة")
    }
    if (invoice.items.length === 0) throw new DomainError("الفاتورة بلا بنود")

    const payMode = payload.payMode ?? "cash"
    if ((payMode === "credit" || payMode === "mixed") && !invoice.customerId) {
      throw new DomainError("الفاتورة الآجلة تتطلب اختيار عميل")
    }

    let cashbox: { id: number } | null = null
    if (payload.cashboxId) {
      const b = await tx.cashbox.findFirst({
        where: { id: payload.cashboxId, isArchived: false },
      })
      if (!b) throw new DomainError("الصندوق غير موجود أو مؤرشف")
      cashbox = { id: b.id }
    }

    // إعادة التحقق من المخزون + التكلفة الحالية
    const productIds = invoice.items.map((i) => i.productId)
    const products = await tx.product.findMany({ where: { id: { in: productIds } } })
    const productMap = new Map(products.map((p) => [p.id, p]))
    for (const pid of productIds) {
      const p = productMap.get(pid)
      if (!p || p.isArchived) throw new DomainError(`صنف مؤرشف لا يمكن بيعه (رقم ${pid})`)
    }

    const total = invoice.total
    let paidAmount: number
    let finalPayMode: string = payMode
    if (payMode === "cash") {
      paidAmount = total
    } else if (payMode === "credit") {
      paidAmount = 0
    } else {
      paidAmount = Math.min(Math.max(0, payload.paidAmount ?? 0), total)
      finalPayMode = derivePayStatus(total, paidAmount)
      if (finalPayMode === "credit" && !invoice.customerId) {
        throw new DomainError("الفاتورة الآجلة تتطلب اختيار عميل")
      }
    }
    if (paidAmount > 0 && !cashbox) {
      throw new DomainError("اختر الصندوق لتسجيل المبلغ المدفوع")
    }

    // فحص المخزون بالكميات الموحدة
    const baseQtyByProduct = new Map<number, number>()
    for (const it of invoice.items) {
      const baseQty = round3(it.qty * (it.unitFactor || 1))
      baseQtyByProduct.set(it.productId, round3((baseQtyByProduct.get(it.productId) ?? 0) + baseQty))
    }
    const levels = await tx.stockLevel.findMany({
      where: { productId: { in: productIds }, warehouseId: invoice.warehouseId },
    })
    const stockMap = new Map(levels.map((l) => [l.productId, l.qty]))
    for (const [pid, baseQty] of baseQtyByProduct) {
      const available = stockMap.get(pid) ?? 0
      if (baseQty > available + 1e-6) {
        throw new DomainError(
          `«${productMap.get(pid)?.name ?? pid}» الكمية غير كافية في المخزن — المتوفر: ${available}`
        )
      }
    }

    // الأثر المخزني + التكلفة الحالية
    let costTotal = 0
    for (const it of invoice.items) {
      const p = productMap.get(it.productId)!
      const baseQty = round3(it.qty * (it.unitFactor || 1))
      const lineCost = round4(baseQty * p.costPrice)
      costTotal = round4(costTotal + lineCost)
      await tx.invoiceItem.update({ where: { id: it.id }, data: { lineCost } })
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          warehouseId: invoice.warehouseId,
          movementType: "sale",
          qty: -baseQty,
          unitCost: p.costPrice,
          refType: "invoice",
          refId: invoice.id,
          movedAt: invoice.issuedAt,
          notes: `إتمام فاتورة معلّقة ${invoice.invoiceNo}`,
        },
      })
      await tx.stockLevel.updateMany({
        where: { productId: it.productId, warehouseId: invoice.warehouseId },
        data: { qty: { decrement: baseQty } },
      })
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "completed",
        payStatus: finalPayMode,
        paidAmount,
        dueAmount: round4(total - paidAmount),
        costTotal,
        cashboxId: cashbox?.id ?? invoice.cashboxId,
      },
    })

    if (paidAmount > 0 && cashbox) {
      await tx.cashTx.create({
        data: {
          txType: "receipt",
          cashboxId: cashbox.id,
          currencyId: invoice.currencyId,
          amount: paidAmount,
          exchangeRate: invoice.exchangeRate,
          txDate: invoice.issuedAt,
          refType: "invoice",
          refId: invoice.id,
          customerId: invoice.customerId,
          description: `تحصيل نقدي — فاتورة ${invoice.invoiceNo}`,
        },
      })
    }

    // عمولة المندوب عند الإتمام
    if (invoice.salesRepId) {
      const rep = await tx.salesRep.findUnique({ where: { id: invoice.salesRepId } })
      if (
        rep &&
        (rep.commissionType === "sales" || rep.commissionType === "both") &&
        rep.commissionPercent > 0
      ) {
        const base = toBase(total, invoice.exchangeRate)
        await tx.commission.create({
          data: {
            salesRepId: rep.id,
            refType: "invoice",
            refId: invoice.id,
            baseAmount: base,
            percent: rep.commissionPercent,
            amount: round2((base * rep.commissionPercent) / 100),
            status: "due",
          },
        })
      }
    }

    return invoice.id
  })
}

/** جلب فاتورة كاملة DTO (يعاد تصديرها ليسهل استيرادها من الـ API) */
export { fetchInvoiceDetail }
