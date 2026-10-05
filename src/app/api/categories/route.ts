import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DomainError } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/** GET /api/categories — الفئات (مع عدد أصناف نشطة، تشمل المؤرشفة بعلم isArchived). */
export async function GET() {
  try {
    const rows = await db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: {
        _count: { select: { products: { where: { isArchived: false } } } },
        parent: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({
      categories: rows.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        parentName: c.parent?.name ?? null,
        sortOrder: c.sortOrder,
        isArchived: c.isArchived,
        productsCount: c._count.products,
      })),
    });
  } catch (e) {
    console.error("GET /api/categories error:", e);
    return NextResponse.json({ error: "تعذر تحميل الفئات" }, { status: 500 });
  }
}

/** POST /api/categories — { name, parentId?, sortOrder? } */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) throw new DomainError("اسم الفئة إلزامي");
    if (body.parentId) {
      const parent = await db.category.findUnique({ where: { id: Number(body.parentId) } });
      if (!parent) throw new DomainError("الفئة الأم غير موجودة");
    }
    const created = await db.category.create({
      data: {
        name,
        parentId: body.parentId ? Number(body.parentId) : null,
        sortOrder: Number(body.sortOrder ?? 0) || 0,
      },
    });
    return NextResponse.json({ category: created }, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/categories error:", e);
    return NextResponse.json({ error: "تعذر حفظ الفئة" }, { status: 500 });
  }
}
