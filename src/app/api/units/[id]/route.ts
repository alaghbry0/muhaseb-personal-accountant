import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DomainError } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/** PATCH /api/units/[id] — تعديل/أرشفة وحدة. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const unitId = Number(id);
    const body = (await req.json()) as Record<string, unknown>;
    const existing = await db.unit.findUnique({ where: { id: unitId } });
    if (!existing) throw new DomainError("الوحدة غير موجودة", 404);

    const data: Record<string, unknown> = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name) throw new DomainError("اسم الوحدة إلزامي");
      data.name = name;
    }
    if (body.factor != null) {
      const factor = Number(body.factor)
      if (!(factor > 0)) throw new DomainError("معامل التحويل يجب أن يكون أكبر من صفر")
      data.factor = factor
    }
    if (body.isArchived != null) data.isArchived = Boolean(body.isArchived);

    const updated = await db.unit.update({ where: { id: unitId }, data });
    return NextResponse.json({ unit: updated });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("PATCH /api/units/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل الوحدة" }, { status: 500 });
  }
}

/** DELETE /api/units/[id] — محظور إذا استخدمها صنف أو بند فاتورة. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const unitId = Number(id);
    const unit = await db.unit.findUnique({
      where: { id: unitId },
      include: { _count: { select: { products: true, invoiceItems: true, children: true } } },
    });
    if (!unit) throw new DomainError("الوحدة غير موجودة", 404);
    if (unit._count.products > 0 || unit._count.invoiceItems > 0) {
      throw new DomainError("لا يمكن حذف وحدة مستخدمة في أصناف أو فواتير — أرشفها بدلاً من ذلك")
    }
    if (unit._count.children > 0) {
      throw new DomainError("لا يمكن حذف وحدة لها وحدات فرعية")
    }
    await db.unit.delete({ where: { id: unitId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("DELETE /api/units/[id] error:", e);
    return NextResponse.json({ error: "تعذر حذف الوحدة" }, { status: 500 });
  }
}
