import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payCommission } from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * POST /api/reps/[id]/pay-commissions — صرف عمولات المندوب من صندوق (FR-06-03):
 * تعليم العمولات المستحقة «مدفوعة» + cash_tx(commission_payout). ذرّي.
 * Body: { commissionIds?: number[] (المحددة) | all: true (كل المستحق),
 *         cashboxId, currencyId?, exchangeRate?, txDate }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const result = await payCommission(db, {
      repId: Number(id),
      commissionIds: Array.isArray(body.commissionIds)
        ? body.commissionIds.map((n: unknown) => Number(n))
        : undefined,
      all: Boolean(body.all),
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
    console.error("POST /api/reps/[id]/pay-commissions error:", e);
    return NextResponse.json({ error: "تعذر صرف العمولات" }, { status: 500 });
  }
}
