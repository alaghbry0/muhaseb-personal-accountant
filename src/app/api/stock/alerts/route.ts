import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/stock/alerts — تنبيهات المخزون (FR-01-12):
 *   lowStock: الأصناف تحت الحد الأدنى (مرتبة بالعجز) + الرصيد لكل مخزن.
 *   deadStock: أصناف راكدة — لا حركة خلال 90 يوماً ولها رصيد.
 */
export async function GET() {
  try {
    const day = new Date();
    day.setDate(day.getDate() - 90);
    const cutoff = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;

    const products = await db.product.findMany({
      where: { isArchived: false, minStock: { gt: 0 } },
      include: {
        stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
        unit: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    });

    const lowStock = products
      .map((p) => {
        const totalQty = p.stockLevels.reduce((s, l) => s + l.qty, 0);
        return {
          id: p.id,
          name: p.name,
          barcode: p.barcode,
          unitName: p.unit?.name ?? null,
          totalQty,
          minStock: p.minStock,
          deficit: Math.round((p.minStock - totalQty) * 1000) / 1000,
          costPrice: p.costPrice,
          stockByWarehouse: p.stockLevels.map((l) => ({
            warehouseId: l.warehouse.id,
            name: l.warehouse.name,
            qty: l.qty,
          })),
        };
      })
      .filter((p) => p.totalQty < p.minStock)
      .sort((a, b) => b.deficit - a.deficit);

    // الراكدة: لها رصيد ولا حركة (من أي نوع) خلال 90 يوماً
    const stockProducts = await db.product.findMany({
      where: { isArchived: false },
      include: {
        stockLevels: { select: { qty: true } },
        unit: { select: { name: true } },
      },
    });
    const lastMoves = await db.stockMovement.groupBy({
      by: ["productId"],
      where: { movedAt: { gte: cutoff } },
      _max: { movedAt: true },
    });
    const recentIds = new Set(lastMoves.map((m) => m.productId));

    const deadStock = stockProducts
      .filter((p) => {
        const totalQty = p.stockLevels.reduce((s, l) => s + l.qty, 0);
        return totalQty > 0 && !recentIds.has(p.id)
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        unitName: p.unit?.name ?? null,
        totalQty: p.stockLevels.reduce((s, l) => s + l.qty, 0),
        stockValue: p.stockLevels.reduce((s, l) => s + l.qty, 0) * p.costPrice,
      }));

    return NextResponse.json({ lowStock, deadStock, cutoffDays: 90, cutoff });
  } catch (e) {
    console.error("GET /api/stock/alerts error:", e);
    return NextResponse.json({ error: "تعذر تحميل التنبيهات" }, { status: 500 });
  }
}
