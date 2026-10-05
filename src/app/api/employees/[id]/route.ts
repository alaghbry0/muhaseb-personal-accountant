import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEmployeeFile, updateEmployee, type SalaryCycle } from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/employees/[id]?month=YYYY-MM — ملف الموظف:
 * بياناته + حضور الشهر + آخر 5 سحبيات + مسيرات رواته + رصيد السحبيات غير المخصومة.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const month = req.nextUrl.searchParams.get("month") ?? undefined;
    const file = await getEmployeeFile(db, Number(id), month ?? undefined);
    return NextResponse.json(file);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/employees/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل ملف الموظف" }, { status: 500 });
  }
}

/**
 * PATCH /api/employees/[id] — تعديل بيانات موظف + الأرشفة/الاستعادة
 * Body: { name?, phone?, role?, salary?, salaryCycle?, hiredAt?, isArchived? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const employee = await updateEmployee(db, Number(id), {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.salary !== undefined ? { salary: Number(body.salary) } : {}),
      ...(body.salaryCycle !== undefined ? { salaryCycle: body.salaryCycle as SalaryCycle } : {}),
      ...(body.hiredAt !== undefined ? { hiredAt: body.hiredAt } : {}),
      ...(body.isArchived !== undefined ? { isArchived: Boolean(body.isArchived) } : {}),
    });
    return NextResponse.json({ employee });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("PATCH /api/employees/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل الموظف" }, { status: 500 });
  }
}
