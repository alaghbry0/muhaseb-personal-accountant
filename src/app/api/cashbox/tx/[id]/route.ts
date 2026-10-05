import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCashTx, updateCashTx, deleteCashTx } from "@/domain/cash";
import { DomainError } from "@/domain/invoice-save";
import { logAudit } from "@/domain/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/cashbox/tx/[id] — تفاصيل حركة واحدة (FR-04-08).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tx = await getCashTx(db, Number(id));
    if (!tx) {
      return NextResponse.json({ error: "الحركة غير موجودة" }, { status: 404 });
    }
    return NextResponse.json({ tx });
  } catch (e) {
    console.error("GET /api/cashbox/tx/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل الحركة" }, { status: 500 });
  }
}

/**
 * PATCH /api/cashbox/tx/[id] — تعديل حركة يدوية (FR-04-08).
 * Body: { amount?, txDate?, description? } — المرتبطة بمستند ممنوعة (refType ≠ null)
 * وحارس الرصيد يحاكي الأثر قبل الكتابة.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const result = await updateCashTx(db, Number(id), {
      amount: body.amount !== undefined ? Number(body.amount) : undefined,
      txDate: body.txDate !== undefined ? String(body.txDate) : undefined,
      description: body.description === undefined ? undefined : body.description || null,
    });
    await logAudit(db, {
      action: "تعديل حركة صندوق",
      entity: "cash_tx",
      entityId: Number(id),
      details: {
        txType: result.tx.txType,
        amount: result.tx.amount,
        txDate: result.tx.txDate,
        cashboxBalance: result.cashboxBalance,
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("PATCH /api/cashbox/tx/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل الحركة" }, { status: 500 });
  }
}

/**
 * DELETE /api/cashbox/tx/[id] — حذف حركة يدوية (FR-04-08).
 * المرتبطة بمستند ممنوعة؛ حذف الواردة لا يجوز أن يُنزل الرصيد تحت الصفر.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // تفاصيل الحركة للتدقيق قبل الحذف (deleteCashTx يعيد { ok, cashboxBalance } فقط)
    const existing = await getCashTx(db, Number(id));
    if (!existing) {
      return NextResponse.json({ error: "الحركة غير موجودة" }, { status: 404 });
    }
    const result = await deleteCashTx(db, Number(id));
    await logAudit(db, {
      action: "حذف حركة صندوق",
      entity: "cash_tx",
      entityId: Number(id),
      details: {
        txType: existing.txType,
        amount: existing.amount,
        txDate: existing.txDate,
        cashboxName: existing.cashboxName,
        cashboxBalance: result.cashboxBalance,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("DELETE /api/cashbox/tx/[id] error:", e);
    return NextResponse.json({ error: "تعذر حذف الحركة" }, { status: 500 });
  }
}
