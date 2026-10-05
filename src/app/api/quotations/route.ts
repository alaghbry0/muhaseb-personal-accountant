import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveQuotation, fetchQuotationDetail } from "@/domain/quotation";
import { DomainError } from "@/domain/invoice-save";
import type { QuotationListResponse } from "@/domain/dto";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/** POST /api/quotations — إنشاء عرض سعر (بلا أثر مالي/مخزني — FR-02-11) */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = await saveQuotation(db, body as Parameters<typeof saveQuotation>[1]);
    const quotation = await fetchQuotationDetail(db, id);
    return NextResponse.json({ quotation });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/quotations error:", e);
    return NextResponse.json({ error: "تعذر حفظ عرض السعر" }, { status: 500 });
  }
}

/** GET /api/quotations?status=&q=&page= — قائمة عروض الأسعار (صفحة 20) */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const q = sp.get("q")?.trim();
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = 20;

    const where: Prisma.QuotationWhereInput = {};
    if (status) where.status = status;
    if (q) {
      where.OR = [{ quoteNo: { contains: q } }, { customer: { name: { contains: q } } }];
    }

    const [total, rows] = await Promise.all([
      db.quotation.count({ where }),
      db.quotation.findMany({
        where,
        orderBy: [{ id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { name: true } },
          currency: { select: { code: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    const data: QuotationListResponse = {
      quotations: rows.map((r) => ({
        id: r.id,
        quoteNo: r.quoteNo,
        issuedAt: r.issuedAt,
        customerName: r.customer?.name ?? null,
        total: r.total,
        currencyCode: r.currency.code,
        status: r.status,
        validUntil: r.validUntil,
        itemsCount: r._count.items,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    };
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/quotations error:", e);
    return NextResponse.json({ error: "تعذر تحميل عروض الأسعار" }, { status: 500 });
  }
}
