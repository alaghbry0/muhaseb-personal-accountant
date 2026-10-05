import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { commitPayroll } from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * POST /api/payroll/commit — صرف المسير (FR-07-04): اعتماد بنود الشهر
 * (إعادة حساب الغياب/التأخير/السحبيات لحظة الصرف) + cash_tx(salary_batch) لكل موظف
 * من الصندوق المحدد → status=paid. ذرّي بالكامل.
 * Body: { period, lines?: [{ employeeId, bonus?, otherDeduction? }],
 *         cashboxId, currencyId?, exchangeRate?, txDate }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const period = String(body.period ?? "");
    if (!period) {
      return NextResponse.json({ error: "حدد الشهر بصيغة YYYY-MM" }, { status: 400 });
    }
    if (!body.cashboxId) {
      return NextResponse.json({ error: "اختر صندوق صرف الرواتب" }, { status: 400 });
    }
    const lines = Array.isArray(body.lines)
      ? body.lines.map((l: { employeeId: number; bonus?: number; otherDeduction?: number }) => ({
          employeeId: Number(l.employeeId),
          bonus: l.bonus != null ? Number(l.bonus) : undefined,
          otherDeduction: l.otherDeduction != null ? Number(l.otherDeduction) : undefined,
        }))
      : undefined;
    const result = await commitPayroll(db, {
      period,
      lines,
      cashboxId: Number(body.cashboxId),
      currencyId: body.currencyId != null ? Number(body.currencyId) : null,
      exchangeRate: body.exchangeRate != null ? Number(body.exchangeRate) : null,
      txDate: String(body.txDate ?? ""),
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/payroll/commit error:", e);
    return NextResponse.json({ error: "تعذر صرف المسير" }, { status: 500 });
  }
}
