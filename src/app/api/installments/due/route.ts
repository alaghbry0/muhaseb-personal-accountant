import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listDue } from "@/domain/installments";
import { todayStr } from "@/domain/parties";

export const dynamic = "force-dynamic";

/**
 * GET /api/installments/due?scope=today|week — FR-05-02
 * today: المستحق اليوم | week: من اليوم حتى نهاية الأسبوع (7 أيام)
 * + قائمة المتأخر كاملة (الأقدم أولاً) مع أرقام الهاتف للواتساب.
 */
export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get("scope") === "week" ? "week" : "today";
    const today = todayStr();
    const to = new Date(`${today}T00:00:00`);
    to.setDate(to.getDate() + (scope === "week" ? 6 : 0));
    const toStr = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`;

    const { due, late } = await listDue(db, { from: today, to: toStr });
    const dueTotal = due.reduce((s, d) => s + d.remaining, 0);
    const lateTotal = late.reduce((s, d) => s + d.remaining, 0);

    return NextResponse.json({
      scope,
      today,
      from: today,
      to: toStr,
      due,
      late,
      counts: {
        due: due.length,
        late: late.length,
        dueTotal: Math.round(dueTotal * 100) / 100,
        lateTotal: Math.round(lateTotal * 100) / 100,
      },
    });
  } catch (e) {
    console.error("GET /api/installments/due error:", e);
    return NextResponse.json({ error: "تعذر تحميل الأقساط المستحقة" }, { status: 500 });
  }
}
