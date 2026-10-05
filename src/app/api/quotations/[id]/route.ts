import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchQuotationDetail } from "@/domain/quotation";

export const dynamic = "force-dynamic";

/** GET /api/quotations/[id] — عرض سعر كامل بالبنود والعميل */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quotation = await fetchQuotationDetail(db, Number(id));
    if (!quotation) {
      return NextResponse.json({ error: "عرض السعر غير موجود" }, { status: 404 });
    }
    return NextResponse.json({ quotation });
  } catch (e) {
    console.error("GET /api/quotations/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل عرض السعر" }, { status: 500 });
  }
}
