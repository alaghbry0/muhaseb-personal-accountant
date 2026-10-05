import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { previewPayroll } from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/payroll/preview?period=YYYY-MM — معاينة حسابية للمسير (بلا كتابة):
 * لكل موظف نشط: الأساسي/خصم الغياب/خصم التأخير والأنصاف/السحبيات غير المخصومة/الصافي
 * + المكافآت وخصومات أخرى (من المسودة الموجودة إن وُجدت — حتى لا تضيع عند إعادة التوليد).
 */
export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get("period") ?? "";
    if (!period) {
      return NextResponse.json({ error: "حدد الشهر بصيغة YYYY-MM" }, { status: 400 });
    }
    const data = await previewPayroll(db, period);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/payroll/preview error:", e);
    return NextResponse.json({ error: "تعذر حساب المعاينة" }, { status: 500 });
  }
}
