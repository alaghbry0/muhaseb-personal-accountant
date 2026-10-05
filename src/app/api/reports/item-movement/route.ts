import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { itemMovementCard, parsePeriod } from "@/domain/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/item-movement?productId=&warehouseId=&from=&to=
 * بطاقة صنف: كل الحركات + الرصيد التراكمي + وارد/صادر/مرتجعات (FR-09-03).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const productId = Number(sp.get("productId"));
    if (!productId) return NextResponse.json({ error: "اختر الصنف" }, { status: 400 });
    const period = parsePeriod(sp.get("from"), sp.get("to"));
    const report = await itemMovementCard(db, {
      productId,
      warehouseId: sp.get("warehouseId") ? Number(sp.get("warehouseId")) : null,
      ...period,
    });
    return NextResponse.json(report);
  } catch (e) {
    console.error("GET /api/reports/item-movement error:", e);
    return NextResponse.json({ error: "تعذر توليد بطاقة الصنف" }, { status: 500 });
  }
}
