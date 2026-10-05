import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/domain/audit";

export const dynamic = "force-dynamic";

/** مفاتيح الإعدادات المسموح كتابتها (لمنع العبث بمفاتيح النظام) */
const KEY_PATTERN = /^(display|print|invoice|app|backup)\.[a-zA-Z0-9_]+$/

/**
 * GET /api/settings — كل الإعدادات (قيم JSON محلّلة).
 */
export async function GET() {
  try {
    const rows = await db.settings.findMany({ orderBy: { key: "asc" } });
    const settings: Record<string, unknown> = {}
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value)
      } catch {
        settings[row.key] = row.value
      }
    }
    return NextResponse.json({ settings })
  } catch (e) {
    console.error("GET /api/settings error:", e)
    return NextResponse.json({ error: "تعذر تحميل الإعدادات" }, { status: 500 })
  }
}

/**
 * PATCH /api/settings — كتابة مفتاح/عدة مفاتيح (upsert).
 * Body: { key, value } أو { updates: { key: value, ... } }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      key?: string
      value?: unknown
      updates?: Record<string, unknown>
    }
    const updates: Record<string, unknown> = {}
    if (body.updates && typeof body.updates === "object") {
      Object.assign(updates, body.updates)
    } else if (body.key) {
      updates[body.key] = body.value
    }
    const keys = Object.keys(updates)
    if (keys.length === 0) {
      return NextResponse.json({ error: "لا توجد مفاتيح للتحديث" }, { status: 400 })
    }
    for (const k of keys) {
      if (!KEY_PATTERN.test(k)) {
        return NextResponse.json({ error: `مفتاح إعدادات غير مسموح: ${k}` }, { status: 400 })
      }
    }
    for (const [key, value] of Object.entries(updates)) {
      await db.settings.upsert({
        where: { key },
        update: { value: JSON.stringify(value ?? null) },
        create: { key, value: JSON.stringify(value ?? null) },
      })
    }
    await logAudit(db, {
      action: "settings_update",
      entity: "settings",
      details: { keys },
    })
    return NextResponse.json({ ok: true, updated: keys })
  } catch (e) {
    console.error("PATCH /api/settings error:", e)
    return NextResponse.json({ error: "تعذر حفظ الإعدادات" }, { status: 500 })
  }
}
