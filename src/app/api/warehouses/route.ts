import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DomainError } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/** GET /api/warehouses — المخازن (تشمل المؤرشفة بعلمها) مع عدد الأصناف ذات الرصيد. */
export async function GET() {
  try {
    const rows = await db.warehouse.findMany({
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      include: {
        stockLevels: { where: { qty: { gt: 0 } }, select: { qty: true } },
      },
    });
    return NextResponse.json({
      warehouses: rows.map((w) => ({
        id: w.id,
        name: w.name,
        location: w.location,
        isDefault: w.isDefault,
        isArchived: w.isArchived,
        productsCount: w.stockLevels.length,
        totalQty: w.stockLevels.reduce((s, l) => s + l.qty, 0),
      })),
    });
  } catch (e) {
    console.error("GET /api/warehouses error:", e);
    return NextResponse.json({ error: "تعذر تحميل المخازن" }, { status: 500 });
  }
}

/** POST /api/warehouses — { name, location?, isDefault? } — الافتراضي يلغي السابق. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) throw new DomainError("اسم المخزن إلزامي");
    const isDefault = Boolean(body.isDefault);
    const created = await db.$transaction(async (tx) => {
      if (isDefault) {
        await tx.warehouse.updateMany({ data: { isDefault: false } });
      }
      return tx.warehouse.create({
        data: {
          name,
          location: body.location ? String(body.location) : null,
          isDefault,
        },
      });
    });
    return NextResponse.json({ warehouse: created }, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/warehouses error:", e);
    return NextResponse.json({ error: "تعذر حفظ المخزن" }, { status: 500 });
  }
}
