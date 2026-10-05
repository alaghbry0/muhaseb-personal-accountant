import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveSaleInvoice, DomainError } from "@/domain/invoice-save";
import {
  savePurchaseInvoice,
  saveReturnInvoice,
  type SavePurchasePayload,
  type SaveReturnPayload,
} from "@/domain/inventory";
import { fetchInvoiceDetail, type InvoiceListResponse } from "@/domain/dto";
import type { Prisma } from "@prisma/client";
import { logAudit } from "@/domain/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/invoices — إنشاء مستند (حفظ ذرّي كامل):
 *   docType='sale'            → saveSaleInvoice (Task 2 — دون تغيير)
 *   docType='purchase'        → savePurchaseInvoice (3-a: WAC + مخزون + مورد)
 *   docType='sale_return'     → saveReturnInvoice (3-a: إعادة مخزون + رد للعميل)
 *   docType='purchase_return' → saveReturnInvoice (3-a: إخراج مخزون + استرداد من مورد)
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const docType = String(body.docType ?? "sale");

    if (docType === "sale") {
      const result = await saveSaleInvoice(db, {
        ...(body as object),
        docType: "sale",
      } as Parameters<typeof saveSaleInvoice>[1]);
      const invoice = await fetchInvoiceDetail(db, result.invoiceId);
      await logAudit(db, { action: "invoice_create", entity: "invoice", entityId: result.invoiceId, details: { docType: "sale", invoiceNo: invoice.invoiceNo, payStatus: invoice.payStatus, total: invoice.total } });
      return NextResponse.json({ invoice, customerBalance: result.customerBalance });
    }

    if (docType === "purchase") {
      const result = await savePurchaseInvoice(db, body as unknown as SavePurchasePayload);
      const invoice = await fetchInvoiceDetail(db, result.invoiceId);
      await logAudit(db, { action: "invoice_create", entity: "invoice", entityId: result.invoiceId, details: { docType: "purchase", invoiceNo: invoice.invoiceNo, total: invoice.total } });
      return NextResponse.json({ invoice, supplierBalance: result.supplierBalance });
    }

    if (docType === "sale_return" || docType === "purchase_return") {
      const result = await saveReturnInvoice(db, {
        ...(body as object),
        docType,
      } as unknown as SaveReturnPayload);
      const invoice = await fetchInvoiceDetail(db, result.invoiceId);
      await logAudit(db, { action: "invoice_create", entity: "invoice", entityId: result.invoiceId, details: { docType, invoiceNo: invoice.invoiceNo, total: invoice.total } });
      return NextResponse.json({
        invoice,
        customerBalance: result.customerBalance,
        supplierBalance: result.supplierBalance,
      });
    }

    return NextResponse.json({ error: "نوع مستند غير معروف" }, { status: 400 });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/invoices error:", e);
    return NextResponse.json({ error: "تعذر حفظ المستند" }, { status: 500 });
  }
}

/**
 * GET /api/invoices — قائمة المستندات مع فلاتر.
 * ?docType=sale|purchase|sale_return|purchase_return&payStatus=&status=&customerId=&supplierId=
 * &from=&to=&q=&page= (صفحة 20) — البحث برقم المستند أو اسم العميل/المورد.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const docType = sp.get("docType") ?? "sale";
    const payStatus = sp.get("payStatus");
    const status = sp.get("status");
    const customerId = sp.get("customerId");
    const supplierId = sp.get("supplierId");
    const from = sp.get("from");
    const to = sp.get("to");
    const q = sp.get("q")?.trim();
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = 20;

    const where: Prisma.InvoiceWhereInput = { docType };
    if (payStatus) where.payStatus = payStatus;
    if (status) where.status = status;
    if (customerId) where.customerId = Number(customerId);
    if (supplierId) where.supplierId = Number(supplierId);
    if (from || to) {
      where.issuedAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }
    if (q) {
      where.OR = [
        { invoiceNo: { contains: q } },
        { customer: { name: { contains: q } } },
        { supplier: { name: { contains: q } } },
      ];
    }

    const [total, rows] = await Promise.all([
      db.invoice.count({ where }),
      db.invoice.findMany({
        where,
        orderBy: [{ issuedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { name: true } },
          supplier: { select: { name: true } },
          currency: { select: { code: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    const data: InvoiceListResponse = {
      invoices: rows.map((r) => ({
        id: r.id,
        invoiceNo: r.invoiceNo,
        payStatus: r.payStatus,
        status: r.status,
        issuedAt: r.issuedAt,
        createdAt: r.createdAt.toISOString(),
        customerName: r.customer?.name ?? null,
        supplierName: r.supplier?.name ?? null,
        total: r.total,
        dueAmount: r.dueAmount,
        currencyCode: r.currency.code,
        itemsCount: r._count.items,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/invoices error:", e);
    return NextResponse.json({ error: "تعذر تحميل المستندات" }, { status: 500 });
  }
}
