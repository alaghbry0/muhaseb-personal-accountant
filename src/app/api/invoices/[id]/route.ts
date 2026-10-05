import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchInvoiceDetail } from "@/domain/dto";

export const dynamic = "force-dynamic";

/** GET /api/invoices/[id] — فاتورة كاملة: بنود + طرف + مندوب + مدفوعات + ربح */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invoice = await fetchInvoiceDetail(db, Number(id));
    if (!invoice) {
      return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
    }
    return NextResponse.json({ invoice });
  } catch (e) {
    console.error("GET /api/invoices/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل الفاتورة" }, { status: 500 });
  }
}
