import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { computeSupplierBalance, type SupplierDto } from "@/domain/parties";

export const dynamic = "force-dynamic";

/** GET /api/parties/suppliers?q=&includeArchived=1 — قائمة الموردين بالأرصدة (موجب = مستحق له) */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim();
    const includeArchived = sp.get("includeArchived") === "1";
    const limit = Math.min(300, Math.max(1, Number(sp.get("limit") ?? 200) || 200));

    const rows = await db.supplier.findMany({
      where: {
        ...(includeArchived ? {} : { isArchived: false }),
        ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } : {}),
      },
      orderBy: { name: "asc" },
      take: limit,
    });

    const suppliers: SupplierDto[] = await Promise.all(
      rows.map(async (s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        address: s.address,
        openingBalance: s.openingBalance,
        notes: s.notes,
        isArchived: s.isArchived,
        balance: await computeSupplierBalance(db, s.id),
      }))
    );

    const totalDue = suppliers.reduce((t, s) => t + (s.balance > 0 ? s.balance : 0), 0);
    return NextResponse.json({
      suppliers,
      stats: {
        count: suppliers.filter((s) => !s.isArchived).length,
        totalDue: Math.round(totalDue * 100) / 100,
      },
    });
  } catch (e) {
    console.error("GET /api/parties/suppliers error:", e);
    return NextResponse.json({ error: "تعذر تحميل الموردين" }, { status: 500 });
  }
}

/** POST /api/parties/suppliers — تسجيل مورد جديد (FR-03-03) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "اسم المورد إلزامي" }, { status: 400 });
    if (body.openingBalance != null && !isFinite(Number(body.openingBalance))) {
      return NextResponse.json({ error: "الرصيد الافتتاحي غير صالح" }, { status: 400 });
    }
    const supplier = await db.supplier.create({
      data: {
        name,
        phone: strOrNull(body.phone),
        address: strOrNull(body.address),
        openingBalance: Number(body.openingBalance ?? 0) || 0,
        notes: strOrNull(body.notes),
      },
    });
    return NextResponse.json({
      supplier: {
        ...supplier,
        createdAt: supplier.createdAt.toISOString(),
        updatedAt: supplier.updatedAt.toISOString(),
        balance: supplier.openingBalance,
      },
    });
  } catch (e) {
    console.error("POST /api/parties/suppliers error:", e);
    return NextResponse.json({ error: "تعذر حفظ المورد" }, { status: 500 });
  }
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
