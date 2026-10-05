import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { profitAndLoss, parsePeriod } from "@/domain/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/profit-loss?from=&to= — حركة الشركة / الأرباح والخسائر (FR-09-02).
 * الإيرادات − التكلفة = الربح الإجمالي − المصروفات − العمولات = الصافي + سلسلة زمنية.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const period = parsePeriod(sp.get("from"), sp.get("to"));
    const report = await profitAndLoss(db, period);
    return NextResponse.json(report);
  } catch (e) {
    console.error("GET /api/reports/profit-loss error:", e);
    return NextResponse.json({ error: "تعذر توليد تقرير الأرباح والخسائر" }, { status: 500 });
  }
}
