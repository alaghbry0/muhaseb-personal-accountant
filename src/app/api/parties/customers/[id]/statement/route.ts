import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getStatement } from "@/domain/parties";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/parties/customers/[id]/statement?from=&to= — كشف حساب العميل (FR-03-04)
 * من دون from: يشمل كل الحركات بسطر «رصيد افتتاحي».
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sp = req.nextUrl.searchParams;
    const statement = await getStatement(db, {
      partyType: "customer",
      partyId: Number(id),
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
    });
    return NextResponse.json({ statement });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET statement error:", e);
    return NextResponse.json({ error: "تعذر تحميل كشف الحساب" }, { status: 500 });
  }
}
