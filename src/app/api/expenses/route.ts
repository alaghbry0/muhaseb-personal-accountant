import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveCashTx } from "@/domain/cash";
import { expensesByCategory, parsePeriod } from "@/domain/reports";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/expenses?from=&to=&categoryId=&q=&page=
 * المصروفات = حركات cash_tx نوع expense — تقرير الفترة + القائمة.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const period = parsePeriod(sp.get("from"), sp.get("to"));
    const report = await expensesByCategory(db, period);

    const categoryId = sp.get("categoryId") ? Number(sp.get("categoryId")) : null;
    const q = (sp.get("q") || "").trim();
    let rows = report.rows;
    if (categoryId) {
      const cat = report.byCategory.find((c) => c.id === categoryId)
      rows = cat ? rows.filter((r) => r.categoryName === cat.name) : []
    }
    if (q) rows = rows.filter((r) => (r.description ?? "").includes(q) || r.categoryName.includes(q));

    return NextResponse.json({
      period: report.period,
      baseCurrency: report.baseCurrency,
      total: report.total,
      prevTotal: report.prevTotal,
      changePct: report.changePct,
      count: report.count,
      byCategory: report.byCategory,
      series: report.series,
      rows,
    });
  } catch (e) {
    console.error("GET /api/expenses error:", e);
    return NextResponse.json({ error: "تعذر تحميل المصروفات" }, { status: 500 });
  }
}

/**
 * POST /api/expenses — تسجيل مصروف (FR-04-05): حركة expense عبر saveCashTx.
 * Body: { cashboxId, amount, expenseCategoryId, txDate?, description?, currencyId?, exchangeRate? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.expenseCategoryId) {
      return NextResponse.json({ error: "اختر فئة المصروف" }, { status: 400 });
    }
    if (!body.cashboxId) {
      return NextResponse.json({ error: "اختر الصندوق" }, { status: 400 });
    }
    const result = await saveCashTx(db, {
      txType: "expense",
      cashboxId: Number(body.cashboxId),
      amount: Number(body.amount),
      currencyId: body.currencyId != null ? Number(body.currencyId) : null,
      exchangeRate: body.exchangeRate != null ? Number(body.exchangeRate) : null,
      expenseCategoryId: Number(body.expenseCategoryId),
      txDate: body.txDate || undefined,
      description: body.description || null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/expenses error:", e);
    return NextResponse.json({ error: "تعذر حفظ المصروف" }, { status: 500 });
  }
}
