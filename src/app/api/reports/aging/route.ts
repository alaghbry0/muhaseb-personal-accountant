import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { receivablesAging } from "@/domain/reports";

export const dynamic = "force-dynamic";

/**
 * GET /api/reports/aging — أعمار الديون (FR-09-05):
 * أرصدة العملاء موزعة 0-30/31-60/61-90/+90 يوماً (FIFO للتحصيلات).
 */
export async function GET() {
  try {
    const report = await receivablesAging(db);
    return NextResponse.json(report);
  } catch (e) {
    console.error("GET /api/reports/aging error:", e);
    return NextResponse.json({ error: "تعذر توليد تقرير أعمار الديون" }, { status: 500 });
  }
}
