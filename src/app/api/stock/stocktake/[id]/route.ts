import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/stock/stocktake/[id] — تفاصيل جلسة جرد (البنود والفروقات). */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const stocktakeId = Number(id);
    const session = await db.stocktake.findUnique({
      where: { id: stocktakeId },
      include: {
        warehouse: { select: { name: true } },
        lines: {
          orderBy: { diffQty: "asc" },
          include: {
            product: {
              select: { id: true, name: true, barcode: true, costPrice: true, unit: { select: { name: true } } },
            },
          },
        },
      },
    });
    if (!session) {
      return NextResponse.json({ error: "جلسة الجرد غير موجودة" }, { status: 404 });
    }
    return NextResponse.json({
      stocktake: {
        id: session.id,
        countedAt: session.countedAt,
        createdAt: session.createdAt.toISOString(),
        warehouseName: session.warehouse.name,
        totalDiff: session.totalDiff,
        notes: session.notes,
        lines: session.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productName: l.product.name,
          barcode: l.product.barcode,
          unitName: l.product.unit?.name ?? null,
          bookQty: l.bookQty,
          countedQty: l.countedQty,
          diffQty: l.diffQty,
          costPrice: l.product.costPrice,
          diffValue: Math.round(l.diffQty * l.product.costPrice * 10000) / 10000,
        })),
      },
    });
  } catch (e) {
    console.error("GET /api/stock/stocktake/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل الجلسة" }, { status: 500 });
  }
}
