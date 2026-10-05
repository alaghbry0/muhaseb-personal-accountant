/**
 * Seed مشتريات ومرتجعات تجريبية (Task 3-a) — تشغيل: bun scripts/seed-purchases.ts
 *
 * • ~12 فاتورة شراء عبر savePurchaseInvoice الحقيقية (حفظ ذرّي: مخزون + WAC + صندوق + مورد)
 *   موزعة على آخر 30 يوماً — تشمل الأصناف منخفضة المخزون لتعويضها — موردون نقدي/آجل/مختلط.
 * • مرتجعا بيع (SRN) من فواتير آجلة قائمة حقيقية (بنودها الفعلية) — طريقة الخصم من الحساب.
 * • مرتجع شراء واحد (PRN) من إحدى فواتير الشراء المولدة — استرداد نقدي للصندوق.
 * • قابل لإعادة التشغيل: إن وُجدت أكثر من 3 فواتير شراء → تخطي (حماية من التكرار).
 */
import { PrismaClient } from "@prisma/client";
import {
  savePurchaseInvoice,
  saveReturnInvoice,
  type SavePurchasePayload,
  type SaveReturnPayload,
} from "../src/domain/inventory";

const db = new PrismaClient();

// ───────────── RNG قابل للتكرار ─────────────
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261005);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}
function timeAt(day: string, hour: number, minute: number): string {
  return new Date(
    `${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`
  ).toISOString();
}

