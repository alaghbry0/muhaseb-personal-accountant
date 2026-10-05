import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveProduct, DomainError, generateEan13 } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/[id] — بطاقة صنف: بيانات + أسعار كل عملة + الرصيد لكل مخزن
 * + آخر 10 حركات + مبيعات آخر 30 يوماً (تقريبية) + باركود مقترح (للتوليد).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = Number(id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
    }
    const product = await db.product.findUnique({
      where: { id: productId },
      include: {
        prices: { include: { currency: { select: { code: true } } } },
        stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
        unit: { select: { id: true, name: true, factor: true } },
        category: { select: { id: true, name: true } },
      },
    });
    if (!product) {
      return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 });
    }

    const movements = await db.stockMovement.findMany({
      where: { productId },
      orderBy: [{ movedAt: "desc" }, { id: "desc" }],
      take: 10,
      include: { warehouse: { select: { name: true } } },
    });

    // مبيعات آخر 30 يوماً (بوحدة الأساس) — إحصائية تقريبية
    const day = new Date();
    day.setDate(day.getDate() - 30);
    const from = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const soldAgg = await db.stockMovement.aggregate({
      _sum: { qty: true },
      where: { productId, movementType: "sale", movedAt: { gte: from } },
    });

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        categoryId: product.category?.id ?? null,
        categoryName: product.category?.name ?? null,
        unitId: product.unit?.id ?? null,
        unitName: product.unit?.name ?? null,
        costPrice: product.costPrice,
        minStock: product.minStock,
        notes: product.notes,
        isArchived: product.isArchived,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
        prices: product.prices.map((pr) => ({
          currencyId: pr.currencyId,
          code: pr.currency.code,
          price: pr.price,
        })),
        stockByWarehouse: product.stockLevels.map((s) => ({
          warehouseId: s.warehouse.id,
          name: s.warehouse.name,
          qty: s.qty,
        })),
      },
      totalStock: product.stockLevels.reduce((sum, s) => sum + s.qty, 0),
      isLowStock:
        product.stockLevels.reduce((sum, s) => sum + s.qty, 0) < product.minStock,
      soldLast30: Math.abs(soldAgg._sum.qty ?? 0),
      movements: movements.map((m) => ({
        id: m.id,
        movedAt: m.movedAt,
        createdAt: m.createdAt.toISOString(),
        movementType: m.movementType,
        qty: m.qty,
        unitCost: m.unitCost,
        warehouseName: m.warehouse.name,
        refType: m.refType,
        refId: m.refId,
        notes: m.notes,
      })),
      suggestedBarcode: generateEan13(Date.now()),
    });
  } catch (e) {
    console.error("GET /api/products/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل الصنف" }, { status: 500 });
  }
}

/**
 * PATCH /api/products/[id] — تعديل صنف (حقول + أسعار) أو أرشفة/استعادة
 * (FR-01-15: منع الحذف لصنف له حركات — الأرشفة هي البديل).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = Number(id);
    const body = (await req.json()) as Record<string, unknown>;
    const result = await saveProduct(db, {
      ...(body as object),
      id: productId,
    } as Parameters<typeof saveProduct>[1]);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("PATCH /api/products/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل الصنف" }, { status: 500 });
  }
}

/**
 * DELETE /api/products/[id] — محظور لصنف له حركات مخزون (FR-01-15) →
 * 400 مع توصية الأرشفة. صنف بلا حركات (خطأ إدخال) يُحذف مع أسعاره وأرصدته.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const productId = Number(id);
    const product = await db.product.findUnique({
      where: { id: productId },
      include: { _count: { select: { stockMovements: true, invoiceItems: true } } },
    });
    if (!product) return NextResponse.json({ error: "الصنف غير موجود" }, { status: 404 });
    if (product._count.stockMovements > 0 || product._count.invoiceItems > 0) {
      return NextResponse.json(
        {
          error:
            "لا يمكن حذف صنف له حركات مخزون — أرشفه بدلاً من ذلك (يختفي من القوائم ويبقى في التقارير)",
        },
        { status: 400 }
      );
    }
    await db.stockLevel.deleteMany({ where: { productId } });
    await db.productPrice.deleteMany({ where: { productId } });
    await db.product.delete({ where: { id: productId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/products/[id] error:", e);
    return NextResponse.json({ error: "تعذر حذف الصنف" }, { status: 500 });
  }
}
