import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPlanDetail } from "@/domain/installments";

export const dynamic = "force-dynamic";

/** GET /api/installments/plans/[id] — تفاصيل خطة + جدول الأقساط كاملاً */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const detail = await getPlanDetail(db, Number(id));
    if (!detail) return NextResponse.json({ error: "الخطة غير موجودة" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    console.error("GET /api/installments/plans/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل الخطة" }, { status: 500 });
  }
}
