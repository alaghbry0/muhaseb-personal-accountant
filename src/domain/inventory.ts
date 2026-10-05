/**
 * Domain — المخزون والمشتريات والمرتجعات (Task 3-a) — SRS FR-01 + FR-02 (شراء/مرتجعات) + §5.4.
 *
 * كل الدوال ذرّية داخل db.$transaction واحدة (§5.4-3):
 *   savePurchaseInvoice  — فاتورة شراء: بنود + حركات purchase (+) + WAC + صندوق/رصيد مورد.
 *   saveReturnInvoice    — مرتجع بيع (SRN) / مرتجع شراء (PRN) مع أثر مخزني/نقدي/أرصدة عكسي.
 *   saveStocktake        — جرد كامل لمخزن (تسويات فرق لكل صنف) | adjustStock — جرد سريع لصنف واحد.
 *   transferStock        — تحويل بين مخزنين (حركتا transfer_out/transfer_in بنفس المرجع).
 *   saveProduct          — إنشاء/تعديل صنف (باركود تلقائي EAN-13 + أسعار العملات + رصيد افتتاحي).
 *
 * قواعد ملزمة:
 *   - WAC (§5.4-2): عند الشراء new_cost = (qty_old×cost_old + qty_new×cost_new)/(qty_old+qty_new)
 *     يُخزَّن في product.cost_price (round4) وحركة الشراء تحمل تكلفتها اللحظية.
 *   - مرتجع البيع يُعيد الكمية بالتكلفة الأصلية للسطر (line_cost) لا الحالية (تسليم Task 2).
 *   - السالب ممنوع بالمخزن/الصندوق (§5.4-4) — رسائل عربية واضحة.
 *   - ربط المرتجع بالفاتورة الأصلية: notesInternal يبدأ دائماً بـ `original:INV-xxxx\n`
 *     (يُستعلم بـ startsWith لمنع تجاوز الكميات المرتجعة سابقاً).
 */
import type { PrismaClient, Prisma } from "@prisma/client"
import { round2, round3, round4, toBase, weightedAverageCost } from "./money"
import { calcLineTotal, calcInvoiceTotals } from "./invoice"
import { computeNextDocNo, computeCustomerBalance, DomainError, resolveExchangeRate } from "./invoice-save"

/** يعاد تصديرها ليسهل استيرادها من مسار واحد في الـ API */
export { DomainError }

type Tx = Prisma.TransactionClient

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ═══════════════ أنواع الحمولات ═══════════════

export interface PurchaseItemPayload {
  productId: number
  qty: number
  /** سعر التكلفة للوحدة المشتراة بعملة الفاتورة (سعر الشراء) */
  unitPrice: number
  discountPercent?: number
  taxPercent?: number
  unitId?: number | null
  /** معامل تحويل الوحدة لوحدة الأساس (كرتون ×12) — افتراضياً 1 */
  unitFactor?: number
  notes?: string | null
}

export interface SavePurchasePayload {
  issuedAt?: string
  supplierId?: number | null
  cashboxId?: number | null
  warehouseId: number
  currencyId: number
  exchangeRate?: number | null
  items: PurchaseItemPayload[]
  invoiceDiscount?: number
  taxRate?: number
  payMode: "cash" | "credit" | "mixed"
  paidAmount?: number | null
  notesInternal?: string | null
  notesPrinted?: string | null
  /** للـ seed فقط — طابع زمني تاريخي للسجل (ISO) */
  createdAt?: string
}

export interface ReturnItemPayload {
  productId: number
  qty: number
  /** قيمة الاسترداد للوحدة بعملة الفاتورة (افتراضياً سعر الفاتورة الأصلية) */
  unitPrice: number
  discountPercent?: number
  taxPercent?: number
  unitId?: number | null
  unitFactor?: number
  notes?: string | null
}

export interface SaveReturnPayload {
  docType: "sale_return" | "purchase_return"
  issuedAt?: string
  customerId?: number | null
  supplierId?: number | null
  cashboxId?: number | null
  warehouseId: number
  currencyId: number
  exchangeRate?: number | null
  items: ReturnItemPayload[]
  invoiceDiscount?: number
  taxRate?: number
  /** طريقة رد المبلغ: نقدي من الصندوق أو خصم من الحساب */
  refundMethod: "cash" | "credit"
  /** الفاتورة الأصلية المرتبط بها المرتجع (اختياري — مرتجع حر بدونها) */
  originalInvoiceId?: number | null
  notesInternal?: string | null
  notesPrinted?: string | null
  createdAt?: string
}

export interface StocktakeLineInput {
  productId: number
  countedQty: number
}

export interface SaveStocktakePayload {
  warehouseId: number
  countedAt?: string
  notes?: string | null
  lines: StocktakeLineInput[]
  createdAt?: string
}

export interface TransferPayload {
  productId: number
  fromWarehouseId: number
  toWarehouseId: number
  qty: number
  notes?: string | null
  movedAt?: string
  createdAt?: string
}

export interface SaveProductPayload {
  id?: number
  name: string
  barcode?: string | null
  categoryId?: number | null
  unitId?: number | null
  costPrice?: number
  minStock?: number
  notes?: string | null
  /** أسعار البيع بكل عملة: مفتاح رمز العملة */
  prices?: Record<string, number>
  /** الكمية الافتتاحية (إنشاء فقط) */
  openingQty?: number
  openingWarehouseId?: number | null
  isArchived?: boolean
}

// ═══════════════ توليد باركود EAN-13 (FR-01-02) ═══════════════

