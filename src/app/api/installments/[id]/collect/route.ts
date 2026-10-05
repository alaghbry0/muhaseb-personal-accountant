import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { collectInstallment } from "@/domain/installments";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * POST /api/installments/[id]/collect — تحصيل قسط (FR-05-02)
 * Body: { amount?, cashboxId, txDate?, exchangeRate? }
 * قبض في الصندوق + تحديث القسط/الخطة + عمولة مندوب التحصيل (FR-05-06).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (!body.cashboxId) {
      return NextResponse.json({ error: "اختر الصندوق" }, { status: 400 });
    }
    const result = await collectInstallment(db, {
      installmentId: Number(id),
      amount: body.amount != null ? Number(body.amount) : undefined,
      cashboxId: Number(body.cashboxId),
      txDate: body.txDate || undefined,
      exchangeRate: body.exchangeRate != null ? Number(body.exchangeRate) : null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST collect error:", e);
    return NextResponse.json({ error: "تعذر تحصيل القسط" }, { status: 500 });
  }
}
