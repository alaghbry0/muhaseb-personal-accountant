import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { TopProductsResponse, TopProductDto } from "@/domain/dto";

export const dynamic = "force-dynamic";

/**
 * GET /api/products/top — الأصناف الأكثر مبيعاً (رقاقة الإضافة السريعة في POS).
 * ?limit=8 ?days=30 — تجميع كميات بنود فواتير البيع المكتملة خلال الفترة
 * (groupBy على productId ثم جلب بيانات الأصناف ودمجها — بلا المؤرشفة).
 * البنية مطابقة لـ ProductSearchItemDto + qtySold لتغذية addProduct مباشرة.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(20, Math.max(1, Number(sp.get("limit") ?? 8) || 8));
    const days = Math.min(365, Math.max(1, Number(sp.get("days") ?? 30) || 30));

    // issuedAt مخزّن YYYY-MM-DD — مقارنة نصية معجمية آمنة مع ISO
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

    // تجميع الكميات المباعة (هامش ×3 لأن take قبل فلترة المؤرشفة)
    const grouped = await db.invoiceItem.groupBy({
      by: ["productId"],
      _sum: { qty: true },
      where: {
        invoice: { docType: "sale", status: "completed", issuedAt: { gte: from } },
      },
      orderBy: { _sum: { qty: "desc" } },
      take: limit * 3,
    });

    if (grouped.length === 0) {
      const empty: TopProductsResponse = { products: [] };
      return NextResponse.json(empty);
    }

    const qtyById = new Map(grouped.map((g) => [g.productId, g._sum.qty ?? 0]));
    const rows = await db.product.findMany({
      where: { id: { in: [...qtyById.keys()] }, isArchived: false },
      include: {
        prices: { include: { currency: { select: { code: true } } } },
        stockLevels: { include: { warehouse: { select: { id: true, name: true } } } },
        unit: { select: { name: true } },
        category: { select: { id: true, name: true } },
      },
    });

    // الحفاظ على ترتيب الأكثر مبيعاً + قص الحد المطلوب
    const byId = new Map(rows.map((p) => [p.id, p]));
    const products: TopProductDto[] = grouped
      .map((g) => byId.get(g.productId))
      .filter((p) => p != null)
      .slice(0, limit)
      .map((p) => {
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
          qtySold: qtyById.get(p.id) ?? 0,
        };
      });

    const data: TopProductsResponse = { products };
    return NextResponse.json(data);
  } catch (e) {
    console.error("products/top error:", e);
    return NextResponse.json({ error: "تعذر جلب الأصناف الأكثر مبيعاً" }, { status: 500 });
  }
}
