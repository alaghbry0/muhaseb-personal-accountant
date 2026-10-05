import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeNextDocNo, DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/invoices/next-number?docType=sale — معاينة الرقم التالي لرأس شاشة البيع.
 * معاينة فقط (لا تحجز) — الرقم الفعلي يولَّد داخل معاملة الحفظ.
 */
export async function GET(req: NextRequest) {
  try {
    const docType = req.nextUrl.searchParams.get("docType") ?? "sale";
    if (docType !== "sale") {
      return NextResponse.json(
        { error: "تُنفَّذ في المرحلة القادمة" },
        { status: 501 }
      );
    }
    const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;
    const invoiceNo = await db.$transaction((tx) =>
      computeNextDocNo(tx, "invoice", "sale", today)
    );
    return NextResponse.json({ invoiceNo });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("next-number error:", e);
    return NextResponse.json({ error: "تعذر حساب الرقم التالي" }, { status: 500 });
  }
}
