import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard — إحصائيات الداشبورد (بالعملة الأساسية):
 * مبيعات اليوم وأرباحه وعدد فواتيره، صافي الصندوق، مقارنة بالأمس،
 * سلسلة 30 يوماً، أقساط مستحقة اليوم، أصناف تحت الحد الأدنى.
 */

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBack(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

/** حركة نقدية داخلة للصندوق */
const IN_TYPES = ["receipt", "bank_withdraw"];
/** حركة نقدية خارجة من الصندوق (box_transfer/opening محايدة) */
const OUT_TYPES = ["payment", "expense", "employee_advance", "commission_payout", "bank_deposit", "salary_batch"];

export async function GET() {
  try {
    const now = new Date();
    const today = isoDay(now);
    const yesterday = daysBack(1);
    const from30 = daysBack(29);

    const salesWhere = (day: string) => ({
      docType: "sale" as const,
      status: "completed" as const,
      issuedAt: day,
    });

    const [todayAgg, yesterdayAgg, invoiceCount, cashIn, cashOut, salesByDay, dueInstallments, stockSums, products] =
      await Promise.all([
        db.invoice.aggregate({
          _sum: { totalBase: true, costTotal: true },
          where: salesWhere(today),
        }),
        db.invoice.aggregate({
          _sum: { totalBase: true },
          where: salesWhere(yesterday),
        }),
        db.invoice.count({ where: salesWhere(today) }),
        db.cashTx.aggregate({
          _sum: { amount: true },
          where: { txDate: today, txType: { in: IN_TYPES } },
        }),
        db.cashTx.aggregate({
          _sum: { amount: true },
          where: { txDate: today, txType: { in: OUT_TYPES } },
        }),
        db.invoice.groupBy({
          by: ["issuedAt"],
          _sum: { totalBase: true },
          where: { docType: "sale", status: "completed", issuedAt: { gte: from30 } },
        }),
        db.installment.count({
          where: { dueDate: today, status: { in: ["pending", "partial", "late"] } },
        }),
        db.stockLevel.groupBy({ by: ["productId"], _sum: { qty: true } }),
        db.product.findMany({
          where: { isArchived: false },
          select: { id: true, minStock: true },
        }),
      ]);

    const todaySales = todayAgg._sum.totalBase ?? 0;
    const todayProfit = (todayAgg._sum.totalBase ?? 0) - (todayAgg._sum.costTotal ?? 0);
    const yesterdaySales = yesterdayAgg._sum.totalBase ?? 0;

    // سلسلة 30 يوماً مع تعبئة الأيام الفارغة
    const byDay = new Map(salesByDay.map((r) => [r.issuedAt, r._sum.totalBase ?? 0]));
    const last30Days: Array<{ date: string; total: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const day = daysBack(i);
      last30Days.push({ date: day, total: byDay.get(day) ?? 0 });
    }

    // أصناف تحت الحد الأدنى (إجمالي الكميات في كل المخازن)
    const stockMap = new Map(stockSums.map((s) => [s.productId, s._sum.qty ?? 0]));
    const lowStockCount = products.filter((p) => (stockMap.get(p.id) ?? 0) < p.minStock).length;

    const salesTrendPercent =
      yesterdaySales === 0 ? (todaySales > 0 ? 100 : null) : ((todaySales - yesterdaySales) / yesterdaySales) * 100;

    return NextResponse.json({
      date: today,
      todaySales: Math.round(todaySales * 100) / 100,
      yesterdaySales: Math.round(yesterdaySales * 100) / 100,
      salesTrendPercent: salesTrendPercent == null ? null : Math.round(salesTrendPercent * 10) / 10,
      todayProfit: Math.round(todayProfit * 100) / 100,
      todayInvoiceCount: invoiceCount,
      cashNet: Math.round(((cashIn._sum.amount ?? 0) - (cashOut._sum.amount ?? 0)) * 100) / 100,
      dueInstallmentsToday: dueInstallments,
      lowStockCount,
      last30Days,
    });
  } catch (e) {
    console.error("dashboard error:", e);
    return NextResponse.json({ error: "تعذر حساب إحصائيات اللوحة" }, { status: 500 });
  }
}
