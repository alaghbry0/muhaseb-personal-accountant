import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listCashboxesWithBalances } from "@/domain/cash";

export const dynamic = "force-dynamic";

/**
 * GET /api/cashbox — الصناديق + الأرصدة الحية بعملة كل صندوق + الإجمالي بالأساس.
 * النسخة الغنية من cashboxes في /api/bootstrap (بلا أرصدة).
 */
export async function GET() {
  try {
    const data = await listCashboxesWithBalances(db);
    return NextResponse.json(data);
  } catch (e) {
    console.error("GET /api/cashbox error:", e);
    return NextResponse.json({ error: "تعذر تحميل الصناديق" }, { status: 500 });
  }
}
