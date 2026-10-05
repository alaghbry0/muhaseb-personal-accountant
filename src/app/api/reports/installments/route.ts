import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { installmentsForecast } from "@/domain/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/installments — تقرير الأقساط (FR-05-05):
 * المحصّل/المستحق/المتأخر + توقع التدفق النقدي 6 أشهر + الخطط.
 */
export async function GET() {
  try {
    const report = await installmentsForecast(db);
    return NextResponse.json(report);
  } catch (e) {
    console.error("GET /api/reports/installments error:", e);
    return NextResponse.json({ error: "تعذر توليد تقرير الأقساط" }, { status: 500 });
  }
}
