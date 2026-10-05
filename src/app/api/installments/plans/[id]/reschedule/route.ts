import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rescheduleLate } from "@/domain/installments";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * POST /api/installments/plans/[id]/reschedule — إعادة جدولة غير المسدد (FR-05-04)
 * Body: { newFirstDue: 'YYYY-MM-DD', months? }
 * يحذف الأقساط غير المسددة ويولّد جدولاً جديداً من المتبقي (principal − totalPaid).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.newFirstDue ?? ""))) {
      return NextResponse.json({ error: "تاريخ أول استحقاق الجديد غير صالح" }, { status: 400 });
    }
    const result = await rescheduleLate(db, {
      planId: Number(id),
      newFirstDue: String(body.newFirstDue),
      months: body.months != null ? Number(body.months) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST reschedule error:", e);
    return NextResponse.json({ error: "تعذر إعادة الجدولة" }, { status: 500 });
  }
}
