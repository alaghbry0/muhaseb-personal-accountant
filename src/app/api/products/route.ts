import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveProduct, DomainError, type SaveProductPayload } from "@/domain/inventory";
import { logAudit } from "@/domain/audit";
import type { ProductSearchItemDto } from "@/domain/dto";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/products — قائمة الأصناف (شاشة الأصناف المتوفرة).
 * ?q= بحث بالاسم/الباركود &categoryId= &warehouseId= (أصناف لها رصيد بالمخزن)
 * &lowStock=1 (تحت الحد الأدنى فقط) &page= (صفحة 30) + إحصائيات الرأس.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() ?? "";
    const categoryId = sp.get("categoryId");
    const warehouseId = sp.get("warehouseId");
    const lowStock = sp.get("lowStock") === "1";
    const archived = sp.get("archived") === "1";
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 30) || 30));

    const where: Prisma.ProductWhereInput = { isArchived: archived };
    if (q) where.OR = [{ name: { contains: q } }, { barcode: { contains: q } }];
    if (categoryId) where.categoryId = Number(categoryId);
    if (warehouseId) {
      where.stockLevels = { some: { warehouseId: Number(warehouseId) } };
    }

    const [total, rows] = await Promise.all([
      db.product.count({ where }),
      db.product.findMany({
        where,
        orderBy: { id: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          prices: { include: { currency: { select: { code: true } } } },
          stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
          unit: { select: { name: true } },
          category: { select: { id: true, name: true } },
        },
      }),
    ]);

    let products: ProductSearchItemDto[] = rows.map((p) => {
      const prices: Record<string, number> = {};
      for (const pr of p.prices) prices[pr.currency.code] = pr.price;
      const stockByWarehouse = p.stockLevels.map((s) => ({
        warehouseId: s.warehouse.id,
        name: s.warehouse.name,
        qty: s.qty,
      }));
      const totalStock = stockByWarehouse.reduce((sum, s) => sum + s.qty, 0);
      return {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        unitName: p.unit?.name ?? null,
        categoryId: p.category?.id ?? null,
        categoryName: p.category?.name ?? null,
        costPrice: p.costPrice,
        minStock: p.minStock,
        prices,
        totalStock,
        stockByWarehouse,
        isLowStock: totalStock < p.minStock,
      };
    });
    if (lowStock) products = products.filter((p) => p.isLowStock);

    // إحصائيات الرأس: عدد الأصناف + قيمة المخزون بالتكلفة (بالعملة الأساسية)
    const [countAgg, allForValue] = await Promise.all([
      db.product.count({ where: { isArchived: false } }),
      db.product.findMany({
        where: { isArchived: false },
        select: {
          costPrice: true,
          minStock: true,
          stockLevels: { select: { qty: true } },
        },
      }),
    ]);
    let stockValue = 0;
    let lowStockCount = 0;
    for (const p of allForValue) {
      const totalQty = p.stockLevels.reduce((s, l) => s + l.qty, 0);
      stockValue += totalQty * p.costPrice;
      if (totalQty < p.minStock) lowStockCount++;
    }

    return NextResponse.json({
      products,
      total: lowStock ? products.length : total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
      stats: {
        productsCount: countAgg,
        stockValueBase: Math.round(stockValue * 10000) / 10000,
        lowStockCount,
      },
    });
  } catch (e) {
    console.error("GET /api/products error:", e);
    return NextResponse.json({ error: "تعذر تحميل الأصناف" }, { status: 500 });
  }
}

/**
 * POST /api/products — إنشاء صنف (FR-01-01/02):
 * { name, barcode?, categoryId?, unitId?, costPrice?, minStock?, notes?,
 *   prices: { YER, SAR, USD }, openingQty?, openingWarehouseId? }
 * الباركود الفارغ → توليد EAN-13 تلقائي. الافتتاحي → حركة opening + رصيد.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const result = await saveProduct(db, body as unknown as SaveProductPayload);
    await logAudit(db, { action: "product_create", entity: "product", entityId: result.productId, details: { name: String(body.name ?? ""), barcode: result.barcode } });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/products error:", e);
    return NextResponse.json({ error: "تعذر حفظ الصنف" }, { status: 500 });
  }
}