/**
 * بناء EAN-13 صالح مع خانة تحقق من بذرة رقمية (نقي):
 * البذرة (مثلاً 628 + طابع زمني) تُقتطع منها 12 خانة ثم تُحسب خانة التحقق.
 */
export function generateEan13(seed: number | string = Date.now()): string {
  const body = `628${String(Math.abs(Number(seed))).replace(/\D/g, "")}`.replace(/\D/g, "")
  const digits = body.slice(0, 12).padEnd(12, "0")
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(digits[i]) * (i % 2 === 0 ? 1 : 3)
  }
  const check = (10 - (sum % 10)) % 10
  return `${digits}${check}`
}

// ═══════════════ أرصدة محسوبة ═══════════════

/**
 * رصيد المورد الحالي (دائن موجب = مستحق له):
 * افتتاحي + متبقّي فواتير الشراء المكتملة (مرتجع الشراء يدخل سالباً)
 * − سندات الصرف الحرة للمورد (refType=null).
 */
export async function computeSupplierBalance(
  db: PrismaClient | Prisma.TransactionClient,
  supplierId: number
): Promise<number> {
  const [supplier, invAgg, freePayAgg] = await Promise.all([
    db.supplier.findUnique({ where: { id: supplierId }, select: { openingBalance: true } }),
    db.invoice.aggregate({
      _sum: { dueAmount: true },
      where: {
        supplierId,
        docType: { in: ["purchase", "purchase_return"] },
        status: "completed",
      },
    }),
    db.cashTx.aggregate({
      _sum: { amount: true },
      where: { supplierId, txType: "payment", refType: null },
    }),
  ])
  if (!supplier) return 0
  return round2(
    supplier.openingBalance + (invAgg._sum.dueAmount ?? 0) - (freePayAgg._sum.amount ?? 0)
  )
}

/**
 * رصيد الصندوق الحالي: وارد (قبض/سحب بنكي/افتتاحي/تحويل وارد) − صادر
 * (دفع/مصروف/سحوبات موظف/عمولة مدفوعة/إيداع بنكي/مسير رواتب/تحويل صادر).
 * كل صندوق بعملة واحدة — لا تحويل عملة مطلوب.
 */
export async function computeCashboxBalance(
  db: PrismaClient | Prisma.TransactionClient,
  cashboxId: number
): Promise<number> {
  const rows = await db.cashTx.findMany({
    where: { OR: [{ cashboxId }, { toCashboxId: cashboxId }] },
    select: { txType: true, amount: true, cashboxId: true, toCashboxId: true },
  })
  let balance = 0
  for (const r of rows) {
    const isIn = r.cashboxId === cashboxId &&
      ["receipt", "bank_withdraw", "opening"].includes(r.txType)
    const isTransferIn = r.txType === "box_transfer" && r.toCashboxId === cashboxId
    const isOut = r.cashboxId === cashboxId &&
      ["payment", "expense", "employee_advance", "commission_payout", "bank_deposit", "salary_batch"].includes(r.txType)
    const isTransferOut = r.txType === "box_transfer" && r.cashboxId === cashboxId
    if (isIn || isTransferIn) balance += r.amount
    else if (isOut || isTransferOut) balance -= r.amount
  }
  return round2(balance)
}

// ═══════════════ مساعدات داخلية ═══════════════

/** upsert لرصيد مخزون (قد لا يوجد صف بعد) */
async function upsertStockLevel(
  tx: Tx,
  productId: number,
  warehouseId: number,
  delta: number
): Promise<void> {
  const existing = await tx.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  })
  if (existing) {
    await tx.stockLevel.update({
      where: { id: existing.id },
      data: { qty: round3(existing.qty + delta) },
    })
  } else {
    await tx.stockLevel.create({
      data: { productId, warehouseId, qty: round3(delta) },
    })
  }
}

/** الرصيد الكلي لصنف عبر كل المخازن */
async function totalStock(tx: Tx, productId: number): Promise<number> {
  const agg = await tx.stockLevel.aggregate({
    _sum: { qty: true },
    where: { productId },
  })
  return round3(agg._sum.qty ?? 0)
}

/** تحقق من مراجع مشتركة: مخزن/عملة/صندوق */
async function loadRefs(
  tx: Tx,
  payload: { warehouseId: number; currencyId: number; cashboxId?: number | null }
) {
  const warehouse = await tx.warehouse.findFirst({
    where: { id: payload.warehouseId, isArchived: false },
  })
  if (!warehouse) throw new DomainError("اختر مخزناً صالحاً")
  const currency = await tx.currency.findUnique({ where: { id: payload.currencyId } })
  if (!currency || !currency.isActive) throw new DomainError("اختر عملة صالحة")
  let cashbox: { id: number } | null = null
  if (payload.cashboxId) {
    const b = await tx.cashbox.findFirst({
      where: { id: payload.cashboxId, isArchived: false },
    })
    if (!b) throw new DomainError("الصندوق غير موجود أو مؤرشف")
    cashbox = { id: b.id }
  }
  return { warehouse, currency, cashbox }
}

function factorOf(it: { unitFactor?: number | null }): number {
  return it.unitFactor && it.unitFactor > 0 ? it.unitFactor : 1
}

/** دمج الكميات الأساس لكل صنف (فحص الرصيد) */
function baseQtyMap(
  items: Array<{ productId: number; qty: number; unitFactor?: number | null }>
): Map<number, number> {
  const map = new Map<number, number>()
  for (const it of items) {
    const baseQty = round3(it.qty * factorOf(it))
    map.set(it.productId, round3((map.get(it.productId) ?? 0) + baseQty))
  }
  return map
}

