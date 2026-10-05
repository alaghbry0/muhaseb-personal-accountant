/**
 * Domain — عروض الأسعار (Quotation) — FR-02-11.
 * مستند غير ملزم: لا أثر مخزني/نقدي. قابل للتحويل لفاتورة حقيقية عبر saveSaleInvoice.
 */
import type { PrismaClient, Prisma } from "@prisma/client"
import { round4 } from "./money"
import { calcLineTotal, calcInvoiceTotals } from "./invoice"
import { computeNextDocNo, DomainError, saveSaleInvoice, type PayMode } from "./invoice-save"
import type { QuotationDetailDto, QuotationItemDto } from "./dto"

export interface QuotationItemPayload {
  productId: number
  qty: number
  unitPrice: number
  discountPercent?: number
}

export interface SaveQuotationPayload {
  issuedAt?: string
  customerId?: number | null
  currencyId: number
  exchangeRate?: number | null
  items: QuotationItemPayload[]
  invoiceDiscount?: number
  taxRate?: number
  validUntil?: string | null
  notes?: string | null
  /** للـ seed فقط — طابع زمني تاريخي للسجل (ISO) */
  createdAt?: string
}

type Tx = Prisma.TransactionClient

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** حفظ عرض سعر (بنوده نسخ أسعار لحظة الإنشاء) */
export async function saveQuotation(
  db: PrismaClient,
  payload: SaveQuotationPayload
): Promise<number> {
  const issuedAt = payload.issuedAt || isoDay(new Date())

  return db.$transaction(async (tx) => {
    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new DomainError("أضف صنفاً واحداً على الأقل لعرض السعر")
    }
    for (const it of payload.items) {
      if (!(it.qty > 0)) throw new DomainError("الكمية يجب أن تكون أكبر من صفر")
      if (!(it.unitPrice >= 0)) throw new DomainError("السعر غير صالح")
    }

    const currency = await tx.currency.findUnique({ where: { id: payload.currencyId } })
    if (!currency || !currency.isActive) throw new DomainError("اختر عملة صالحة")

    let exchangeRate = 1
    if (!currency.isBase) {
      const given = Number(payload.exchangeRate ?? 0)
      if (given > 0) {
        exchangeRate = given
      } else {
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
        exchangeRate = rate.rate
      }
    }

    if (payload.customerId) {
      const c = await tx.customer.findFirst({
        where: { id: payload.customerId, isArchived: false },
      })
      if (!c) throw new DomainError("العميل غير موجود أو مؤرشف")
    }

    const productIds = [...new Set(payload.items.map((i) => i.productId))]
    const products = await tx.product.findMany({ where: { id: { in: productIds } } })
    const productMap = new Map(products.map((p) => [p.id, p]))
    for (const id of productIds) {
      const p = productMap.get(id)
      if (!p || p.isArchived) throw new DomainError(`الصنف رقم ${id} غير موجود أو مؤرشف`)
    }

    const totals = calcInvoiceTotals(
      payload.items.map((it) => ({
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent ?? 0,
      })),
      {
        invoiceDiscount: payload.invoiceDiscount ?? 0,
        taxRate: payload.taxRate ?? 0,
        paidAmount: 0,
      }
    )

    const quoteNo = await computeNextDocNo(tx, "quotation", "quotation", issuedAt)
    const quotation = await tx.quotation.create({
      data: {
        quoteNo,
        issuedAt,
        customerId: payload.customerId ?? null,
        currencyId: currency.id,
        exchangeRate,
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        taxRate: payload.taxRate ?? 0,
        taxAmount: totals.taxAmount,
        total: totals.total,
        validUntil: payload.validUntil || null,
        notes: payload.notes || null,
        status: "open",
        ...(payload.createdAt ? { createdAt: new Date(payload.createdAt) } : {}),
      },
    })

    for (const it of payload.items) {
      const line = calcLineTotal({
        qty: it.qty,
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent ?? 0,
      })
      await tx.quotationItem.create({
        data: {
          quotationId: quotation.id,
          productId: it.productId,
          qty: it.qty,
          unitPrice: it.unitPrice,
          discountPercent: it.discountPercent ?? 0,
          lineTotal: line.total,
        },
      })
    }

    return quotation.id
  })
}

export interface ConvertQuotationPayload {
  warehouseId: number
  cashboxId?: number | null
  payMode: PayMode
  paidAmount?: number | null
  salesRepId?: number | null
}

/** تحويل عرض سعر لفاتورة حقيقية — عبر نفس مسار الحفظ الذرّي */
export async function convertQuotationToInvoice(
  db: PrismaClient,
  quotationId: number,
  payload: ConvertQuotationPayload
): Promise<{ invoiceId: number; invoiceNo: string }> {
  const quote = await db.quotation.findUnique({
    where: { id: quotationId },
    include: { items: true },
  })
  if (!quote) throw new DomainError("عرض السعر غير موجود", 404)
  if (quote.status === "converted") throw new DomainError("عرض السعر محوَّل لفاتورة بالفعل")
  if (quote.items.length === 0) throw new DomainError("عرض السعر بلا بنود")

  const result = await saveSaleInvoice(db, {
    issuedAt: undefined, // تاريخ اليوم
    customerId: quote.customerId,
    salesRepId: payload.salesRepId ?? null,
    cashboxId: payload.cashboxId ?? null,
    warehouseId: payload.warehouseId,
    currencyId: quote.currencyId,
    exchangeRate: quote.exchangeRate,
    items: quote.items.map((it) => ({
      productId: it.productId,
      qty: it.qty,
      unitPrice: it.unitPrice,
      discountPercent: it.discountPercent,
    })),
    invoiceDiscount: quote.discountAmount,
    taxRate: quote.taxRate,
    payMode: payload.payMode,
    paidAmount: payload.paidAmount ?? null,
    quotationId: quote.id,
  })
  return { invoiceId: result.invoiceId, invoiceNo: result.invoiceNo }
}

/** تفاصيل عرض سعر DTO (بنود + عميل) */
export async function fetchQuotationDetail(
  db: PrismaClient | Tx,
  id: number
): Promise<QuotationDetailDto | null> {
  const row = await db.quotation.findUnique({
    where: { id },
    include: {
      customer: true,
      currency: { select: { code: true } },
      items: {
        orderBy: { id: "asc" as const },
        include: { product: { select: { name: true } } },
      },
    },
  })
  if (!row) return null
  const items: QuotationItemDto[] = row.items.map((it) => ({
    id: it.id,
    productId: it.productId,
    productName: it.product.name,
    qty: it.qty,
    unitPrice: it.unitPrice,
    discountPercent: it.discountPercent,
    lineTotal: round4(it.lineTotal),
  }))
  return {
    id: row.id,
    quoteNo: row.quoteNo,
    issuedAt: row.issuedAt,
    createdAt: row.createdAt.toISOString(),
    customer: row.customer
      ? { id: row.customer.id, name: row.customer.name, phone: row.customer.phone, whatsapp: row.customer.whatsapp }
      : null,
    currencyCode: row.currency.code,
    exchangeRate: row.exchangeRate,
    subtotal: row.subtotal,
    discountAmount: row.discountAmount,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    total: round4(row.total),
    validUntil: row.validUntil,
    notes: row.notes,
    status: row.status,
    invoiceId: row.invoiceId,
    items,
  }
}
