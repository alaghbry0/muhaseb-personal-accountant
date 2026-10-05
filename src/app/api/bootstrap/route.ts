import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { BootstrapData } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/bootstrap — بيانات الإقلاع: المنشأة + العملات + أسعار اليوم + المخازن
 * + الصناديق + الإعدادات. مخزَّنة مؤقتاً في الذاكرة (30 ثانية).
 */
let cache: { data: BootstrapData; at: number } | null = null;
const CACHE_TTL = 30 * 1000;

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function load(): Promise<BootstrapData> {
  const [company, currencies, warehouses, cashboxes, settingsRows] = await Promise.all([
    db.company.findFirst(),
    db.currency.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
    db.warehouse.findMany({ where: { isArchived: false }, orderBy: { id: "asc" } }),
    db.cashbox.findMany({
      where: { isArchived: false },
      orderBy: { id: "asc" },
      include: { currency: { select: { code: true, name: true } } },
    }),
    db.settings.findMany(),
  ]);

  const todayStr = isoDay(new Date());

  // أسعار اليوم (أو آخر سعر متاح لكل عملة)
  const rates: BootstrapData["rates"] = {};
  for (const c of currencies) {
    if (c.isBase) continue;
    const rate =
      (await db.exchangeRate.findFirst({
        where: { currencyId: c.id, rateDate: todayStr },
        orderBy: { rateDate: "desc" },
      })) ??
      (await db.exchangeRate.findFirst({
        where: { currencyId: c.id },
        orderBy: { rateDate: "desc" },
      }));
    if (rate) rates[c.code] = { rate: rate.rate, rateDate: rate.rateDate };
  }

  // الإعدادات: تحليل قيم JSON
  const settings: Record<string, unknown> = {};
  for (const row of settingsRows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  const base = currencies.find((c) => c.isBase) ?? null;

  return {
    company: company
      ? {
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
        }
      : null,
    currencies: currencies.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      isBase: c.isBase,
      decimals: c.decimals,
    })),
    rates,
    baseCurrency: base
      ? { id: base.id, code: base.code, name: base.name, isBase: base.isBase, decimals: base.decimals }
      : null,
    warehouses: warehouses.map((w) => ({
      id: w.id,
      name: w.name,
      location: w.location,
      isDefault: w.isDefault,
    })),
    cashboxes: cashboxes.map((b) => ({
      id: b.id,
      name: b.name,
      currencyId: b.currencyId,
      isDefault: b.isDefault,
      currency: b.currency ? { code: b.currency.code, name: b.currency.name } : undefined,
    })),
    settings,
  };
}

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_TTL) {
      return NextResponse.json(cache.data);
    }
    const data = await load();
    cache = { data, at: Date.now() };
    return NextResponse.json(data);
  } catch (e) {
    console.error("bootstrap error:", e);
    return NextResponse.json({ error: "تعذر تحميل بيانات الإقلاع" }, { status: 500 });
  }
}
