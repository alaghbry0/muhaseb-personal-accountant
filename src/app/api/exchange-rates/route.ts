import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/domain/audit";

export const dynamic = "force-dynamic";

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * GET /api/exchange-rates?days=15 — العملات + سعر اليوم (أو آخر سعر) + سجل آخر N يوماً.
 * FR-08-03: إدارة أسعار الصرف اليومية.
 */
export async function GET(req: NextRequest) {
  try {
    const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 15) || 15))
    const currencies = await db.currency.findMany({ orderBy: { id: "asc" } })
    const t = today()
    const from = new Date(Date.now() - days * 86_400_000)
    const fromDate = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`

    const rates = await db.exchangeRate.findMany({
      where: { rateDate: { gte: fromDate } },
      orderBy: { rateDate: "desc" },
    })

    const rows = await Promise.all(
      currencies.map(async (c) => {
        const history = rates
          .filter((r) => r.currencyId === c.id)
          .sort((a, b) => (a.rateDate < b.rateDate ? 1 : -1))
          .map((r) => ({ rateDate: r.rateDate, rate: r.rate }))
        const todayRate =
          (await db.exchangeRate.findUnique({
            where: { currencyId_rateDate: { currencyId: c.id, rateDate: t } },
          })) ??
          (await db.exchangeRate.findFirst({
            where: { currencyId: c.id },
            orderBy: { rateDate: "desc" },
          }))
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          isBase: c.isBase,
          decimals: c.decimals,
          isActive: c.isActive,
          todayRate: todayRate ? todayRate.rate : null,
          todayRateDate: todayRate ? todayRate.rateDate : null,
          isToday: todayRate?.rateDate === t,
          history,
        }
      })
    )

    return NextResponse.json({ today: t, currencies: rows })
  } catch (e) {
    console.error("GET /api/exchange-rates error:", e)
    return NextResponse.json({ error: "تعذر تحميل أسعار الصرف" }, { status: 500 })
  }
}

/**
 * POST /api/exchange-rates — تحديث سعر اليوم لعملة (upsert على currency+rateDate).
 * Body: { currencyId, rate } — FR-08-03.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { currencyId?: number; rate?: number }
    const currencyId = Number(body.currencyId ?? 0)
    const rate = Number(body.rate ?? 0)
    const currency = await db.currency.findUnique({ where: { id: currencyId } })
    if (!currency) return NextResponse.json({ error: "العملة غير موجودة" }, { status: 400 })
    if (currency.isBase) {
      return NextResponse.json({ error: "العملة الأساسية سعرها ثابت (1)" }, { status: 400 })
    }
    if (!(rate > 0)) return NextResponse.json({ error: "أدخل سعر صرف أكبر من صفر" }, { status: 400 })

    const t = today()
    const row = await db.exchangeRate.upsert({
      where: { currencyId_rateDate: { currencyId, rateDate: t } },
      update: { rate, source: "manual", createdBy: 1 },
      create: { currencyId, rateDate: t, rate, source: "manual", createdBy: 1 },
    })
    await logAudit(db, {
      action: "exchange_rate_update",
      entity: "exchange_rate",
      entityId: row.id,
      details: { currency: currency.code, rate, date: t },
    })
    return NextResponse.json({ rate: row })
  } catch (e) {
    console.error("POST /api/exchange-rates error:", e)
    return NextResponse.json({ error: "تعذر تحديث سعر الصرف" }, { status: 500 })
  }
}

/**
 * PATCH /api/exchange-rates — تفعيل/تعطيل عملة (لعرضها في الواجهات أو إخفائها).
 * Body: { currencyId, isActive }
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as { currencyId?: number; isActive?: boolean }
    const currencyId = Number(body.currencyId ?? 0)
    const currency = await db.currency.findUnique({ where: { id: currencyId } })
    if (!currency) return NextResponse.json({ error: "العملة غير موجودة" }, { status: 400 })
    if (currency.isBase && body.isActive === false) {
      return NextResponse.json({ error: "لا يمكن تعطيل العملة الأساسية" }, { status: 400 })
    }
    const updated = await db.currency.update({
      where: { id: currencyId },
      data: { isActive: Boolean(body.isActive) },
    })
    return NextResponse.json({ currency: { id: updated.id, code: updated.code, isActive: updated.isActive } })
  } catch (e) {
    console.error("PATCH /api/exchange-rates error:", e)
    return NextResponse.json({ error: "تعذر تعديل العملة" }, { status: 500 })
  }
}
