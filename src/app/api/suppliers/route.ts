import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeSupplierBalance } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/**
 * GET /api/suppliers — قائمة موردون للقراءة (لشاشة فاتورة الشراء — Task 3-a).
 * ?q= &limit=100. الرصيد دائن موجب (مستحق له) — يشمل مرتجعات الشراء.
 * (CRUD الموردين الكامل مسؤولية Task 3-b عبر /api/parties — هذا مسار قراءة فقط.)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));

    const where = q
      ? { isArchived: false, OR: [{ name: { contains: q } }, { phone: { contains: q } }] }
      : { isArchived: false };

    const suppliers = await db.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      take: limit,
    });

    const withBalance = await Promise.all(
      suppliers.map(async (s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        address: s.address,
        balance: await computeSupplierBalance(db, s.id),
      }))
    );

    return NextResponse.json({ suppliers: withBalance });
  } catch (e) {
    console.error("GET /api/suppliers error:", e);
    return NextResponse.json({ error: "تعذر تحميل الموردين" }, { status: 500 });
  }
}
