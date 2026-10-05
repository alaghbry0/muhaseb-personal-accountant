import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/stock/transfers — سجل التحويلات (مشتق من حركات ref_type='transfer'):
 * كل زوج (transfer_out + transfer_in) مجمَّع بمرجع refId.
 */
export async function GET() {
  try {
    const movements = await db.stockMovement.findMany({
      where: { refType: "transfer" },
      orderBy: [{ movedAt: "desc" }, { id: "desc" }],
      take: 200,
      include: {
        product: { select: { id: true, name: true, unit: { select: { name: true } } } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    // تجميع الأزواج حسب refId (خروج = المصدر، دخول = الوجهة)
    const byRef = new Map<
      number,
      {
        id: number
        movedAt: string
        productId: number
        productName: string
        unitName: string | null
        qty: number
        fromWarehouse: string
        toWarehouse: string
        notes: string | null
      }
    >();
    for (const m of movements) {
      if (m.movementType !== "transfer_out" || m.refId == null) continue
      const inMove = movements.find(
        (x) => x.refId === m.refId && x.movementType === "transfer_in"
      )
      byRef.set(m.refId, {
        id: m.refId,
        movedAt: m.movedAt,
        productId: m.productId,
        productName: m.product.name,
        unitName: m.product.unit?.name ?? null,
        qty: Math.abs(m.qty),
        fromWarehouse: m.warehouse.name,
        toWarehouse: inMove?.warehouse.name ?? "—",
        notes: m.notes,
      })
    }

    const transfers = [...byRef.values()].sort((a, b) =>
      a.movedAt === b.movedAt ? b.id - a.id : b.movedAt < a.movedAt ? -1 : 1
    );
    return NextResponse.json({ transfers });
  } catch (e) {
    console.error("GET /api/stock/transfers error:", e);
    return NextResponse.json({ error: "تعذر تحميل التحويلات" }, { status: 500 });
  }
}
