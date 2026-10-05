import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { taxReport, parsePeriod } from "@/domain/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/tax?from=&to= — تقرير الضريبة (FR-09-07):
 * مبيعات/مشتريات + محصّلة/مدخلة بالأساس.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const period = parsePeriod(sp.get("from"), sp.get("to"));
    const report = await taxReport(db, period);
    return NextResponse.json(report);
  } catch (e) {
    console.error("GET /api/reports/tax error:", e);
    return NextResponse.json({ error: "تعذر توليد تقرير الضريبة" }, { status: 500 });
  }
}
