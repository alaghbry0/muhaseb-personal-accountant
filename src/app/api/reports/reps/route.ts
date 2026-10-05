import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { repsReport, parsePeriod } from "@/domain/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/reps?from=&to= — أداء المناديب (FR-06-04):
 * فواتير/مبيعات/تحصيلات/مرتجعات/عمولات مستحقة ومصروفة لكل مندوب.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const period = parsePeriod(sp.get("from"), sp.get("to"));
    const report = await repsReport(db, period);
    return NextResponse.json(report);
  } catch (e) {
    console.error("GET /api/reports/reps error:", e);
    return NextResponse.json({ error: "تعذر توليد تقرير المناديب" }, { status: 500 });
  }
}
