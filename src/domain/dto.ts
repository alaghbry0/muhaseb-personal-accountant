/**
 * Domain — أنواع DTO المشتركة بين الـ API والواجهة لوحدة الفوترة (Task 2).
 * ملف أنواع + مخططات تحويل فقط — يستورده الخادم والعميل معاً.
 */
import type { Prisma, PrismaClient } from "@prisma/client"
import { round4 } from "./money"

// ═══════════════ DTO الفاتورة ═══════════════

export interface InvoiceItemDto {
  id: number
  productId: number
  productName: string
  barcode: string | null
  unitName: string | null
  qty: number
  unitPrice: number
  discountPercent: number
  taxPercent: number
  lineTotal: number
  lineCost: number
}

export interface CashPaymentDto {
  id: number
  txType: string
  amount: number
  txDate: string
  cashboxName: string | null
}

export interface InvoiceCustomerDto {
  id: number
  name: string
  phone: string | null
  whatsapp: string | null
}

export interface InvoiceDetailDto {
  id: number
  invoiceNo: string
  docType: string
  payStatus: string
  status: string
  issuedAt: string
  createdAt: string
  customer: InvoiceCustomerDto | null
  /** المورد (فواتير الشراء ومرتجعاتها) — أُضيف في 3-a */
  supplier: { id: number; name: string; phone: string | null } | null
  salesRepName: string | null
  warehouseName: string
  cashboxName: string | null
  currencyCode: string
  exchangeRate: number
  subtotal: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  totalBase: number
  paidAmount: number
  dueAmount: number
  costTotal: number
  /** الربح بالعملة الأساسية (فواتير البيع المكتملة فقط) */
  profit: number | null
  notesInternal: string | null
  notesPrinted: string | null
  quotationId: number | null
  items: InvoiceItemDto[]
  payments: CashPaymentDto[]
}

export interface InvoiceListItemDto {
  id: number
  invoiceNo: string
  payStatus: string
  status: string
  issuedAt: string
  createdAt: string
  customerName: string | null
  /** المورد (للمشتريات) — أُضيف في 3-a */
  supplierName: string | null
  total: number
  dueAmount: number
  currencyCode: string
  itemsCount: number
}

export interface InvoiceListResponse {
  invoices: InvoiceListItemDto[]
  total: number
  page: number
  pages: number
}

/** استجابة إنشاء فاتورة: الفاتورة الكاملة + رصيد العميل الجديد (إن وجد) */
export interface SaveInvoiceResponse {
  invoice: InvoiceDetailDto
  customerBalance: number | null
}

// ═══════════════ DTO البحث عن الأصناف (شاشة البيع) ═══════════════

export interface WarehouseStockDto {
  warehouseId: number
  name: string
  qty: number
}

export interface ProductSearchItemDto {
  id: number
  name: string
  barcode: string | null
  unitName: string | null
  categoryId: number | null
  categoryName: string | null
  costPrice: number
  minStock: number
  /** سعر البيع بكل عملة مفعّلة — مفتاح رمز العملة (YER/SAR/USD) */
  prices: Record<string, number>
  totalStock: number
  stockByWarehouse: WarehouseStockDto[]
  isLowStock: boolean
}

export interface ProductSearchResponse {
  products: ProductSearchItemDto[]
  categories: Array<{ id: number; name: string }>
}

// ═══════════════ DTO العملاء (قائمة سريعة للـ POS) ═══════════════

export interface CustomerListDto {
  id: number
  name: string
  phone: string | null
  whatsapp: string | null
  area: string | null
  creditLimit: number
  /** الرصيد الحالي (مدين موجب) — افتتاحي + آجل الفواتير المكتملة − سندات القبض الحرة */
  balance: number
}

export interface CustomerListResponse {
  customers: CustomerListDto[]
}

// ═══════════════ DTO عروض الأسعار ═══════════════

export interface QuotationItemDto {
  id: number
  productId: number
  productName: string
  qty: number
  unitPrice: number
  discountPercent: number
  lineTotal: number
}

