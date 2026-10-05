import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DomainError } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/** PATCH /api/warehouses/[id] — تعديل/أرشفة/تعيين افتراضي (يلغي السابق). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const whId = Number(id);
    const body = (await req.json()) as Record<string, unknown>;
    const existing = await db.warehouse.findUnique({ where: { id: whId } });
    if (!existing) throw new DomainError("المخزن غير موجود", 404);

    const data: Record<string, unknown> = {};
    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name) throw new DomainError("اسم المخزن إلزامي");
      data.name = name;
    }
    if (body.location != null) data.location = body.location ? String(body.location) : null;
    if (body.isArchived != null) {
      if (Boolean(body.isArchived) && existing.isDefault) {
        throw new DomainError("لا يمكن أرشفة المخزن الافتراضي — عيّن مخزناً افتراضياً آخر أولاً")
      }
      data.isArchived = Boolean(body.isArchived);
    }
    if (body.isDefault != null && Boolean(body.isDefault)) data.isDefault = true;

    const updated = await db.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await tx.warehouse.updateMany({ data: { isDefault: false } });
      }
      return tx.warehouse.update({ where: { id: whId }, data });
    });
    return NextResponse.json({ warehouse: updated });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("PATCH /api/warehouses/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل المخزن" }, { status: 500 });
  }
}

/** DELETE /api/warehouses/[id] — محظور إذا كان افتراضياً أو له حركات/فواتير/أرصدة. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const whId = Number(id);
    const wh = await db.warehouse.findUnique({
      where: { id: whId },
      include: {
        _count: { select: { stockMovements: true, invoices: true, stocktakes: true } },
      },
    });
    if (!wh) throw new DomainError("المخزن غير موجود", 404);
    if (wh.isDefault) throw new DomainError("لا يمكن حذف المخزن الافتراضي");
    if (wh._count.stockMovements > 0 || wh._count.invoices > 0 || wh._count.stocktakes > 0) {
      throw new DomainError("لا يمكن حذف مخزن له حركات أو فواتير — أرشفه بدلاً من ذلك")
    }
    const levels = await db.stockLevel.count({ where: { warehouseId: whId, qty: { gt: 0 } } });
    if (levels > 0) throw new DomainError("لا يمكن حذف مخزن به أرصدة أصناف")
    await db.stockLevel.deleteMany({ where: { warehouseId: whId } });
    await db.warehouse.delete({ where: { id: whId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("DELETE /api/warehouses/[id] error:", e);
    return NextResponse.json({ error: "تعذر حذف المخزن" }, { status: 500 });
  }
}
