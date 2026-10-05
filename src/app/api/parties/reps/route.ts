import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/parties/reps?limit=50 — قائمة مناديب المبيعات للـ POS (قراءة فقط).
 * (أُنشئت من Task 2 لاختيار المندوب في شاشة البيع — Task 3-b يبني CRUD المناديب الكامل.)
 */
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50) || 50));
    const reps = await db.salesRep.findMany({
      where: { isArchived: false },
      orderBy: { name: "asc" },
      take: limit,
      select: {
        id: true,
        name: true,
        phone: true,
        commissionType: true,
        commissionPercent: true,
      },
    });
    return NextResponse.json({ reps });
  } catch (e) {
    console.error("GET /api/parties/reps error:", e);
    return NextResponse.json({ error: "تعذر تحميل المناديب" }, { status: 500 });
  }
}