// ═══════════════ فاتورة الشراء ⭐ (WAC + مخزون + صندوق + مورد) ═══════════════

export async function savePurchaseInvoice(
  db: PrismaClient,
  payload: SavePurchasePayload
): Promise<{ invoiceId: number; invoiceNo: string; supplierBalance: number | null }> {
  const issuedAt = payload.issuedAt || isoDay(new Date())

  return db.$transaction(async (tx) => {
    // ─── 1) التحقق من المدخلات ───
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new DomainError("أضف صنفاً واحداً على الأقل لفاتورة الشراء")
    }
    for (const it of payload.items) {
      if (!it.productId) throw new DomainError("بند بلا صنف — أعد إضافة البند")
      if (!(it.qty > 0)) throw new DomainError("الكمية يجب أن تكون أكبر من صفر")
      if (!(it.unitPrice >= 0)) throw new DomainError("سعر التكلفة غير صالح")
    }

    const payMode = payload.payMode ?? "cash"
    if (!["cash", "credit", "mixed"].includes(payMode)) {
      throw new DomainError("نوع دفع غير معروف")
    }

    const { warehouse, currency, cashbox } = await loadRefs(tx, payload)
    const exchangeRate = await resolveExchangeRate(tx, currency, payload.exchangeRate, issuedAt)

    // ─── 2) المورد (إلزامي للآجل) ───
    let supplier: { id: number; name: string } | null = null
    if (payload.supplierId) {
      const s = await tx.supplier.findFirst({
        where: { id: payload.supplierId, isArchived: false },
      })
      if (!s) throw new DomainError("المورد غير موجود أو مؤرشف")
      supplier = { id: s.id, name: s.name }
    }
    if (payMode !== "cash" && !supplier) {
      throw new DomainError("فاتورة الشراء الآجلة تتطلب اختيار مورد")
    }

    // ─── 3) الأصناف ───
    const productIds = [...new Set(payload.items.map((i) => i.productId))]
    const products = await tx.product.findMany({ where: { id: { in: productIds } } })
    const productMap = new Map(products.map((p) => [p.id, p]))
    for (const id of productIds) {
      const p = productMap.get(id)
      if (!p || p.isArchived) {
        throw new DomainError(`الصنف رقم ${id} غير موجود أو مؤرشف — احذفه من الفاتورة`)
      }
    }

    // ─── 4) الإجماليات + المدفوع ───
    const invoiceDiscount = Math.max(0, payload.invoiceDiscount ?? 0)
    const taxRate = payload.taxRate ?? 0
    const totals = calcInvoiceTotals(
      payload.items.map((it) => ({
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent ?? 0,
        taxPercent: it.taxPercent ?? 0,
      })),
      { invoiceDiscount, taxRate, paidAmount: payMode === "cash" ? Number.MAX_SAFE_INTEGER : 0 }
    )

    let paidAmount: number
    let finalPayMode: string = payMode
    if (payMode === "cash") {
      paidAmount = totals.total
    } else if (payMode === "credit") {
      paidAmount = 0
    } else {
      paidAmount = Math.min(Math.max(0, payload.paidAmount ?? 0), totals.total)
      if (paidAmount >= totals.total - 0.009) finalPayMode = "cash"
      else if (paidAmount <= 0.009) finalPayMode = "credit"
    }
    if (paidAmount > 0 && !cashbox) {
      throw new DomainError("اختر الصندوق لتسجيل المبلغ المدفوع للمورد")
    }

    // منع سالبية الصندوق عند الدفع النقدي للمورد
    if (paidAmount > 0 && cashbox) {
      const balance = await computeCashboxBalance(tx, cashbox.id)
      if (balance < paidAmount - 0.009) {
        throw new DomainError(
          `رصيد الصندوق غير كافٍ — الرصيد الحالي: ${round2(balance)} والمطلوب: ${round2(paidAmount)}`
        )
      }
    }

    // ─── 5) الترقيم PUR-YYYY-NNNNN ───
    const invoiceNo = await computeNextDocNo(tx, "invoice", "purchase", issuedAt)

    // ─── 6) إنشاء الفاتورة ───
    const invoice = await tx.invoice.create({
      data: {
        invoiceNo,
        docType: "purchase",
        payStatus: finalPayMode,
        status: "completed",
        issuedAt,
        customerId: null,
        supplierId: supplier?.id ?? null,
        salesRepId: null,
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
        paidAmount,
        dueAmount: round4(totals.total - paidAmount),
        costTotal: 0, // يُحسب من البنود أدناه
        notesInternal: payload.notesInternal || null,
        notesPrinted: payload.notesPrinted || null,
        ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      },
    })

    // ─── 7) البنود + حركات المخزون + WAC ───
    // WAC تراكمي عبر بنود الفاتورة: كل بند يشتري بالتكلفة الجديدة يحدّث المتوسط.
    let costTotal = 0
    for (const it of payload.items) {
      const p = productMap.get(it.productId)!
      const line = calcLineTotal({
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent ?? 0,
        taxPercent: it.taxPercent ?? 0,
      })
      const baseQty = round3(it.qty * factorOf(it))
      // تكلفة الوحدة الأساس بالعملة الأساسية: (سعر الوحدة المشتراة × الصرف) ÷ معامل التحويل
      const unitCostBase = round4((it.unitPrice * exchangeRate) / factorOf(it))
      const lineCost = round4(baseQty * unitCostBase)
      costTotal = round4(costTotal + lineCost)

      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productId: it.productId,
          qty: it.qty,
          unitId: it.unitId ?? p.unitId ?? null,
          unitFactor: factorOf(it),
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent ?? 0,
          taxPercent: it.taxPercent ?? 0,
          lineTotal: line.total,
          lineCost,
          notes: it.notes || null,
        },
      })

      // حركة شراء موجبة بتكلفة الشراء اللحظية
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          warehouseId: warehouse.id,
          movementType: "purchase",
          qty: baseQty,
          unitCost: unitCostBase,
          refType: "invoice",
          refId: invoice.id,
          movedAt: issuedAt,
          notes: `فاتورة شراء ${invoiceNo}`,
          ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
        },
      })
      await upsertStockLevel(tx, it.productId, warehouse.id, baseQty)

      // ─── WAC §5.4-2: (old×cost_old + new×cost_new)/(old+new) ───
      const oldQty = await totalStock(tx, it.productId)
      const newCost = weightedAverageCost(
        oldQty - baseQty, // الكمية قبل هذا البند
        oldQty - baseQty > 0 ? p.costPrice : 0,
        baseQty,
        unitCostBase
      )
      // تحديث خريطة الأصناف محلياً لبنود لاحقة لنفس الصنف
      productMap.set(it.productId, { ...p, costPrice: newCost })
      await tx.product.update({
        where: { id: it.productId },
        data: { costPrice: newCost },
      })
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { costTotal },
    })

    // ─── 8) الدفع النقدي للمورد (صرف من الصندوق) ───
    if (paidAmount > 0 && cashbox) {
      await tx.cashTx.create({
        data: {
          txType: "payment",
          cashboxId: cashbox.id,
          currencyId: currency.id,
          amount: paidAmount,
          exchangeRate,
          txDate: issuedAt,
          refType: "invoice",
          refId: invoice.id,
          supplierId: supplier?.id ?? null,
          description: `سداد نقدي للمورد — فاتورة شراء ${invoiceNo}`,
          ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
        },
      })
    }

    const supplierBalance = supplier ? await computeSupplierBalance(tx, supplier.id) : null
    return { invoiceId: invoice.id, invoiceNo, supplierBalance }
  })
}

