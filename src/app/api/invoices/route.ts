import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveSaleInvoice, DomainError } from "@/domain/invoice-save";
import { fetchInvoiceDetail, type InvoiceListResponse } from "@/domain/dto";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * POST /api/invoices — إنشاء فاتورة (حفظ ذرّي كامل).
 * هذه المرحلة (Task 2) تنفّذ docType='sale' حصراً —
 * المشتريات والمرتجعات (Task 3-a) ستوسّع هذا الملف نفسه.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const docType = String(body.docType ?? "sale");
    if (docType !== "sale") {
      return NextResponse.json(
        { error: "تُنفَّذ في المرحلة القادمة" },
        { status: 501 }
      );
    }

    const result = await saveSaleInvoice(db, {
      ...(body as object),
      docType: "sale",
    } as Parameters<typeof saveSaleInvoice>[1]);

    const invoice = await fetchInvoiceDetail(db, result.invoiceId);
    return NextResponse.json({ invoice, customerBalance: result.customerBalance });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/invoices error:", e);
    return NextResponse.json({ error: "تعذر حفظ الفاتورة" }, { status: 500 });
  }
}

/**
 * GET /api/invoices — قائمة الفواتير مع فلاتر.
 * ?docType=sale&payStatus=&status=&customerId=&from=&to=&q=&page= (صفحة 20)
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const docType = sp.get("docType") ?? "sale";
    const payStatus = sp.get("payStatus");
    const status = sp.get("status");
    const customerId = sp.get("customerId");
    const from = sp.get("from");
    const to = sp.get("to");
    const q = sp.get("q")?.trim();
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = 20;

    const where: Prisma.InvoiceWhereInput = { docType };
    if (payStatus) where.payStatus = payStatus;
    if (status) where.status = status;
    if (customerId) where.customerId = Number(customerId);
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
    return NextResponse.json({ error: "تعذر تحميل الفواتير" }, { status: 500 });
  }
}
