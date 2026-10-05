import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { round4 } from "@/domain/money";

export const dynamic = "force-dynamic";

/**
 * GET /api/parties/reps/[id] — ملف المندوب (بطاقة هيكلية — الحساب الكامل عند Task 4-b)
 * بيانات + إحصاءات (مبيعاته، عمولاته المستحقة/المدفوعة) + سجل العمولات + عملاؤه حسب المناطق.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const repId = Number(id);
    const rep = await db.salesRep.findUnique({ where: { id: repId } });
    if (!rep) return NextResponse.json({ error: "المندوب غير موجود" }, { status: 404 });

    const areas = (rep.areas ?? "")
      .split(/[,،]/)
      .map((a) => a.trim())
      .filter(Boolean);

    const [salesAgg, salesCount, commissions, customerCount] = await Promise.all([
      db.invoice.aggregate({
        _sum: { totalBase: true },
        where: { salesRepId: repId, docType: "sale", status: "completed" },
      }),
      db.invoice.count({ where: { salesRepId: repId, docType: "sale", status: "completed" } }),
      db.commission.findMany({
        where: { salesRepId: repId },
        orderBy: { id: "desc" },
        take: 50,
        select: {
          id: true,
          refType: true,
          refId: true,
          baseAmount: true,
          percent: true,
          amount: true,
          status: true,
          createdAt: true,
        },
      }),
      areas.length
        ? db.customer.count({ where: { isArchived: false, area: { in: areas } } })
        : Promise.resolve(0),
    ]);

    const dueTotal = commissions.filter((c) => c.status === "due").reduce((s, c) => s + c.amount, 0);
    const paidTotal = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);

    // أسماء العملاء المسندين حسب المناطق (حتى 30)
    const customers = areas.length
      ? await db.customer.findMany({
          where: { isArchived: false, area: { in: areas } },
          orderBy: { name: "asc" },
          take: 30,
          select: { id: true, name: true, phone: true, area: true },
        })
      : [];

    return NextResponse.json({
      rep: {
        id: rep.id,
        name: rep.name,
        phone: rep.phone,
        commissionType: rep.commissionType,
        commissionPercent: rep.commissionPercent,
        areas,
        isArchived: rep.isArchived,
      },
      stats: {
        salesTotalBase: round4(salesAgg._sum.totalBase ?? 0),
        salesCount,
        commissionDue: round4(dueTotal),
        commissionPaid: round4(paidTotal),
        customersCount: customerCount,
      },
      commissions: commissions.map((c) => ({
        id: c.id,
        refType: c.refType,
        refId: c.refId,
        baseAmount: c.baseAmount,
        percent: c.percent,
        amount: c.amount,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
      })),
      customers,
    });
  } catch (e) {
    console.error("GET /api/parties/reps/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل ملف المندوب" }, { status: 500 });
  }
}
