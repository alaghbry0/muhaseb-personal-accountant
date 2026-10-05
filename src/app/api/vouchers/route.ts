import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveVoucher, listVouchers } from "@/domain/parties";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/vouchers?kind=receipt|payment&partyType=customer|supplier&partyId=&from=&to=&limit=
 * قائمة سندات القبض والصرف (refType='voucher').
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const vouchers = await listVouchers(db, {
      kind: sp.get("kind") || undefined,
      partyType: sp.get("partyType") || undefined,
      partyId: sp.get("partyId") ? Number(sp.get("partyId")) : undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json({ vouchers });
  } catch (e) {
    console.error("GET /api/vouchers error:", e);
    return NextResponse.json({ error: "تعذر تحميل السندات" }, { status: 500 });
  }
}

/**
 * POST /api/vouchers — إنشاء سند قبض/صرف (FR-03، سندات الوحدة 05)
 * Body: { kind: 'receipt'|'payment', partyType: 'customer'|'supplier', partyId,
 *         amount, currencyId?, exchangeRate?, cashboxId, txDate?, description?, refInvoiceId? }
 * الربط بفاتورة اختياري (للعرض/التذكير — لا يغيّر due الفاتورة، انظر اتفاقية parties.ts).
 * الدفعات المقدمة مسموحة مع overpayWarning=true.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!["receipt", "payment"].includes(body.kind)) {
      return NextResponse.json({ error: "نوع السند غير صالح" }, { status: 400 });
    }
    if (!["customer", "supplier"].includes(body.partyType)) {
      return NextResponse.json({ error: "نوع الطرف غير صالح" }, { status: 400 });
    }
    const result = await saveVoucher(db, {
      kind: body.kind,
      partyType: body.partyType,
      partyId: Number(body.partyId),
      amount: Number(body.amount),
      currencyId: body.currencyId != null ? Number(body.currencyId) : null,
      exchangeRate: body.exchangeRate != null ? Number(body.exchangeRate) : null,
      cashboxId: Number(body.cashboxId),
      txDate: body.txDate || undefined,
      description: body.description || null,
      refInvoiceId: body.refInvoiceId != null ? Number(body.refInvoiceId) : null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/vouchers error:", e);
    return NextResponse.json({ error: "تعذر حفظ السند" }, { status: 500 });
  }
}
