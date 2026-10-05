import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expensesByCategory, parsePeriod } from "@/domain/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/expenses?from=&to= — تقرير المصروفات حسب الفئة (FR-09-08).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const period = parsePeriod(sp.get("from"), sp.get("to"));
    const report = await expensesByCategory(db, period);
    return NextResponse.json(report);
  } catch (e) {
    console.error("GET /api/reports/expenses error:", e);
    return NextResponse.json({ error: "تعذر توليد تقرير المصروفات" }, { status: 500 });
  }
}
