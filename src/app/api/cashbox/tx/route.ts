import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveCashTx, listCashTx, CASH_TX_TYPES, type CashTxType } from "@/domain/cash";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/cashbox/tx?cashboxId=&type=&from=&to=&q=&page=&limit=
 * سجل حركات الصندوق (كل الأنواع) + إجماليات داخل/خارج الفترة.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const data = await listCashTx(db, {
      cashboxId: sp.get("cashboxId") ? Number(sp.get("cashboxId")) : undefined,
      type: sp.get("type") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      q: sp.get("q") || undefined,
      page: sp.get("page") ? Number(sp.get("page")) : 1,
      limit: sp.get("limit") ? Number(sp.get("limit")) : 25,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/cashbox/tx error:", e);
    return NextResponse.json({ error: "تعذر تحميل حركات الصندوق" }, { status: 500 });
  }
}

/**
 * POST /api/cashbox/tx — حفظ حركة نقدية (FR-04-02/03).
 * Body: { txType, cashboxId, toCashboxId?, currencyId?, exchangeRate?, amount,
 *         txDate?, description?, expenseCategoryId?, employeeId?, customerId?, supplierId? }
 * القواعد: مصروف ← فئة، سحبية/رواتب ← موظف، العملة = عملة الصندوق، منع السالب.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const txType = String(body.txType ?? "") as CashTxType;
    if (!CASH_TX_TYPES.includes(txType)) {
      return NextResponse.json({ error: "نوع الحركة غير صالح" }, { status: 400 });
    }
    if (!body.cashboxId) {
      return NextResponse.json({ error: "اختر الصندوق" }, { status: 400 });
    }
    const result = await saveCashTx(db, {
      txType,
      cashboxId: Number(body.cashboxId),
      toCashboxId: body.toCashboxId != null ? Number(body.toCashboxId) : null,
      currencyId: body.currencyId != null ? Number(body.currencyId) : null,
      exchangeRate: body.exchangeRate != null ? Number(body.exchangeRate) : null,
      amount: Number(body.amount),
      txDate: body.txDate || undefined,
      description: body.description || null,
      expenseCategoryId: body.expenseCategoryId != null ? Number(body.expenseCategoryId) : null,
      employeeId: body.employeeId != null ? Number(body.employeeId) : null,
      customerId: body.customerId != null ? Number(body.customerId) : null,
      supplierId: body.supplierId != null ? Number(body.supplierId) : null,
      refType: body.refType || null,
      refId: body.refId != null ? Number(body.refId) : null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/cashbox/tx error:", e);
    return NextResponse.json({ error: "تعذر حفظ الحركة" }, { status: 500 });
  }
}
