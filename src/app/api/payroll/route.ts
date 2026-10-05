import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPayrollHistory } from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/payroll?period=YYYY-MM
 * مع period: بنود مسير ذلك الشهر (مدفوع/مسودة) — سجل الرواتب غير قابل للتعديل (FR-07-05).
 * بدونه: ملخص كل الأشهر (الفترة، عدد الموظفين، الصافي، الحالة).
 */
export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get("period") ?? undefined;
    const data = await getPayrollHistory(db, period || undefined);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/payroll error:", e);
    return NextResponse.json({ error: "تعذر تحميل مسيرات الرواتب" }, { status: 500 });
  }
}
