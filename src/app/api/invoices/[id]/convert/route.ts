import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { convertHeldInvoice, DomainError } from "@/domain/invoice-save";
import { fetchInvoiceDetail } from "@/domain/dto";
import { logAudit } from "@/domain/audit";

export const dynamic = "force-dynamic";

/**
 * POST /api/invoices/[id]/convert — إتمام فاتورة معلّقة (draft → completed)
 * بنفس الأثر الذرّي: مخزون + صندوق + عمولة. لا إلغاء بعد الحفظ (FR-02-15).
 * body: { payMode: 'cash'|'credit'|'mixed', paidAmount?, cashboxId? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      payMode?: "cash" | "credit" | "mixed";
      paidAmount?: number | null;
      cashboxId?: number | null;
    };
    const invoiceId = await convertHeldInvoice(db, Number(id), {
      payMode: body.payMode ?? "cash",
      paidAmount: body.paidAmount ?? null,
      cashboxId: body.cashboxId ?? null,
    });
    const invoice = await fetchInvoiceDetail(db, invoiceId);
    await logAudit(db, { action: "invoice_convert_held", entity: "invoice", entityId: invoiceId, details: { invoiceNo: invoice.invoiceNo, payMode: body.payMode, total: invoice.total } });
    return NextResponse.json({ invoice });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("convert invoice error:", e);
    return NextResponse.json({ error: "تعذر إتمام الفاتورة" }, { status: 500 });
  }
}
