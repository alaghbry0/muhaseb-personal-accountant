import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { ProductSearchResponse, ProductSearchItemDto } from "@/domain/dto";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/search — بحث فوري للأصناف (شاشة البيع).
 * ?q= بالاسم أو الباركود (تطابق الباركود الكامل أولاً) | ?ids=1,2,3 جلب مباشر
 * ?categoryId= فلترة. LIMIT 20. يشمل أسعار كل العملات + الرصيد الكلي ولكل مخزن + التكلفة.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim() ?? "";
    const categoryId = sp.get("categoryId");
    const idsParam = sp.get("ids");
    const limit = Math.min(50, Math.max(1, Number(sp.get("limit") ?? 20) || 20));

    const where: Record<string, unknown> = { isArchived: false };
    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      where.id = { in: ids };
    } else if (q) {
      where.OR = [{ name: { contains: q } }, { barcode: { contains: q } }];
    }
    if (categoryId) where.categoryId = Number(categoryId);

    const [rows, categories] = await Promise.all([
      db.product.findMany({
        where,
        take: limit,
        include: {
          prices: { include: { currency: { select: { code: true } } } },
          stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
          unit: { select: { name: true } },
          category: { select: { id: true, name: true } },
        },
      }),
      db.category.findMany({
        where: { isArchived: false },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    // تطابق الباركود الكامل أولاً
    if (q) {
      rows.sort((a, b) => {
        const aExact = a.barcode === q ? 1 : 0;
        const bExact = b.barcode === q ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        return a.id - b.id;
      });
    }

    const products: ProductSearchItemDto[] = rows.map((p) => {
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

    const data: ProductSearchResponse = { products, categories };
    return NextResponse.json(data);
  } catch (e) {
    console.error("products/search error:", e);
    return NextResponse.json({ error: "تعذر البحث في الأصناف" }, { status: 500 });
  }
}
