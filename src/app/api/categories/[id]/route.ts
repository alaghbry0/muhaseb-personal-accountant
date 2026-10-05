import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DomainError } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/** PATCH /api/categories/[id] — تعديل اسم/ترتيب أو أرشفة/استعادة. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const catId = Number(id);
    const body = (await req.json()) as Record<string, unknown>;
    const existing = await db.category.findUnique({ where: { id: catId } });
    if (!existing) throw new DomainError("الفئة غير موجودة", 404);

    const data: Record<string, unknown> = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name) throw new DomainError("اسم الفئة إلزامي");
      data.name = name;
    }
    if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder) || 0;
    if (body.isArchived != null) data.isArchived = Boolean(body.isArchived);

    const updated = await db.category.update({ where: { id: catId }, data });
    return NextResponse.json({ category: updated });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("PATCH /api/categories/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل الفئة" }, { status: 500 });
  }
}

/** DELETE /api/categories/[id] — محظور إذا كان لها أصناف أو فئات أبناء. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const catId = Number(id);
    const cat = await db.category.findUnique({
      where: { id: catId },
      include: { _count: { select: { products: true, children: true } } },
    });
    if (!cat) throw new DomainError("الفئة غير موجودة", 404);
    if (cat._count.products > 0) {
      throw new DomainError("لا يمكن حذف فئة بها أصناف — أرشفها بدلاً من ذلك");
    }
    if (cat._count.children > 0) {
      throw new DomainError("لا يمكن حذف فئة لها فئات فرعية");
    }
    await db.category.delete({ where: { id: catId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("DELETE /api/categories/[id] error:", e);
    return NextResponse.json({ error: "تعذر حذف الفئة" }, { status: 500 });
  }
}
