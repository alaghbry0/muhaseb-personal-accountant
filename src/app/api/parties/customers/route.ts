import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeCustomerBalance } from "@/domain/invoice-save";
import type { CustomerListResponse } from "@/domain/dto";

export const dynamic = "force-dynamic";

/**
 * GET /api/parties/customers?q=&limit=100 — قائمة العملاء للـ POS
 * مع الرصيد الحالي (مدين موجب). (Task 3-b يبني CRUD كاملاً — هذه قائمة قراءة فقط.)
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const limit = Math.min(300, Math.max(1, Number(sp.get("limit") ?? 100) || 100));

    const where = q
      ? { isArchived: false, OR: [{ name: { contains: q } }, { phone: { contains: q } }] }
      : { isArchived: false };

    const rows = await db.customer.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
    });

    const customers = await Promise.all(
      rows.map(async (c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        whatsapp: c.whatsapp,
        area: c.area,
        creditLimit: c.creditLimit,
        balance: await computeCustomerBalance(db, c.id),
      }))
    );

    const data: CustomerListResponse = { customers };
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/parties/customers error:", e);
    return NextResponse.json({ error: "تعذر تحميل العملاء" }, { status: 500 });
  }
}
