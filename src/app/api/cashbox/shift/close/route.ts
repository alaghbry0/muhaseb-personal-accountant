import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { closeShift } from "@/domain/cash";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * POST /api/cashbox/shift/close — إقفال الوردية (FR-04-04).
 * Body: { cashboxId, counted, notes? }
 * المتوقع = الرصيد المحسوب حالياً؛ الفرق = العدّ الفعلي − المتوقع.
 * إن لم تكن هناك وردية مفتوحة تُنشأ وتُقفل فوراً (تقرير لحظي).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.cashboxId) return NextResponse.json({ error: "اختر الصندوق" }, { status: 400 });
    if (body.counted == null || Number(body.counted) < 0) {
      return NextResponse.json({ error: "أدخل العدّ الفعلي للنقدية" }, { status: 400 });
    }
    const result = await closeShift(db, {
      cashboxId: Number(body.cashboxId),
      counted: Number(body.counted),
      notes: body.notes || undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/cashbox/shift/close error:", e);
    return NextResponse.json({ error: "تعذر إقفال الوردية" }, { status: 500 });
  }
}
