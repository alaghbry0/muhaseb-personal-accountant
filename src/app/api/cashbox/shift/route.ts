import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getShiftState, openShift } from "@/domain/cash";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/cashbox/shift?cashboxId= — حالة الوردية:
 * المفتوحة + الرصيد المتوقع + تصنيف الحركات منذ الفتح + سجل المغلقات.
 */
export async function GET(req: NextRequest) {
  try {
    const cashboxId = Number(req.nextUrl.searchParams.get("cashboxId"));
    if (!cashboxId) return NextResponse.json({ error: "اختر الصندوق" }, { status: 400 });
    const state = await getShiftState(db, cashboxId);
    return NextResponse.json(state);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/cashbox/shift error:", e);
    return NextResponse.json({ error: "تعذر تحميل حالة الوردية" }, { status: 500 });
  }
}

/**
 * POST /api/cashbox/shift — فتح وردية لصندوق.
 * Body: { cashboxId, openingCount?, notes? } — openingCount افتراضياً الرصيد الحالي.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.cashboxId) return NextResponse.json({ error: "اختر الصندوق" }, { status: 400 });
    const result = await openShift(db, {
      cashboxId: Number(body.cashboxId),
      openingCount: body.openingCount != null ? Number(body.openingCount) : undefined,
      notes: body.notes || undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/cashbox/shift error:", e);
    return NextResponse.json({ error: "تعذر فتح الوردية" }, { status: 500 });
  }
}
