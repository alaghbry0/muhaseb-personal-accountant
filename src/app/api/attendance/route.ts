import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  markAttendance,
  markAttendanceBatch,
  getAttendanceDay,
  type AttendanceStatus,
} from "@/domain/payroll";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/** GET /api/attendance?day=YYYY-MM-DD — حصّة يومية: كل الموظفين وحالتهم في اليوم. */
export async function GET(req: NextRequest) {
  try {
    const day = req.nextUrl.searchParams.get("day") ?? "";
    if (!day) {
      return NextResponse.json({ error: "حدد اليوم بصيغة YYYY-MM-DD" }, { status: 400 });
    }
    const data = await getAttendanceDay(db, day);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/attendance error:", e);
    return NextResponse.json({ error: "تعذر تحميل الحضور" }, { status: 500 });
  }
}

/**
 * POST /api/attendance — تسجيل حالة واحدة أو دفعة يوم كامل (FR-07-02).
 * Body: { employeeId, day, status, lateMinutes?, notes? }  ← حالة واحدة
 *     | { day, entries: [{ employeeId, status, lateMinutes?, notes? }] }  ← دفعة (حفظ الكل)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (Array.isArray(body.entries)) {
      const result = await markAttendanceBatch(db, String(body.day ?? ""), body.entries);
      return NextResponse.json(result);
    }
    const row = await markAttendance(db, {
      employeeId: Number(body.employeeId),
      day: String(body.day ?? ""),
      status: body.status as AttendanceStatus,
      lateMinutes: body.lateMinutes != null ? Number(body.lateMinutes) : 0,
      notes: body.notes ?? null,
    });
    return NextResponse.json({ saved: 1, day: row.day, row });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/attendance error:", e);
    return NextResponse.json({ error: "تعذر حفظ الحضور" }, { status: 500 });
  }
}