// ═══════════════ المرتجعات (بيع SRN / شراء PRN) ═══════════════

/**
 * المرتبط بالفاتورة الأصلية: notesInternal = `original:INV-xxx\n…` (يُستعلم بـ startsWith).
 * مرتجع البيع: الكمية تعود للمخزون بالتكلفة الأصلية للسطر، والمبلغ يُرد للعميل
 *   (نقدي من الصندوق = payment، أو خصم من حسابه = dueAmount سالب).
 * مرتجع الشراء: الكمية تخرج من المخزون (يُمنع السالب)، والمبلغ يُسترد من المورد
 *   (نقدي للصندوق = receipt، أو خصم من حسابه = dueAmount سالب).
 */
export async function saveReturnInvoice(
  db: PrismaClient,
  payload: SaveReturnPayload
): Promise<{
  invoiceId: number
  invoiceNo: string
  customerBalance: number | null
  supplierBalance: number | null
}> {
  const issuedAt = payload.issuedAt || isoDay(new Date())
  const docType = payload.docType

  return db.$transaction(async (tx) => {
    if (!["sale_return", "purchase_return"].includes(docType)) {
      throw new DomainError("نوع مستند غير معروف")
    }
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new DomainError("أضف صنفاً واحداً على الأقل للمرتجع")
    }
    for (const it of payload.items) {
      if (!it.productId) throw new DomainError("بند بلا صنف — أعد إضافة البند")
      if (!(it.qty > 0)) throw new DomainError("الكمية يجب أن تكون أكبر من صفر")
      if (!(it.unitPrice >= 0)) throw new DomainError("السعر غير صالح")
    }
    const refundMethod = payload.refundMethod ?? "credit"

    // ─── الفاتورة الأصلية (إن وُجدت) ───
    let original: {
      id: number
      invoiceNo: string
      docType: string
      warehouseId: number
      currencyId: number
      exchangeRate: number
      customerId: number | null
      supplierId: number | null
    } | null = null
    if (payload.originalInvoiceId) {
      const o = await tx.invoice.findUnique({
        where: { id: payload.originalInvoiceId },
      })
      if (!o) throw new DomainError("الفاتورة الأصلية غير موجودة", 404)
      const expected = docType === "sale_return" ? "sale" : "purchase"
      if (o.docType !== expected) {
        throw new DomainError(
          docType === "sale_return"
            ? "مرتجع البيع يجب أن يرتبط بفاتورة مبيعات"
            : "مرتجع الشراء يجب أن يرتبط بفاتورة مشتريات"
        )
      }
      original = {
        id: o.id,
        invoiceNo: o.invoiceNo,
        docType: o.docType,
        warehouseId: o.warehouseId,
        currencyId: o.currencyId,
        exchangeRate: o.exchangeRate,
        customerId: o.customerId,
        supplierId: o.supplierId,
      }
    }

    // المرتبط يُلزم بمخزن وعملة الفاتورة الأصلية
    const warehouseId = original ? original.warehouseId : payload.warehouseId
    const currencyId = original ? original.currencyId : payload.currencyId
    const exchangeRateGiven = original ? original.exchangeRate : payload.exchangeRate

    const { warehouse, currency, cashbox } = await loadRefs(tx, {
      warehouseId,
      currencyId,
      cashboxId: payload.cashboxId,
    })
    const exchangeRate = await resolveExchangeRate(tx, currency, exchangeRateGiven, issuedAt)

    // ─── الطرف: العميل للمبيعات / المورد للمشتريات ───
    let customer: { id: number; name: string } | null = null
    let supplier: { id: number; name: string } | null = null
    if (docType === "sale_return") {
      const cid = payload.customerId ?? original?.customerId ?? null
      if (cid) {
        const c = await tx.customer.findFirst({ where: { id: cid } })
        if (!c) throw new DomainError("العميل غير موجود")
        customer = { id: c.id, name: c.name }
      }
    } else {
      const sid = payload.supplierId ?? original?.supplierId ?? null
      if (sid) {
        const s = await tx.supplier.findFirst({ where: { id: sid } })
        if (!s) throw new DomainError("المورد غير موجود")
        supplier = { id: s.id, name: s.name }
      }
    }

    // ─── الأصناف + سقف الكميات المرتجعة للمرتجع المرتبط ───
    const productIds = [...new Set(payload.items.map((i) => i.productId))]
    const products = await tx.product.findMany({ where: { id: { in: productIds } } })
    const productMap = new Map(products.map((p) => [p.id, p]))
    for (const id of productIds) {
      const p = productMap.get(id)
      if (!p || p.isArchived) {
        throw new DomainError(`الصنف رقم ${id} غير موجود أو مؤرشف — احذفه من المرتجع`)
      }
    }

    // بنود الفاتورة الأصلية (إن وجدت) — للسقف والتكلفة الأصلية
    const originalItems = original
      ? await tx.invoiceItem.findMany({ where: { invoiceId: original.id } })
      : []
    const originalByProduct = new Map<number, typeof originalItems>()
    for (const oi of originalItems) {
      const list = originalByProduct.get(oi.productId) ?? []
      list.push(oi)
      originalByProduct.set(oi.productId, list)
    }

    // الكميات المرتجعة سابقاً على نفس الفاتورة الأصلية
    const previouslyReturned = new Map<number, number>()
    if (original) {
      const priorReturns = await tx.invoice.findMany({
        where: {
          docType,
          status: "completed",
          notesInternal: { startsWith: `original:${original.invoiceNo}\n` },
        },
        select: { items: { select: { productId: true, qty: true, unitFactor: true } } },
      })
      for (const ret of priorReturns) {
        for (const it of ret.items) {
          const baseQty = round3(it.qty * (it.unitFactor || 1))
          previouslyReturned.set(
            it.productId,
            round3((previouslyReturned.get(it.productId) ?? 0) + baseQty)
          )
        }
      }
    }

    const requested = baseQtyMap(payload.items)
    if (original) {
      for (const [pid, baseQty] of requested) {
        const originalBase = (originalByProduct.get(pid) ?? []).reduce(
          (s, oi) => s + round3(oi.qty * (oi.unitFactor || 1)),
          0
        )
        const already = previouslyReturned.get(pid) ?? 0
        const remaining = round3(originalBase - already)
        if (baseQty > remaining + 1e-6) {
          throw new DomainError(
            `«${productMap.get(pid)?.name ?? pid}» الكمية المرتجعة تتجاوز المتبقي من الفاتورة الأصلية — المتبقي: ${remaining}`
          )
        }
      }
    }

    // ─── منع السالب لمرتجع الشراء ───
    if (docType === "purchase_return") {
      const levels = await tx.stockLevel.findMany({
        where: { productId: { in: productIds }, warehouseId: warehouse.id },
      })
      const stockMap = new Map(levels.map((l) => [l.productId, l.qty]))
      for (const [pid, baseQty] of requested) {
        const available = stockMap.get(pid) ?? 0
        if (baseQty > available + 1e-6) {
          throw new DomainError(
            `«${productMap.get(pid)?.name ?? pid}» الكمية غير كافية في المخزن — المتوفر: ${available}`
          )
        }
      }
    }

    // ─── الإجماليات ───
    const invoiceDiscount = Math.max(0, payload.invoiceDiscount ?? 0)
    const taxRate = payload.taxRate ?? 0
    const totals = calcInvoiceTotals(
      payload.items.map((it) => ({
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent ?? 0,
        taxPercent: it.taxPercent ?? 0,
      })),
      { invoiceDiscount, taxRate, paidAmount: 0 }
    )

    if (refundMethod === "cash" && !cashbox) {
      throw new DomainError("اختر الصندوق لرد المبلغ نقدياً")
    }
    if (refundMethod === "credit" && docType === "sale_return" && !customer) {
      throw new DomainError("خصم الحساب يتطلب اختيار عميل")
    }
    if (refundMethod === "credit" && docType === "purchase_return" && !supplier) {
      throw new DomainError("خصم الحساب يتطلب اختيار مورد")
    }

    // منع سالبية الصندوق عند رد نقدي لعميل
    if (docType === "sale_return" && refundMethod === "cash" && cashbox) {
      const balance = await computeCashboxBalance(tx, cashbox.id)
      if (balance < totals.total - 0.009) {
        throw new DomainError(
          `رصيد الصندوق غير كافٍ للرد النقدي — الرصيد: ${round2(balance)} والمطلوب: ${round2(totals.total)}`
        )
      }
    }

    // ─── الترقيم SRN/PRN-YYYY-NNNNN ───
    const invoiceNo = await computeNextDocNo(tx, "invoice", docType, issuedAt)

    // ─── الإنشاء ───
    const paidAmount = refundMethod === "cash" ? totals.total : 0
    const dueAmount = refundMethod === "cash" ? 0 : -totals.total
    const notesInternal = original
      ? `original:${original.invoiceNo}\n${payload.notesInternal ?? ""}`.trim()
      : payload.notesInternal || null

    const invoice = await tx.invoice.create({
      data: {
        invoiceNo,
        docType,
        payStatus: refundMethod,
        status: "completed",
        issuedAt,
        customerId: customer?.id ?? null,
        supplierId: supplier?.id ?? null,
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
        paidAmount,
        dueAmount: round4(dueAmount),
        costTotal: 0,
        notesInternal,
        notesPrinted: payload.notesPrinted || null,
        ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      },
    })

    // ─── البنود + حركات المخزون ───
    let costTotal = 0
    for (const it of payload.items) {
      const p = productMap.get(it.productId)!
      const line = calcLineTotal({
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent ?? 0,
        taxPercent: it.taxPercent ?? 0,
      })
      const baseQty = round3(it.qty * factorOf(it))

      // تكلفة السطر: الأصلية للمرتجع المرتبط (بالمعكوس لوحدة الأساس)، أو الحالية
      let unitCostBase = p.costPrice
      if (original) {
        const lines = originalByProduct.get(it.productId) ?? []
        const chosen =
          lines.find((x) => round3(x.qty * (x.unitFactor || 1)) >= baseQty - 1e-6) ?? lines[0]
        if (chosen && chosen.lineCost > 0) {
          const chosenBase = round3(chosen.qty * (chosen.unitFactor || 1))
          unitCostBase = round4(chosen.lineCost / Math.max(chosenBase, 1e-9))
        }
      }
      const lineCost = round4(baseQty * unitCostBase)
      costTotal = round4(costTotal + lineCost)

      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productId: it.productId,
          qty: it.qty,
          unitId: it.unitId ?? p.unitId ?? null,
          unitFactor: factorOf(it),
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent ?? 0,
          taxPercent: it.taxPercent ?? 0,
          lineTotal: line.total,
          lineCost,
          notes: it.notes || null,
        },
      })

      // حركة المخزون: مرتجع بيع موجب / مرتجع شراء سالب
      const movementQty = docType === "sale_return" ? baseQty : -baseQty
      await tx.stockMovement.create({
        data: {
          productId: it.productId,
          warehouseId: warehouse.id,
          movementType: docType,
          qty: movementQty,
          unitCost: unitCostBase,
          refType: "invoice",
          refId: invoice.id,
          movedAt: issuedAt,
          notes: original
            ? `${docType === "sale_return" ? "مرتجع بيع" : "مرتجع شراء"} ${invoiceNo} — من ${original.invoiceNo}`
            : `${docType === "sale_return" ? "مرتجع بيع" : "مرتجع شراء"} ${invoiceNo}`,
          ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
        },
      })
      await upsertStockLevel(tx, it.productId, warehouse.id, movementQty)
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { costTotal },
    })

    // ─── النقدية ───
    if (refundMethod === "cash" && cashbox) {
      if (docType === "sale_return") {
        // رد نقدي للعميل — صرف من الصندوق
        await tx.cashTx.create({
          data: {
            txType: "payment",
            cashboxId: cashbox.id,
            currencyId: currency.id,
            amount: totals.total,
            exchangeRate,
            txDate: issuedAt,
            refType: "invoice",
            refId: invoice.id,
            customerId: customer?.id ?? null,
            description: `رد نقدي لعميل — مرتجع بيع ${invoiceNo}`,
            ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
          },
        })
      } else {
        // استرداد نقدي من المورد — قبض في الصندوق
        await tx.cashTx.create({
          data: {
            txType: "receipt",
            cashboxId: cashbox.id,
            currencyId: currency.id,
            amount: totals.total,
            exchangeRate,
            txDate: issuedAt,
            refType: "invoice",
            refId: invoice.id,
            supplierId: supplier?.id ?? null,
            description: `استرداد نقدي من مورد — مرتجع شراء ${invoiceNo}`,
            ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
          },
        })
      }
    }

    const customerBalance = customer ? await computeCustomerBalance(tx, customer.id) : null
    const supplierBalance = supplier ? await computeSupplierBalance(tx, supplier.id) : null
    return { invoiceId: invoice.id, invoiceNo, customerBalance, supplierBalance }
  })
}

