import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getShiftDetails } from "@/domain/cash";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/cashbox/shift/[id] — تفاصيل وردية مقفلة (Task 10-b):
 * نفس بنية نتيجة الإقفال (متوقع/فعلي/الفرق + التصنيف معاد حسابه من الحركات
 * بين يومي الفتح والإقفال) + عدّ البداية والملاحظات. الوردية المفتوحة 400.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const shiftId = Number(id);
    if (!shiftId) {
      return NextResponse.json({ error: "رقم وردية غير صالح" }, { status: 400 });
    }
    const details = await getShiftDetails(db, shiftId);
    return NextResponse.json(details);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/cashbox/shift/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل تفاصيل الوردية" }, { status: 500 });
  }
}