async function main() {
  console.log("🚚 Seed المشتريات والمرتجعات (Task 3-a)…");

  // ─── حماية إعادة التشغيل ───
  const existingPurchases = await db.invoice.count({ where: { docType: "purchase" } });
  if (existingPurchases > 3) {
    console.log(`   ⏭️ توجد ${existingPurchases} فاتورة شراء بالفعل — تخطي (قابل لإعادة التشغيل).`);
    return;
  }

  // ─── المراجع ───
  const currencies = await db.currency.findMany();
  const yer = currencies.find((c) => c.code === "YER")!;
  const warehouses = await db.warehouse.findMany({ where: { isArchived: false } });
  const mainWh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
  const cashboxes = await db.cashbox.findMany({ where: { isArchived: false } });
  const yerBox = cashboxes.find((b) => b.currencyId === yer.id)!;
  const suppliers = await db.supplier.findMany({ where: { isArchived: false } });
  const products = await db.product.findMany({
    where: { isArchived: false },
    include: { stockLevels: { select: { qty: true } } },
  });
  if (products.length < 10) throw new Error("أصناف غير كافية — شغّل scripts/seed.ts أولاً");

  const totalStockOf = (id: number) => {
    const p = products.find((x) => x.id === id)!;
    return p.stockLevels.reduce((s, l) => s + l.qty, 0);
  };

  // أصناف منخفضة الرصيد (لتعويضها) + أصناف عادية للتنويع
  const lowStockPool = products.filter((p) => totalStockOf(p.id) < p.minStock + 5);
  const normalPool = products.filter((p) => totalStockOf(p.id) >= 15);
  console.log(
    `   ✓ ${products.length} صنفاً (${lowStockPool.length} منخفض الرصيد)، ${suppliers.length} موردين، مخزن «${mainWh.name}»`
  );

  /** سعر شراء واقعي: التكلفة الحالية ±8% (يقرب لأقرب 5) */
  const buyPriceOf = (cost: number): number => {
    const jitter = 1 + (rand() - 0.5) * 0.16;
    return Math.max(5, Math.round((cost * jitter) / 5) * 5);
  };

  // ─── 12 فاتورة شراء ───
  const createdPurchases: Array<{ id: number; invoiceNo: string; cashPaid: boolean; supplierId: number | null; items: Array<{ productId: number; qty: number; unitPrice: number }> }> = [];
  const usedProducts = new Set<number>();

  for (let i = 0; i < 12; i++) {
    const day = daysAgo(randInt(1, 29));
    const createdAt = timeAt(day, randInt(8, 17), randInt(0, 59));

    // منتجات الفاتورة: 1-3 أصناف (من منخفضي الرصيد أولاً ثم عاديين غير مكررين كثيراً)
    const lineCount = randInt(1, 3);
    const items: SavePurchasePayload["items"] = [];
    const chosen = new Set<number>();
    for (let j = 0; j < lineCount; j++) {
      const pool =
        lowStockPool.length > 0 && rand() < 0.6
          ? lowStockPool.filter((p) => !chosen.has(p.id))
          : normalPool.filter((p) => !chosen.has(p.id));
      if (pool.length === 0) break;
      const p = pick(pool);
      chosen.add(p.id);
      usedProducts.add(p.id);
      const qty = p.minStock > 0 ? randInt(Math.ceil(p.minStock), p.minStock + 25) : randInt(8, 60);
      items.push({
        productId: p.id,
        qty,
        unitPrice: buyPriceOf(p.costPrice),
      });
    }
    if (items.length === 0) continue;

    // طريقة الدفع: 45% نقدي / 40% آجل / 15% مختلط
    const roll = rand();
    const payMode: SavePurchasePayload["payMode"] = roll < 0.45 ? "cash" : roll < 0.85 ? "credit" : "mixed";
    const supplier = payMode === "cash" && rand() < 0.35 ? null : pick(suppliers);

    const result = await savePurchaseInvoice(db, {
      issuedAt: day,
      supplierId: supplier?.id ?? null,
      cashboxId: payMode === "credit" ? null : yerBox.id,
      warehouseId: mainWh.id,
      currencyId: yer.id,
      exchangeRate: 1,
      items,
      payMode,
      paidAmount: payMode === "mixed" ? Math.ceil((items.reduce((s, it) => s + it.qty * it.unitPrice, 0) * 0.5) / 100) * 100 : null,
      notesInternal: rand() < 0.3 ? "توريد دوري" : null,
      createdAt,
    });
    const total = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
    createdPurchases.push({
      id: result.invoiceId,
      invoiceNo: result.invoiceNo,
      cashPaid: payMode !== "credit",
      supplierId: supplier?.id ?? null,
      items: items.map((it) => ({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice })),
    });
    console.log(
      `   🧾 PUR ${result.invoiceNo} — ${day} — ${items.length} بنود — ${formatYer(total)} — ${payMode === "cash" ? "نقدي" : payMode === "credit" ? "آجل" : "مختلط"} — ${supplier?.name ?? "مورد نقدي"}`
    );
  }

  // ─── 2 مرتجع بيع من فواتير آجلة حقيقية ───
  const existingReturns = await db.invoice.count({ where: { docType: "sale_return" } });
  if (existingReturns === 0) {
    const creditInvoices = await db.invoice.findMany({
      where: {
        docType: "sale",
        status: "completed",
        customerId: { not: null },
        payStatus: { in: ["credit", "mixed"] },
      },
      include: { items: true },
      orderBy: { issuedAt: "desc" },
      take: 30,
    });
    if (creditInvoices.length >= 2) {
      for (let k = 0; k < 2; k++) {
        const inv = creditInvoices[randInt(0, creditInvoices.length - 1)];
        if (!inv || inv.items.length === 0) continue;
        // بند أو بندان من الفاتورة الأصلية بكميات جزئية
        const takeCount = Math.min(inv.items.length, randInt(1, 2));
        const chosenIdx = new Set<number>();
        const returnItems: SaveReturnPayload["items"] = [];
        while (chosenIdx.size < takeCount) {
          const idx = randInt(0, inv.items.length - 1);
          if (chosenIdx.has(idx)) continue;
          chosenIdx.add(idx);
          const it = inv.items[idx];
          returnItems.push({
            productId: it.productId,
            qty: Math.max(1, Math.ceil(it.qty / 2)),
            unitPrice: it.unitPrice,
          });
        }
        // تاريخ بعد الفاتورة الأصلية بأيام
        const afterDays = Math.min(29, Math.max(0, 29 - Math.abs(daysBetween(inv.issuedAt)))) || 2;
        const day = daysAgo(randInt(1, Math.max(2, afterDays)));
        const result = await saveReturnInvoice(db, {
          docType: "sale_return",
          originalInvoiceId: inv.id,
          warehouseId: inv.warehouseId,
          currencyId: inv.currencyId,
          exchangeRate: inv.exchangeRate,
          refundMethod: "credit",
          items: returnItems,
          notesPrinted: `مرتجع عن ${inv.invoiceNo}`,
          createdAt: timeAt(day, randInt(10, 18), randInt(0, 59)),
        });
        console.log(
          `   ↩️  SRN ${result.invoiceNo} — مرتجع بيع عن ${inv.invoiceNo} — خصم من حساب العميل (${returnItems.length} بنود)`
        );
      }
    }
  } else {
    console.log(`   ⏭️ توجد مرتجعات بيع بالفعل (${existingReturns}) — تخطي.`);
  }

  // ─── 1 مرتجع شراء (استرداد نقدي من مورد) ───
  const existingPR = await db.invoice.count({ where: { docType: "purchase_return" } });
  if (existingPR === 0 && createdPurchases.length > 0) {
    const src = createdPurchases.filter((p) => p.cashPaid && p.supplierId != null)[0] ?? createdPurchases[0];
    if (src) {
      const it = src.items[0];
      const qty = Math.max(1, Math.floor(it.qty / 4));
      const day = daysAgo(randInt(1, 5));
      const result = await saveReturnInvoice(db, {
        docType: "purchase_return",
        originalInvoiceId: src.id,
        warehouseId: mainWh.id,
        currencyId: yer.id,
        exchangeRate: 1,
        cashboxId: yerBox.id,
        refundMethod: "cash",
        items: [{ productId: it.productId, qty, unitPrice: it.unitPrice }],
        notesPrinted: `مرتجع جزئي عن ${src.invoiceNo}`,
        createdAt: timeAt(day, randInt(10, 17), randInt(0, 59)),
      });
      console.log(
        `   ↩️  PRN ${result.invoiceNo} — مرتجع شراء عن ${src.invoiceNo} — استرداد نقدي (${qty} × ${it.unitPrice})`
      );
    }
  } else if (existingPR > 0) {
    console.log(`   ⏭️ يوجد مرتجع شراء بالفعل — تخطي.`);
  }

  // ─── ملخص ───
  const after = {
    purchases: await db.invoice.count({ where: { docType: "purchase" } }),
    saleReturns: await db.invoice.count({ where: { docType: "sale_return" } }),
    purchaseReturns: await db.invoice.count({ where: { docType: "purchase_return" } }),
  };
  console.log(
    `✅ تم: ${after.purchases} فاتورة شراء (منها ${createdPurchases.length} جديدة)، ${after.saleReturns} مرتجع بيع، ${after.purchaseReturns} مرتجع شراء.`
  );
  console.log("   الأصناف المشمولة:", [...usedProducts].length, "صنفاً مختلفاً (WAC محدّث لكل منها).");
}

/** فرق الأيام بين تاريخ نصي واليوم (سالب = ماضٍ) */
function daysBetween(day: string): number {
  const d = new Date(`${day}T00:00:00`);
  return Math.round((d.getTime() - Date.now()) / 86400000);
}

function formatYer(n: number): string {
  return `${Math.round(n).toLocaleString("en-US")} ر.ي`;
}

main()
  .catch((e) => {
    console.error("فشل seed المشتريات:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