// ═══════════════ الجرد (FR-01-08) ═══════════════

/**
 * جرد مخزن: لكل صنف bookQty (دفتري) مقابل countedQty (فعلي) →
 * تسوية movement('adjustment', diff) + stocktake + stocktake_line + تحديث الرصيد.
 * totalDiff = قيمة الفرق بالتكلفة (بالأساس).
 */
export async function saveStocktake(
  db: PrismaClient,
  payload: SaveStocktakePayload
): Promise<{ stocktakeId: number; linesCount: number; totalDiff: number }> {
  const countedAt = payload.countedAt || isoDay(new Date())

  return db.$transaction(async (tx) => {
    const warehouse = await tx.warehouse.findFirst({
      where: { id: payload.warehouseId, isArchived: false },
    })
    if (!warehouse) throw new DomainError("اختر مخزناً صالحاً")
    if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
      throw new DomainError("أدخل الكميات الفعلية لصنف واحد على الأقل")
    }

    // التحقق من الأصناف وجلب الأرصدة الدفترية
    const productIds = [...new Set(payload.lines.map((l) => l.productId))]
    const products = await tx.product.findMany({ where: { id: { in: productIds } } })
    const productMap = new Map(products.map((p) => [p.id, p]))
    for (const id of productIds) {
      if (!productMap.get(id)) throw new DomainError(`الصنف رقم ${id} غير موجود`)
    }
    const levels = await tx.stockLevel.findMany({
      where: { productId: { in: productIds }, warehouseId: warehouse.id },
    })
    const levelMap = new Map(levels.map((l) => [l.productId, l.qty]))

    let totalDiff = 0
    const prepared: Array<{
      productId: number
      bookQty: number
      countedQty: number
      diffQty: number
    }> = []
    const seen = new Set<number>()
    for (const l of payload.lines) {
      if (seen.has(l.productId)) continue // دمج التكرارات
      seen.add(l.productId)
      if (!(l.countedQty >= 0)) throw new DomainError("الكمية الفعلية غير صالحة")
      const bookQty = round3(levelMap.get(l.productId) ?? 0)
      const diffQty = round3(l.countedQty - bookQty)
      if (diffQty === 0) continue // لا تسوية للبنود المطابقة
      totalDiff = round4(totalDiff + round4(diffQty * (productMap.get(l.productId)?.costPrice ?? 0)))
      prepared.push({ productId: l.productId, bookQty, countedQty: round3(l.countedQty), diffQty })
    }
    if (prepared.length === 0) {
      throw new DomainError("لا توجد فروقات — الرصيد الفعلي مطابق للدفتري بالكامل")
    }

    const stocktake = await tx.stocktake.create({
      data: {
        warehouseId: warehouse.id,
        countedAt,
        totalDiff,
        status: "completed",
        notes: payload.notes || null,
        ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      },
    })

    for (const line of prepared) {
      await tx.stocktakeLine.create({
        data: {
          stocktakeId: stocktake.id,
          productId: line.productId,
          bookQty: line.bookQty,
          countedQty: line.countedQty,
          diffQty: line.diffQty,
        },
      })
      const p = productMap.get(line.productId)!
      await tx.stockMovement.create({
        data: {
          productId: line.productId,
          warehouseId: warehouse.id,
          movementType: "adjustment",
          qty: line.diffQty,
          unitCost: p.costPrice,
          refType: "stocktake",
          refId: stocktake.id,
          movedAt: countedAt,
          notes: `جرد ${warehouse.name}${payload.notes ? ` — ${payload.notes}` : ""}`,
          ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
        },
      })
      // الرصيد يُضبط على الفعلي مباشرة
      await upsertStockLevel(tx, line.productId, warehouse.id, line.diffQty)
    }

    return { stocktakeId: stocktake.id, linesCount: prepared.length, totalDiff }
  })
}

