import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DomainError } from "@/domain/invoice-save";
import { round2, round4 } from "@/domain/money";

export const dynamic = "force-dynamic";

/**
 * GET /api/reps?q=&limit= — قائمة المناديب النشطين + إحصاءات العمولات والمبيعات.
 * (مكملة لـ GET /api/parties/reps المستخدمة في POS — نفس الشكل مع مبيعات كل مندوب.)
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") ?? "").trim();
    const limit = Math.min(100, Math.max(1, Number(sp.get("limit") ?? 50) || 50));
    const reps = await db.salesRep.findMany({
      where: {
        isArchived: false,
        ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } : {}),
      },
      orderBy: { name: "asc" },
      take: limit,
    });
    const withStats = await Promise.all(
      reps.map(async (r) => {
        const [dueAgg, paidAgg, salesAgg] = await Promise.all([
          db.commission.aggregate({
            _sum: { amount: true },
            _count: true,
            where: { salesRepId: r.id, status: "due" },
          }),
          db.commission.aggregate({
            _sum: { amount: true },
            where: { salesRepId: r.id, status: "paid" },
          }),
          db.invoice.aggregate({
            _sum: { totalBase: true },
            where: { salesRepId: r.id, docType: "sale", status: "completed" },
          }),
        ]);
        return {
          id: r.id,
          name: r.name,
          phone: r.phone,
          commissionType: r.commissionType, // sales|collection|both
          commissionPercent: r.commissionPercent,
          areas: r.areas,
          commissionDue: round2(dueAgg._sum.amount ?? 0),
          commissionDueCount: dueAgg._count,
          commissionPaid: round2(paidAgg._sum.amount ?? 0),
          salesTotalBase: round4(salesAgg._sum.totalBase ?? 0),
        };
      })
    );
    return NextResponse.json({ reps: withStats });
  } catch (e) {
    console.error("GET /api/reps error:", e);
    return NextResponse.json({ error: "تعذر تحميل المناديب" }, { status: 500 });
  }
}

/**
 * POST /api/reps — إنشاء مندوب (FR-06-01).
 * Body: { name, phone?, commissionType: 'sales'|'collection'|'both',
 *         commissionPercent, areas? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "اسم المندوب إلزامي" }, { status: 400 });
    const type = body.commissionType ?? "sales";
    if (!["sales", "collection", "both"].includes(type)) {
      return NextResponse.json({ error: "نوع العمولة غير صحيح" }, { status: 400 });
    }
    const percent = Number(body.commissionPercent ?? 0);
    if (!(percent >= 0 && percent <= 100)) {
      return NextResponse.json({ error: "نسبة العمولة يجب أن تكون بين 0 و 100" }, { status: 400 });
    }
    const rep = await db.salesRep.create({
      data: {
        name,
        phone: body.phone?.trim() || null,
        commissionType: type,
        commissionPercent: percent,
        areas: body.areas?.trim() || null,
      },
    });
    return NextResponse.json({ rep });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/reps error:", e);
    return NextResponse.json({ error: "تعذر حفظ المندوب" }, { status: 500 });
  }
}
