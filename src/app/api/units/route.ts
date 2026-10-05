import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DomainError } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/** GET /api/units — وحدات القياس مع معامل التحويل للوحدة الأساس (FR-01-05). */
export async function GET() {
  try {
    const rows = await db.unit.findMany({
      orderBy: [{ id: "asc" }],
      include: {
        baseUnit: { select: { id: true, name: true } },
        _count: { select: { products: { where: { isArchived: false } } } },
      },
    });
    return NextResponse.json({
      units: rows.map((u) => ({
        id: u.id,
        name: u.name,
        baseUnitId: u.baseUnitId,
        baseUnitName: u.baseUnit?.name ?? null,
        factor: u.factor,
        isArchived: u.isArchived,
        productsCount: u._count.products,
      })),
    });
  } catch (e) {
    console.error("GET /api/units error:", e);
    return NextResponse.json({ error: "تعذر تحميل الوحدات" }, { status: 500 });
  }
}

/** POST /api/units — { name, baseUnitId?, factor? } (كرتون ×24 قطعة) */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) throw new DomainError("اسم الوحدة إلزامي");
    let baseUnitId: number | null = null
    let factor = 1
    if (body.baseUnitId) {
      const base = await db.unit.findUnique({ where: { id: Number(body.baseUnitId) } });
      if (!base) throw new DomainError("الوحدة الأساس غير موجودة");
      baseUnitId = base.id
      factor = Number(body.factor ?? 1)
      if (!(factor > 0)) throw new DomainError("معامل التحويل يجب أن يكون أكبر من صفر")
    }
    const created = await db.unit.create({ data: { name, baseUnitId, factor } });
    return NextResponse.json({ unit: created }, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/units error:", e);
    return NextResponse.json({ error: "تعذر حفظ الوحدة" }, { status: 500 });
  }
}
