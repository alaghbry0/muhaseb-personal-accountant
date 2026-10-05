import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/parties/reps?limit=50 — قائمة المناديب.
 * (أُنشئت من Task 2 لاختيار المندوب في POS — نفس الحقول الأساسية محفوظة،
 * أضيف Task 3-b: areas + إحصاءات العمولات لقائمة المناديب.)
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
        areas: true,
      },
    });

    // إحصاءات العمولات لكل مندوب
    const withStats = await Promise.all(
      reps.map(async (r) => {
        const [dueAgg, paidAgg] = await Promise.all([
          db.commission.aggregate({
            _sum: { amount: true },
            _count: true,
            where: { salesRepId: r.id, status: "due" },
          }),
          db.commission.aggregate({
            _sum: { amount: true },
            where: { salesRepId: r.id, status: "paid" },
          }),
        ]);
        return {
          ...r,
          commissionDue: dueAgg._sum.amount ?? 0,
          commissionDueCount: dueAgg._count,
          commissionPaid: paidAgg._sum.amount ?? 0,
        };
      })
    );

    return NextResponse.json({ reps: withStats });
  } catch (e) {
    console.error("GET /api/parties/reps error:", e);
    return NextResponse.json({ error: "تعذر تحميل المناديب" }, { status: 500 });
  }
}
