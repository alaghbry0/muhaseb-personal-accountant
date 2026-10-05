import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { convertQuotationToInvoice } from "@/domain/quotation";
import { DomainError } from "@/domain/invoice-save";
import { fetchInvoiceDetail } from "@/domain/dto";

export const dynamic = "force-dynamic";

/**
 * POST /api/quotations/[id]/to-invoice — تحويل عرض سعر لفاتورة حقيقية
 * عبر مسار الحفظ الذرّي نفسه (مخزون + صندوق + عمولة) وتعليم العرض محوّلاً.
 * body: { warehouseId, cashboxId?, payMode: 'cash'|'credit'|'mixed', paidAmount?, salesRepId? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      warehouseId?: number;
      cashboxId?: number | null;
      payMode?: "cash" | "credit" | "mixed";
      paidAmount?: number | null;
      salesRepId?: number | null;
    };
    if (!body.warehouseId) {
      return NextResponse.json({ error: "اختر المخزن لإتمام التحويل" }, { status: 400 });
    }
    const result = await convertQuotationToInvoice(db, Number(id), {
      warehouseId: Number(body.warehouseId),
      cashboxId: body.cashboxId ?? null,
      payMode: body.payMode ?? "cash",
      paidAmount: body.paidAmount ?? null,
      salesRepId: body.salesRepId ?? null,
    });
    const invoice = await fetchInvoiceDetail(db, result.invoiceId);
    return NextResponse.json({ invoice });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("to-invoice error:", e);
    return NextResponse.json({ error: "تعذر تحويل عرض السعر" }, { status: 500 });
  }
}