/** جرد سريع لصنف واحد (من بطاقة الصنف) — session ببند واحد */
export async function adjustStock(
  db: PrismaClient,
  payload: {
    productId: number
    warehouseId: number
    countedQty: number
    notes?: string | null
    countedAt?: string
    createdAt?: string
  }
): Promise<{ stocktakeId: number; diffQty: number; totalDiff: number }> {
  const result = await saveStocktake(db, {
    warehouseId: payload.warehouseId,
    countedAt: payload.countedAt,
    notes: payload.notes ?? "جرد سريع من بطاقة الصنف",
    lines: [{ productId: payload.productId, countedQty: payload.countedQty }],
    createdAt: payload.createdAt,
  })
  const line = await db.stocktakeLine.findFirst({
    where: { stocktakeId: result.stocktakeId, productId: payload.productId },
  })
  return {
    stocktakeId: result.stocktakeId,
    diffQty: line?.diffQty ?? 0,
    totalDiff: result.totalDiff,
  }
}

// ═══════════════ تحويل المخازن (FR-01-09) ═══════════════

/** تحويل ذرّي: حركتا transfer_out (−) و transfer_in (+) بنفس المرجع refId */
export async function transferStock(
  db: PrismaClient,
  payload: TransferPayload
): Promise<{ transferId: number; fromWarehouseId: number; toWarehouseId: number; qty: number }> {
  const movedAt = payload.movedAt || isoDay(new Date())

  return db.$transaction(async (tx) => {
    if (!(payload.qty > 0)) throw new DomainError("كمية التحويل يجب أن تكون أكبر من صفر")
    if (payload.fromWarehouseId === payload.toWarehouseId) {
      throw new DomainError("لا يمكن التحويل من مخزن إلى نفسه")
    }
    const [from, to, product] = await Promise.all([
      tx.warehouse.findFirst({ where: { id: payload.fromWarehouseId, isArchived: false } }),
      tx.warehouse.findFirst({ where: { id: payload.toWarehouseId, isArchived: false } }),
      tx.product.findFirst({ where: { id: payload.productId, isArchived: false } }),
    ])
    if (!from) throw new DomainError("مخزن المصدر غير موجود أو مؤرشف")
    if (!to) throw new DomainError("مخزن الوجهة غير موجود أو مؤرشف")
    if (!product) throw new DomainError("الصنف غير موجود أو مؤرشف")

    // منع السالب في مخزن المصدر
    const level = await tx.stockLevel.findUnique({
      where: {
        productId_warehouseId: {
          productId: payload.productId,
          warehouseId: from.id,
        },
      },
    })
    const available = level?.qty ?? 0
    if (payload.qty > available + 1e-6) {
      throw new DomainError(
        `«${product.name}» الكمية غير كافية في ${from.name} — المتوفر: ${round3(available)}`
      )
    }

    // حركة الخروج أولاً — معرفها يصبح مرجع التحويل للزوج
    const out = await tx.stockMovement.create({
      data: {
        productId: payload.productId,
        warehouseId: from.id,
        movementType: "transfer_out",
        qty: -round3(payload.qty),
        unitCost: product.costPrice,
        refType: "transfer",
        refId: 0,
        movedAt,
        notes: `تحويل إلى ${to.name}${payload.notes ? ` — ${payload.notes}` : ""}`,
        ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      },
    })
    await tx.stockMovement.update({ where: { id: out.id }, data: { refId: out.id } })
    await tx.stockMovement.create({
      data: {
        productId: payload.productId,
        warehouseId: to.id,
        movementType: "transfer_in",
        qty: round3(payload.qty),
        unitCost: product.costPrice,
        refType: "transfer",
        refId: out.id,
        movedAt,
        notes: `تحويل من ${from.name}${payload.notes ? ` — ${payload.notes}` : ""}`,
        ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      },
    })

    await upsertStockLevel(tx, payload.productId, from.id, -round3(payload.qty))
    await upsertStockLevel(tx, payload.productId, to.id, round3(payload.qty))

    return {
      transferId: out.id,
      fromWarehouseId: from.id,
      toWarehouseId: to.id,
      qty: round3(payload.qty),
    }
  })
}

