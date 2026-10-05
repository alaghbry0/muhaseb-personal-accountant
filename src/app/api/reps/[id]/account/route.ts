import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { repAccount } from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/reps/[id]/account?from=&to= — حساب المندوب (FR-06-03):
 * أداء الفترة (فواتير/مبيعات/مرتجعات/تحصيلات/عمولات) + صافي المستحق (عمولات مستحقة)
 * + قائمة المستحق للصرف. تستهلكه بطاقة المندوب وتقرير أداء المناديب (report-reps).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sp = req.nextUrl.searchParams;
    const data = await repAccount(db, {
      repId: Number(id),
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
    });
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/reps/[id]/account error:", e);
    return NextResponse.json({ error: "تعذر تحميل حساب المندوب" }, { status: 500 });
  }
}
