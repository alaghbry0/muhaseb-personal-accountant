import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveStocktake, DomainError, type SaveStocktakePayload } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/**
 * POST /api/stock/stocktake — اعتماد جرد (FR-01-08): ذرّي.
 * { warehouseId, countedAt?, notes?, lines: [{ productId, countedQty }] }
 * → لكل فرق: stocktake_line + movement('adjustment') + ضبط الرصيد.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const result = await saveStocktake(db, body as unknown as SaveStocktakePayload);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/stock/stocktake error:", e);
    return NextResponse.json({ error: "تعذر اعتماد الجرد" }, { status: 500 });
  }
}

/**
 * GET /api/stock/stocktake — جلسات الجرد (الأحدث أولاً) مع عدد البنود.
 */
export async function GET() {
  try {
    const rows = await db.stocktake.findMany({
      orderBy: [{ countedAt: "desc" }, { id: "desc" }],
      take: 50,
      include: {
        warehouse: { select: { name: true } },
        _count: { select: { lines: true } },
      },
    });
    return NextResponse.json({
      stocktakes: rows.map((s) => ({
        id: s.id,
        countedAt: s.countedAt,
        createdAt: s.createdAt.toISOString(),
        warehouseName: s.warehouse.name,
        totalDiff: s.totalDiff,
        linesCount: s._count.lines,
        notes: s.notes,
      })),
    });
  } catch (e) {
    console.error("GET /api/stock/stocktake error:", e);
    return NextResponse.json({ error: "تعذر تحميل جلسات الجرد" }, { status: 500 });
  }
}
