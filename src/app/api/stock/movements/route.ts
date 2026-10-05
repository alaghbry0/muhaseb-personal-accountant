import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase: "شراء",
  sale: "بيع",
  sale_return: "مرتجع بيع",
  purchase_return: "مرتجع شراء",
  adjustment: "جرد",
  transfer_in: "تحويل وارد",
  transfer_out: "تحويل صادر",
  opening: "افتتاحي",
};

/**
 * GET /api/stock/movements — سجل الحركات العام (FR-01-07):
 * ?productId=&warehouseId=&type=purchase|sale|sale_return|purchase_return|adjustment|transfer|opening
 * &from=&to=&page= (صفحة 30) — type=transfer تجمع transfer_in/transfer_out.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const productId = sp.get("productId");
    const warehouseId = sp.get("warehouseId");
    const type = sp.get("type");
    const from = sp.get("from");
    const to = sp.get("to");
    const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
    const pageSize = 30;

    const where: Prisma.StockMovementWhereInput = {};
    if (productId) where.productId = Number(productId);
    if (warehouseId) where.warehouseId = Number(warehouseId);
    if (type) {
      where.movementType =
        type === "transfer" ? { in: ["transfer_in", "transfer_out"] } : type;
    }
    if (from || to) {
      where.movedAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      db.stockMovement.count({ where }),
      db.stockMovement.findMany({
        where,
        orderBy: [{ movedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          product: { select: { id: true, name: true } },
          warehouse: { select: { name: true } },
        },
      }),
    ]);

    const invoiceIds = [
      ...new Set(rows.filter((r) => r.refType === "invoice").map((r) => r.refId!)),
    ];
    const invoices =
      invoiceIds.length > 0
        ? await db.invoice.findMany({
            where: { id: { in: invoiceIds } },
            select: { id: true, invoiceNo: true },
          })
        : [];
    const invMap = new Map(invoices.map((i) => [i.id, i.invoiceNo]));

    return NextResponse.json({
      movements: rows.map((m) => ({
        id: m.id,
        movedAt: m.movedAt,
        createdAt: m.createdAt.toISOString(),
        movementType: m.movementType,
        typeLabel: MOVEMENT_TYPE_LABELS[m.movementType] ?? m.movementType,
        qty: m.qty,
        unitCost: m.unitCost,
        productId: m.productId,
        productName: m.product.name,
        warehouseName: m.warehouse.name,
        refType: m.refType,
        refNo: m.refType === "invoice" ? invMap.get(m.refId!) ?? null : null,
        notes: m.notes,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e) {
    console.error("GET /api/stock/movements error:", e);
    return NextResponse.json({ error: "تعذر تحميل سجل الحركات" }, { status: 500 });
  }
}
