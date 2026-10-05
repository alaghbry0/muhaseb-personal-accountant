import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/domain/audit";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/cashboxes — قائمة الصناديق (بما فيها المؤرشفة) مع عملتها.
 */
export async function GET() {
  try {
    const boxes = await db.cashbox.findMany({
      orderBy: { id: "asc" },
      include: { currency: { select: { code: true, name: true } } },
    });
    return NextResponse.json({
      cashboxes: boxes.map((b) => ({
        id: b.id,
        name: b.name,
        currencyId: b.currencyId,
        currencyCode: b.currency?.code ?? "",
        currencyName: b.currency?.name ?? "",
        isDefault: b.isDefault,
        isArchived: b.isArchived,
      })),
    });
  } catch (e) {
    console.error("GET /api/settings/cashboxes error:", e);
    return NextResponse.json({ error: "تعذر تحميل الصناديق" }, { status: 500 });
  }
}

/**
 * POST /api/settings/cashboxes — إنشاء صندوق (FR-13-06 بيانات مرجعية).
 * Body: { name, currencyId, isDefault? }
 * الصندوق الافتراضي الجديد يلغي افتراضية غيره (افتراضي واحد فقط).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      name?: string
      currencyId?: number
      isDefault?: boolean
    }
    const name = String(body.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "اسم الصندوق إلزامي" }, { status: 400 })
    const currencyId = Number(body.currencyId ?? 0)
    const currency = await db.currency.findUnique({ where: { id: currencyId } })
    if (!currency) return NextResponse.json({ error: "اختر عملة صالحة للصندوق" }, { status: 400 })

    const result = await db.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.cashbox.updateMany({ data: { isDefault: false } })
      }
      return tx.cashbox.create({
        data: { name, currencyId, isDefault: Boolean(body.isDefault) },
        include: { currency: { select: { code: true, name: true } } },
      })
    })
    await logAudit(db, {
      action: "cashbox_create",
      entity: "cashbox",
      entityId: result.id,
      details: { name, currency: currency.code },
    })
    return NextResponse.json({ cashbox: result }, { status: 201 })
  } catch (e) {
    console.error("POST /api/settings/cashboxes error:", e)
    return NextResponse.json({ error: "تعذر إنشاء الصندوق" }, { status: 500 })
  }
}

/**
 * PATCH /api/settings/cashboxes — تعديل صندوق (اسم/افتراضي/أرشفة).
 * Body: { id, name?, isDefault?, isArchived? }
 * الصندوق ذو الحركات لا يُحذف — يُؤرشف (نفس فلسفة باقي النظام).
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: number
      name?: string
      isDefault?: boolean
      isArchived?: boolean
    }
    const id = Number(body.id ?? 0)
    const box = await db.cashbox.findUnique({ where: { id } })
    if (!box) return NextResponse.json({ error: "الصندوق غير موجود" }, { status: 404 })
    if (body.name !== undefined && !String(body.name).trim()) {
      return NextResponse.json({ error: "اسم الصندوق إلزامي" }, { status: 400 })
    }

    const updated = await db.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.cashbox.updateMany({ data: { isDefault: false } })
      }
      return tx.cashbox.update({
        where: { id },
        data: {
          ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
          ...(body.isDefault !== undefined ? { isDefault: Boolean(body.isDefault) } : {}),
          ...(body.isArchived !== undefined ? { isArchived: Boolean(body.isArchived) } : {}),
        },
        include: { currency: { select: { code: true, name: true } } },
      })
    })
    return NextResponse.json({ cashbox: updated })
  } catch (e) {
    console.error("PATCH /api/settings/cashboxes error:", e)
    return NextResponse.json({ error: "تعذر تعديل الصندوق" }, { status: 500 })
  }
}
