import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { transferStock, DomainError, type TransferPayload } from "@/domain/inventory";

export const dynamic = "force-dynamic";

/**
 * POST /api/stock/transfer — تحويل بين مخزنين (FR-01-09): ذرّي،
 * حركتا transfer_out (−) و transfer_in (+) بنفس مرجع التحويل.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const result = await transferStock(db, body as unknown as TransferPayload);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/stock/transfer error:", e);
    return NextResponse.json({ error: "تعذر تنفيذ التحويل" }, { status: 500 });
  }
}
