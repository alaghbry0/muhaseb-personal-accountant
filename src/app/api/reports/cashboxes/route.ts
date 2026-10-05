import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cashboxesReport, parsePeriod } from "@/domain/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/cashboxes?from=&to= — تقرير الصناديق (FR-09-08):
 * افتتاحي/وارد/صادر/ختامي لكل صندوق بعملته + إجماليات بالأساس.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const period = parsePeriod(sp.get("from"), sp.get("to"));
    const report = await cashboxesReport(db, period);
    return NextResponse.json(report);
  } catch (e) {
    console.error("GET /api/reports/cashboxes error:", e);
    return NextResponse.json({ error: "تعذر توليد تقرير الصناديق" }, { status: 500 });
  }
}
