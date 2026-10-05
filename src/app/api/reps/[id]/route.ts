import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/reps/[id] — تعديل مندوب + الأرشفة/الاستعادة (FR-06-01).
 * Body: { name?, phone?, commissionType?, commissionPercent?, areas?, isArchived? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const repId = Number(id);
    const rep = await db.salesRep.findUnique({ where: { id: repId } });
    if (!rep) return NextResponse.json({ error: "المندوب غير موجود" }, { status: 404 });
    const body = await req.json();
    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ error: "اسم المندوب إلزامي" }, { status: 400 });
    }
    if (body.commissionType !== undefined && !["sales", "collection", "both"].includes(body.commissionType)) {
      return NextResponse.json({ error: "نوع العمولة غير صحيح" }, { status: 400 });
    }
    if (body.commissionPercent !== undefined) {
      const p = Number(body.commissionPercent);
      if (!(p >= 0 && p <= 100)) {
        return NextResponse.json({ error: "نسبة العمولة يجب أن تكون بين 0 و 100" }, { status: 400 });
      }
    }
    const updated = await db.salesRep.update({
      where: { id: repId },
      data: {
        ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
        ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
        ...(body.commissionType !== undefined ? { commissionType: body.commissionType } : {}),
        ...(body.commissionPercent !== undefined
          ? { commissionPercent: Number(body.commissionPercent) }
          : {}),
        ...(body.areas !== undefined ? { areas: body.areas?.trim() || null } : {}),
        ...(body.isArchived !== undefined ? { isArchived: Boolean(body.isArchived) } : {}),
      },
    });
    return NextResponse.json({ rep: updated });
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("PATCH /api/reps/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل المندوب" }, { status: 500 });
  }
}