// ═══════════════ حفظ الصنف (إنشاء/تعديل) ═══════════════

/** إنشاء أو تعديل صنف: باركود تلقائي + أسعار العملات + رصيد افتتاحي (إنشاء) */
export async function saveProduct(
  db: PrismaClient,
  payload: SaveProductPayload
): Promise<{ productId: number; barcode: string | null }> {
  return db.$transaction(async (tx) => {
    const name = (payload.name ?? "").trim()
    if (!name) throw new DomainError("اسم الصنف إلزامي")

    // الفئة/الوحدة
    if (payload.categoryId) {
      const c = await tx.category.findFirst({ where: { id: payload.categoryId } })
      if (!c) throw new DomainError("الفئة غير موجودة")
    }
    if (payload.unitId) {
      const u = await tx.unit.findFirst({ where: { id: payload.unitId } })
      if (!u) throw new DomainError("وحدة القياس غير موجودة")
    }

    // الباركود: فريد أو توليد EAN-13 تلقائي (FR-01-02)
    let barcode = (payload.barcode ?? "").trim() || null
    if (barcode) {
      const dup = await tx.product.findFirst({
        where: { barcode, ...(payload.id ? { id: { not: payload.id } } : {}) },
      })
      if (dup) throw new DomainError("الباركود مستخدم لصنف آخر — أدخل باركوداً مختلفاً")
    } else if (!payload.id) {
      // توليد باركود فريد (بذرة زمنية)
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateEan13(Date.now() + attempt * 7919)
        const dup = await tx.product.findFirst({ where: { barcode: candidate } })
        if (!dup) {
          barcode = candidate
          break
        }
      }
    }

    const costPrice = Math.max(0, payload.costPrice ?? 0)
    const minStock = Math.max(0, payload.minStock ?? 0)

    let productId: number
    if (payload.id) {
      // ─── تعديل ───
      const existing = await tx.product.findUnique({ where: { id: payload.id } })
      if (!existing) throw new DomainError("الصنف غير موجود", 404)
      await tx.product.update({
        where: { id: payload.id },
        data: {
          name,
          barcode,
          categoryId: payload.categoryId ?? null,
          unitId: payload.unitId ?? null,
          costPrice,
          minStock,
          notes: payload.notes || null,
          ...(payload.isArchived != null ? { isArchived: payload.isArchived } : {}),
        },
      })
      productId = payload.id
    } else {
      // ─── إنشاء ───
      const created = await tx.product.create({
        data: {
          name,
          barcode,
          categoryId: payload.categoryId ?? null,
          unitId: payload.unitId ?? null,
          costPrice,
          minStock,
          notes: payload.notes || null,
        },
      })
      productId = created.id
    }

    // أسعار البيع لكل عملة (upsert)
    if (payload.prices) {
      const currencies = await tx.currency.findMany()
      const byCode = new Map(currencies.map((c) => [c.code, c]))
      for (const [code, price] of Object.entries(payload.prices)) {
        const currency = byCode.get(code)
        if (!currency) continue
        if (!(price >= 0)) continue
        await tx.productPrice.upsert({
          where: { productId_currencyId: { productId, currencyId: currency.id } },
          create: { productId, currencyId: currency.id, price: round4(price) },
          update: { price: round4(price) },
        })
      }
    }

    // الرصيد الافتتاحي (إنشاء فقط): حركة opening + رصيد
    if (!payload.id && payload.openingQty && payload.openingQty > 0) {
      const warehouseId = payload.openingWarehouseId
      if (!warehouseId) throw new DomainError("اختر مخزن الكمية الافتتاحية")
      const warehouse = await tx.warehouse.findFirst({
        where: { id: warehouseId, isArchived: false },
      })
      if (!warehouse) throw new DomainError("مخزن الكمية الافتتاحية غير صالح")
      await tx.stockMovement.create({
        data: {
          productId,
          warehouseId: warehouse.id,
          movementType: "opening",
          qty: round3(payload.openingQty),
          unitCost: costPrice,
          refType: null,
          refId: null,
          movedAt: isoDay(new Date()),
          notes: "رصيد افتتاحي عند إنشاء الصنف",
        },
      })
      await upsertStockLevel(tx, productId, warehouse.id, round3(payload.openingQty))
    }

    return { productId, barcode }
  })
}

/** تحويل رقمي آمن من query */
export function toInt(v: string | null | undefined, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : fallback
}
