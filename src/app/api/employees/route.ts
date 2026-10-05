import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveEmployee, CYCLE_LABELS, type SalaryCycle } from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";
import { round2 } from "@/domain/money";

export const dynamic = "force-dynamic";

/**
 * GET /api/employees?q= — قائمة الموظفين النشطين + إحصاءات.
 * «إجمالي الرواتب الشهرية (المكافئ)» = شهري×1 + أسبوعي×4 + يومي×30.
 */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    const employees = await db.employee.findMany({
      where: {
        isArchived: false,
        ...(q
          ? {
              OR: [
                { name: { contains: q } },
                { phone: { contains: q } },
                { role: { contains: q } },
              ],
            }
          : {}),
      },
      orderBy: { id: "asc" },
    });
    const monthlyEquivalent = round2(
      employees.reduce(
        (s, e) => s + e.salary * (e.salaryCycle === "weekly" ? 4 : e.salaryCycle === "daily" ? 30 : 1),
        0
      )
    );
    return NextResponse.json({
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        phone: e.phone,
        role: e.role,
        salary: e.salary,
        salaryCycle: e.salaryCycle as SalaryCycle,
        salaryCycleLabel: CYCLE_LABELS[e.salaryCycle as SalaryCycle],
        hiredAt: e.hiredAt,
      })),
      stats: {
        count: employees.length,
        monthlyEquivalent,
        totalRaw: round2(employees.reduce((s, e) => s + e.salary, 0)),
      },
    });
  } catch (e) {
    console.error("GET /api/employees error:", e);
    return NextResponse.json({ error: "تعذر تحميل الموظفين" }, { status: 500 });
  }
}

/** POST /api/employees — تسجيل موظف جديد (FR-07-01). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const employee = await saveEmployee(db, {
      name: String(body.name ?? ""),
      phone: body.phone ?? null,
      role: body.role ?? null,
      salary: Number(body.salary ?? 0),
      salaryCycle: body.salaryCycle ?? "monthly",
      hiredAt: body.hiredAt || null,
    });
    return NextResponse.json({ employee });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/employees error:", e);
    return NextResponse.json({ error: "تعذر حفظ الموظف" }, { status: 500 });
  }
}
