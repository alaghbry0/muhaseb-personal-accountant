import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/[id]/movements — سجل حركات صنف مع الرصيد الجاري.
 * ?from=&to=&warehouseId=&page= (صفحة 30). الرصيد يُحسب على كامل التسلسل
 * (ضمن المخزن المحدد إن وجد) ثم تُفلترة الفترة للعرض.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }
    const sp = req.nextUrl.searchParams;
    const from = sp.get("from");
    const to = sp.get("to");
    const warehouseId = sp.get("warehouseId");
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = 30;

    const where: Prisma.StockMovementWhereInput = { productId };
    if (warehouseId) where.warehouseId = Number(warehouseId);

    // كل الحركات (ضمن المخزن) بالترتيب لحساب الرصيد الجاري
    const all = await db.stockMovement.findMany({
      where,
      orderBy: [{ movedAt: "asc" }, { id: "asc" }],
      include: { warehouse: { select: { name: true } } },
    });
    let running = 0;
    const withBalance = all.map((m) => {
      running += m.qty;
      return { row: m, balance: running };
    });

    // فلترة الفترة للعرض (الأحدث أولاً)
    let filtered = withBalance;
    if (from || to) {
      filtered = withBalance.filter(({ row }) => {
        if (from && row.movedAt < from) return false;
        if (to && row.movedAt > to) return false;
        return true;
      });
    }
    filtered = [...filtered].reverse();

    const total = filtered.length;
    const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

    // أرقام الفواتير المرجعية (لعرض REF-xxx)
    const invoiceIds = [
      ...new Set(paged.filter((x) => x.row.refType === "invoice").map((x) => x.row.refId!)),
    ];
    const invoices =
      invoiceIds.length > 0
        ? await db.invoice.findMany({
            where: { id: { in: invoiceIds } },
            select: { id: true, invoiceNo: true, docType: true },
          })
        : [];
    const invMap = new Map(invoices.map((i) => [i.id, i]));

    return NextResponse.json({
      movements: paged.map(({ row, balance }) => ({
        id: row.id,
        movedAt: row.movedAt,
        createdAt: row.createdAt.toISOString(),
        movementType: row.movementType,
        qty: row.qty,
        unitCost: row.unitCost,
        warehouseName: row.warehouse.name,
        refType: row.refType,
        refId: row.refId,
        refNo: row.refType === "invoice" ? invMap.get(row.refId!)?.invoiceNo ?? null : null,
        notes: row.notes,
        balance,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e) {
    console.error("GET /api/products/[id]/movements error:", e);
    return NextResponse.json({ error: "تعذر تحميل الحركات" }, { status: 500 });
  }
}
