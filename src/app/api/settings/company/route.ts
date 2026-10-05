import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/domain/audit";

export const dynamic = "force-dynamic";

/** حقول بيانات المنشأة القابلة للتعديل (FR-13-01) */
function companyBody(body: Record<string, unknown>) {
  const str = (v: unknown) => (v === undefined ? undefined : String(v ?? "").trim() || null)
  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim()
    if (!name) return { error: "اسم المنشأة إلزامي" as const }
    data.name = name
  }
  if (body.phone !== undefined) data.phone = str(body.phone)
  if (body.whatsapp !== undefined) data.whatsapp = str(body.whatsapp)
  if (body.address !== undefined) data.address = str(body.address)
  if (body.taxNumber !== undefined) data.taxNumber = str(body.taxNumber)
  if (body.taxRate !== undefined) {
    const t = Number(body.taxRate)
    if (!(t >= 0 && t <= 100)) return { error: "نسبة الضريبة يجب أن تكون بين 0 و 100" as const }
    data.taxRate = t
  }
  if (body.invoicePrefix !== undefined) {
    const p = String(body.invoicePrefix ?? "").trim()
    if (p && !/^[A-Za-z0-9_-]{1,8}$/.test(p)) {
      return { error: "بادئة الفواتير: حروف إنجليزية/أرقام حتى 8 خانات" as const }
    }
    data.invoicePrefix = p || null
  }
  if (body.footerText !== undefined) data.footerText = str(body.footerText)
  return { data }
}

/**
 * GET /api/settings/company — بيانات المنشأة.
 */
export async function GET() {
  try {
    const company = await db.company.findFirst()
    if (!company) return NextResponse.json({ error: "لا توجد بيانات منشأة" }, { status: 404 })
    return NextResponse.json({
      company: {
        id: company.id,
        name: company.name,
        phone: company.phone,
        whatsapp: company.whatsapp,
        address: company.address,
        taxNumber: company.taxNumber,
        taxRate: company.taxRate,
        invoicePrefix: company.invoicePrefix,
        footerText: company.footerText,
        currencyId: company.currencyId,
      },
    })
  } catch (e) {
    console.error("GET /api/settings/company error:", e)
    return NextResponse.json({ error: "تعذر تحميل بيانات المنشأة" }, { status: 500 })
  }
}

/**
 * PATCH /api/settings/company — تعديل بيانات المنشأة (FR-13-01: قابلة للتعديل لاحقاً).
 * العملة الأساسية لا تُعدَّل هنا — تُثبّت عند الإعداد (FR-08-01).
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const res = companyBody(body)
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 })
    const data = res.data as Record<string, unknown>
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "لا توجد حقول للتحديث" }, { status: 400 })
    }
    const current = await db.company.findFirst()
    if (!current) return NextResponse.json({ error: "لا توجد بيانات منشأة" }, { status: 404 })
    const updated = await db.company.update({ where: { id: current.id }, data })
    await logAudit(db, {
      action: "settings_update",
      entity: "company",
      entityId: updated.id,
      details: { fields: Object.keys(data) },
    })
    return NextResponse.json({
      company: {
        id: updated.id,
        name: updated.name,
        phone: updated.phone,
        whatsapp: updated.whatsapp,
        address: updated.address,
        taxNumber: updated.taxNumber,
        taxRate: updated.taxRate,
        invoicePrefix: updated.invoicePrefix,
        footerText: updated.footerText,
        currencyId: updated.currencyId,
      },
    })
  } catch (e) {
    console.error("PATCH /api/settings/company error:", e)
    return NextResponse.json({ error: "تعذر حفظ بيانات المنشأة" }, { status: 500 })
  }
}
