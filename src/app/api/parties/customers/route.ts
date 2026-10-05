import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeCustomerBalance, type CustomerDto } from "@/domain/parties";

export const dynamic = "force-dynamic";

/**
 * GET /api/parties/customers?q=&area=&includeArchived=1&limit=100
 * قائمة العملاء بالأرصدة الحية (الدالة المرجعية computeCustomerBalance من parties.ts).
 * متوافقة مع منتقي عملاء POS (نفس الحقول الأساسية) + إحصاءات القائمة.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const area = sp.get("area")?.trim();
    const includeArchived = sp.get("includeArchived") === "1";
    const withBalances = sp.get("withBalances") !== "0"; // POS يمكنه تعطيلها لاحقاً
    const limit = Math.min(500, Math.max(1, Number(sp.get("limit") ?? 200) || 200));

    const where = {
      ...(includeArchived ? {} : { isArchived: false }),
      ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { area: { contains: q } }] } : {}),
      ...(area ? { area } : {}),
    };

    const rows = await db.customer.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
    });

    const customers: CustomerDto[] = await Promise.all(
      rows.map(async (c) => {
        const balance = withBalances ? await computeCustomerBalance(db, c.id) : 0;
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          whatsapp: c.whatsapp,
          address: c.address,
          area: c.area,
          creditLimit: c.creditLimit,
          openingBalance: c.openingBalance,
          notes: c.notes,
          isArchived: c.isArchived,
          balance,
          overLimit: c.creditLimit > 0 && balance > c.creditLimit,
        };
      })
    );

    // إحصاءات + المناطق المتاحة للفلترة
    const totalDebt = customers.reduce((s, c) => s + (c.balance > 0 ? c.balance : 0), 0);
    const allAreas = await db.customer.findMany({
      where: { isArchived: false, area: { not: null } },
      select: { area: true },
      distinct: ["area"],
      orderBy: { area: "asc" },
    });

    return NextResponse.json({
      customers,
      stats: {
        count: customers.filter((c) => !c.isArchived).length,
        totalDebt: Math.round(totalDebt * 100) / 100,
        creditors: customers.filter((c) => c.balance < -0.005).length,
        overLimit: customers.filter((c) => c.overLimit).length,
      },
      areas: allAreas.map((a) => a.area).filter((a): a is string => Boolean(a)),
    });
  } catch (e) {
    console.error("GET /api/parties/customers error:", e);
    return NextResponse.json({ error: "تعذر تحميل العملاء" }, { status: 500 });
  }
}

/**
 * POST /api/parties/customers — تسجيل عميل جديد (FR-03-01)
 * Body: { name*, phone?, whatsapp?, address?, area?, creditLimit?, openingBalance?, notes? }
 * openingBalance موجب = مدين / سالب = دائن (الواجهة ترسل القيمة الموقّعة).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "اسم العميل إلزامي" }, { status: 400 });
    if (body.creditLimit != null && !(Number(body.creditLimit) >= 0)) {
      return NextResponse.json({ error: "حد الائتمان غير صالح" }, { status: 400 });
    }
    if (body.openingBalance != null && !isFinite(Number(body.openingBalance))) {
      return NextResponse.json({ error: "الرصيد الافتتاحي غير صالح" }, { status: 400 });
    }

    const customer = await db.customer.create({
      data: {
        name,
        phone: strOrNull(body.phone),
        whatsapp: strOrNull(body.whatsapp),
        address: strOrNull(body.address),
        area: strOrNull(body.area),
        creditLimit: Math.max(0, Number(body.creditLimit ?? 0) || 0),
        openingBalance: Number(body.openingBalance ?? 0) || 0,
        notes: strOrNull(body.notes),
      },
    });

    return NextResponse.json({
      customer: {
        ...customer,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
        balance: customer.openingBalance,
        overLimit: false,
      },
    });
  } catch (e) {
    console.error("POST /api/parties/customers error:", e);
    return NextResponse.json({ error: "تعذر حفظ العميل" }, { status: 500 });
  }
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
