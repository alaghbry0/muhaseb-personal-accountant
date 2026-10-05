import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { salesBy, parsePeriod, SALES_DIMENSIONS, type SalesDimension } from "@/domain/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/sales-by?dimension=customer|rep|category|product|day&from=&to=
 * المبيعات حسب البُعد مع مقارنة الفترة السابقة (FR-09-06).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const dimension = (sp.get("dimension") || "customer") as SalesDimension;
    if (!SALES_DIMENSIONS.some((d) => d.id === dimension)) {
      return NextResponse.json({ error: "بُعد التجميع غير صالح" }, { status: 400 });
    }
    const period = parsePeriod(sp.get("from"), sp.get("to"));
    const report = await salesBy(db, { dimension, ...period });
    return NextResponse.json(report);
  } catch (e) {
    console.error("GET /api/reports/sales-by error:", e);
    return NextResponse.json({ error: "تعذر توليد تقرير المبيعات" }, { status: 500 });
  }
}
