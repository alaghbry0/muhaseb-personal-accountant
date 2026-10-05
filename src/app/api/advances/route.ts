import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveAdvance, listAdvances } from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/advances?employeeId=&from=&to=&limit= — سجل السحبيات
 * + balances: رصيد السحبيات غير المخصومة لكل موظف نشط (تُخصم من مسير الشهر الحالي).
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const data = await listAdvances(db, {
      employeeId: sp.get("employeeId") ? Number(sp.get("employeeId")) : undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/advances error:", e);
    return NextResponse.json({ error: "تعذر تحميل السحبيات" }, { status: 500 });
  }
}

/**
 * POST /api/advances — صرف سحبية من صندوق (FR-07-03): cash_tx(employee_advance)
 * تُخصم تلقائياً من مسير راتب الشهر عند توليده/صرفه.
 * Body: { employeeId, amount, cashboxId, currencyId?, exchangeRate?, txDate, description? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await saveAdvance(db, {
      employeeId: Number(body.employeeId),
      amount: Number(body.amount),
      cashboxId: Number(body.cashboxId),
      currencyId: body.currencyId != null ? Number(body.currencyId) : null,
      exchangeRate: body.exchangeRate != null ? Number(body.exchangeRate) : null,
      txDate: String(body.txDate ?? ""),
      description: body.description ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/advances error:", e);
    return NextResponse.json({ error: "تعذر حفظ السحبية" }, { status: 500 });
  }
}
