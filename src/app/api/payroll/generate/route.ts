import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generatePayroll } from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * POST /api/payroll/generate — توليد/تحديث مسودة المسير (UNIQUE employee+period).
 * لا يمس المسيرات المدفوعة (FR-07-05).
 * Body: { period: 'YYYY-MM', lines?: [{ employeeId, bonus?, otherDeduction? }] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const period = String(body.period ?? "");
    if (!period) {
      return NextResponse.json({ error: "حدد الشهر بصيغة YYYY-MM" }, { status: 400 });
    }
    const lines = Array.isArray(body.lines)
      ? body.lines.map((l: { employeeId: number; bonus?: number; otherDeduction?: number }) => ({
          employeeId: Number(l.employeeId),
          bonus: l.bonus != null ? Number(l.bonus) : undefined,
          otherDeduction: l.otherDeduction != null ? Number(l.otherDeduction) : undefined,
        }))
      : undefined;
    const result = await generatePayroll(db, { period, lines });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/payroll/generate error:", e);
    return NextResponse.json({ error: "تعذر توليد المسير" }, { status: 500 });
  }
}