export interface QuotationDetailDto {
  id: number
  quoteNo: string
  issuedAt: string
  createdAt: string
  customer: InvoiceCustomerDto | null
  currencyCode: string
  exchangeRate: number
  subtotal: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  total: number
  validUntil: string | null
  notes: string | null
  status: string
  invoiceId: number | null
  items: QuotationItemDto[]
}

export interface QuotationListItemDto {
  id: number
  quoteNo: string
  issuedAt: string
  customerName: string | null
  total: number
  currencyCode: string
  status: string
  validUntil: string | null
  itemsCount: number
}

export interface QuotationListResponse {
  quotations: QuotationListItemDto[]
  total: number
  page: number
  pages: number
}

// ═══════════════ المخططات (include + تحويل إلى DTO) ═══════════════

export const invoiceDetailInclude = {
  items: {
    orderBy: { id: "asc" as const },
    include: {
      product: {
        select: {
          name: true,
          barcode: true,
          unit: { select: { name: true } },
        },
      },
    },
  },
  customer: true,
  supplier: { select: { id: true, name: true, phone: true } },
  salesRep: { select: { name: true } },
  warehouse: { select: { name: true } },
  cashbox: { select: { name: true } },
  currency: { select: { code: true } },
} satisfies Prisma.InvoiceInclude

export type InvoiceDetailRow = Prisma.InvoiceGetPayload<{
  include: typeof invoiceDetailInclude
}>

type PaymentRow = Prisma.CashTxGetPayload<{
  include: { cashbox: { select: { name: true } } }
}>

export function toInvoiceDetailDto(
  row: InvoiceDetailRow,
  payments: PaymentRow[]
): InvoiceDetailDto {
  return {
    id: row.id,
    invoiceNo: row.invoiceNo,
    docType: row.docType,
    payStatus: row.payStatus,
    status: row.status,
    issuedAt: row.issuedAt,
    createdAt: row.createdAt.toISOString(),
    customer: row.customer
      ? {
          id: row.customer.id,
          name: row.customer.name,
          phone: row.customer.phone,
          whatsapp: row.customer.whatsapp,
        }
      : null,
    supplier: row.supplier
      ? { id: row.supplier.id, name: row.supplier.name, phone: row.supplier.phone ?? null }
      : null,
    salesRepName: row.salesRep?.name ?? null,
    warehouseName: row.warehouse.name,
    cashboxName: row.cashbox?.name ?? null,
    currencyCode: row.currency.code,
    exchangeRate: row.exchangeRate,
    subtotal: row.subtotal,
    discountAmount: row.discountAmount,
    taxRate: row.taxRate,
    taxAmount: row.taxAmount,
    total: row.total,
    totalBase: row.totalBase,
    paidAmount: row.paidAmount,
    dueAmount: row.dueAmount,
    costTotal: row.costTotal,
    profit:
      row.docType === "sale" && row.status === "completed"
        ? round4(row.totalBase - row.costTotal)
        : null,
    notesInternal: row.notesInternal,
    notesPrinted: row.notesPrinted,
    quotationId: row.quotationId,
    items: row.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      barcode: it.product.barcode,
      unitName: it.product.unit?.name ?? null,
      qty: it.qty,
      unitPrice: it.unitPrice,
      discountPercent: it.discountPercent,
      taxPercent: it.taxPercent,
      lineTotal: it.lineTotal,
      lineCost: it.lineCost,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      txType: p.txType,
      amount: p.amount,
      txDate: p.txDate,
      cashboxName: p.cashbox?.name ?? null,
    })),
  }
}

/** جلب فاتورة كاملة (بنود + طرف + مدفوعات + ربح) بصيغة DTO */
export async function fetchInvoiceDetail(
  db: PrismaClient | Prisma.TransactionClient,
  id: number
): Promise<InvoiceDetailDto | null> {
  const row = await db.invoice.findUnique({
    where: { id },
    include: invoiceDetailInclude,
  })
  if (!row) return null
  const payments = await db.cashTx.findMany({
    where: { refType: "invoice", refId: id },
    orderBy: { id: "asc" },
    include: { cashbox: { select: { name: true } } },
  })
  return toInvoiceDetailDto(row, payments)
}
