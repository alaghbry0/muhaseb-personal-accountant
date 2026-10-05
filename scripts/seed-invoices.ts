/**
 * Seed فواتير تجريبية (Task 2) — تشغيل: bun scripts/seed-invoices.ts
 * يولّد ~55 فاتورة بيع عبر saveSaleInvoice الحقيقية (حفظ ذرّي: مخزون + صندوق + عمولات)
 * موزعة على آخر 30 يوماً (60% نقدي / 30% آجل / 8% مختلط / 2% معلّق)
 * مع خصومات فواتير ومناديب (عمولات تلقائية) وعملات YER/SAR + 3 عروض أسعار
 * (واحد يُحوَّل لفاتورة). قابل لإعادة التشغيل: ينظّف فواتير البيع السابقة
 * وأثرها ويعيد حساب أرصدة المخزون من الحركات المتبقية (يحترم مشتريات 3-a إن وُجدت).
 */
import { PrismaClient } from "@prisma/client";
import {
  saveSaleInvoice,
  type SaveSalePayload,
  type PayMode,
} from "../src/domain/invoice-save";
import {
  saveQuotation,
  convertQuotationToInvoice,
  type SaveQuotationPayload,
} from "../src/domain/quotation";

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
/** وقت عشوائي واقعي خلال اليوم (ISO) */
function timeAt(day: string, hour: number, minute: number): string {
  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`).toISOString();
}

async function main() {
  console.log("🧾 Seed فواتير المبيعات التجريبية…");

  // ─── 1) تنظيف فواتير البيع السابقة وأثرها (يحافظ على المشتريات/المرتجعات إن وُجدت) ───
  console.log("   تنظيف فواتير البيع القديمة وأثرها…");
  await db.cashTx.deleteMany({ where: { refType: "invoice" } });
  await db.commission.deleteMany({ where: { refType: "invoice" } });
  await db.stockMovement.deleteMany({ where: { refType: "invoice" } });
  await db.invoiceItem.deleteMany({ where: { invoice: { docType: "sale" } } });
  await db.invoice.deleteMany({ where: { docType: "sale" } });
  await db.quotationItem.deleteMany({});
  await db.quotation.deleteMany({});

  // ─── 2) إعادة حساب أرصدة المخزون من الحركات المتبقية (افتتاحي + مشتريات 3-a) ───
  const movements = await db.stockMovement.findMany({
    select: { productId: true, warehouseId: true, qty: true },
  });
  const levelMap = new Map<string, number>();
  for (const m of movements) {
    const key = `${m.productId}:${m.warehouseId}`;
    levelMap.set(key, (levelMap.get(key) ?? 0) + m.qty);
  }
  await db.stockLevel.deleteMany({});
  for (const [key, qty] of levelMap) {
    const [productId, warehouseId] = key.split(":").map(Number);
    await db.stockLevel.create({ data: { productId, warehouseId, qty } });
  }
  console.log(`   ✓ أرصدة المخزون أعيد حسابها من ${movements.length} حركة متبقية`);

  // ─── 3) تحميل المراجع ───
  const currencies = await db.currency.findMany();
  const yer = currencies.find((c) => c.code === "YER")!;
  const sar = currencies.find((c) => c.code === "SAR")!;
  const warehouses = await db.warehouse.findMany();
  const mainWh = warehouses.find((w) => w.isDefault) ?? warehouses[0];
  const branchWh = warehouses.find((w) => !w.isDefault) ?? mainWh;
  const cashboxes = await db.cashbox.findMany();
  const yerBox = cashboxes.find((b) => b.currencyId === yer.id)!;
  const sarBox = cashboxes.find((b) => b.currencyId === sar.id)!;
  const customers = await db.customer.findMany({ where: { isArchived: false } });
  const reps = await db.salesRep.findMany({ where: { isArchived: false } });

  const products = await db.product.findMany({
    where: { isArchived: false },
    include: { prices: true },
  });
  // أسعار البيع حسب العملة
  const priceOf = (productId: number, currencyId: number): number => {
    const p = products.find((x) => x.id === productId)!;
    return p.prices.find((pr) => pr.currencyId === currencyId)?.price ?? 0;
  };

  // متتبع الرصيد المتبقي (مفتاح product:warehouse) — يمنع تجاوز المخزون أثناء التوليد
  const levels = await db.stockLevel.findMany();
  const remaining = new Map<string, number>();
  for (const l of levels) remaining.set(`${l.productId}:${l.warehouseId}`, l.qty);

  // مجموعة آمنة: أصناف بمخزون كبير في المخزن الرئيسي
  const safePool = products.filter((p) => (remaining.get(`${p.id}:${mainWh.id}`) ?? 0) >= 15);
  if (safePool.length < 5) throw new Error("لا يوجد مخزون كافٍ للتوليد — شغّل scripts/seed.ts أولاً");
  console.log(`   ✓ ${safePool.length} صنفاً في المجموعة الآمنة، ${customers.length} عميلاً، ${reps.length} مناديب`);

  /** يبني بنود فاتورة عشوائية تحترم الرصيد المتبقي */
  function buildItems(currencyId: number, warehouseId: number) {
    const lineCount = randInt(1, 4);
    const chosen = new Set<number>();
    const items: SaveSalePayload["items"] = [];
    for (let i = 0; i < lineCount; i++) {
      const pool = safePool.filter((p) => !chosen.has(p.id));
      if (pool.length === 0) break;
      const prod = pick(pool);
      const key = `${prod.id}:${warehouseId}`;
      const avail = remaining.get(key) ?? 0;
      if (avail < 3) continue;
      const qty = randInt(1, Math.min(10, avail - 2));
      chosen.add(prod.id);
      remaining.set(key, avail - qty);
      items.push({
        productId: prod.id,
        qty,
        unitPrice: priceOf(prod.id, currencyId),
        discountPercent: rand() < 0.12 ? pick([2, 5]) : 0,
      });
    }
    return items;
  }

  function subtotalOf(items: SaveSalePayload["items"]): number {
    return items.reduce((s, it) => s + it.qty * it.unitPrice * (1 - (it.discountPercent ?? 0) / 100), 0);
  }

  // ─── 4) توليد الفواتير ───
  let cash = 0, credit = 0, mixed = 0, held = 0, commissions = 0;
  const TOTAL = 55;
  const results: string[] = [];
  let attempts = 0;

  let i = 0;
  while (results.length < TOTAL && attempts < TOTAL * 3) {
    attempts++;
    // أول 5 فواتير بتاريخ اليوم (لتنبض الداشبورد)، والبقية موزعة على 29 يوماً
    const day = i < 5 ? daysAgo(0) : daysAgo(randInt(1, 29));
    i++;
    const createdAt = timeAt(day, randInt(8, 20), randInt(0, 59));

    // توزيع أنواع الدفع: ~60/30/8/2 — آخر فاتورة محفوظة تكون معلّقة
    const r = rand();
    let payMode: PayMode;
    if (results.length === TOTAL - 1) payMode = "held";
    else if (r < 0.6) payMode = "cash";
    else if (r < 0.9) payMode = "credit";
    else payMode = "mixed";

    const useSar = rand() < 0.15;
    const currencyId = useSar ? sar.id : yer.id;
    const cashboxId = useSar ? sarBox.id : yerBox.id;
    const warehouseId = rand() < 0.8 ? mainWh.id : branchWh.id;

    const items = buildItems(currencyId, warehouseId);
    if (items.length === 0) continue;

    // نقدي: أحياناً زبون عابر (40% يحمل عميلاً) — الآجل/المختلط دائماً بعميل
    const needsCustomer = payMode === "credit" || payMode === "mixed" || rand() < 0.4;
    const useCustomer = needsCustomer ? pick(customers) : null;

    // مندوب لبعض الفواتير (عمولات تلقائية)
    const rep = rand() < 0.35 ? pick(reps) : null;

    // خصم فاتورة لبعض الفواتير
    const withDiscount = payMode !== "held" && rand() < 0.25;
    const subtotal = subtotalOf(items);
    const invoiceDiscount = withDiscount
      ? Math.round((subtotal * (0.02 + rand() * 0.03)) / 50) * 50
      : 0;

    let paidAmount: number | null = null;
    if (payMode === "mixed") {
      // نسبة مقبولة من الإجمالي التقريبي
      paidAmount = Math.round(subtotal * (0.35 + rand() * 0.35));
    }

    try {
      const res = await saveSaleInvoice(db, {
        issuedAt: day,
        createdAt,
        customerId: useCustomer?.id ?? null,
        salesRepId: rep?.id ?? null,
        cashboxId,
        warehouseId,
        currencyId,
        items,
        invoiceDiscount,
        taxRate: 0,
        payMode,
        paidAmount,
        notesPrinted: rand() < 0.08 ? "شكراً لثقتكم — البضاعة بيعت كما هي" : null,
        notesInternal: rand() < 0.05 ? "عميل دائم — أولوية في التجهيز" : null,
      });
      if (payMode === "cash") cash++;
      else if (payMode === "credit") credit++;
      else if (payMode === "mixed") mixed++;
      else held++;
      results.push(res.invoiceNo);
      if (rep && (rep.commissionType === "sales" || rep.commissionType === "both")) commissions++;
    } catch (e) {
      console.error(`   ⚠ فشلت فاتورة #${i + 1}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`   ✓ ${results.length} فاتورة بيع: ${cash} نقدي / ${credit} آجل / ${mixed} مختلط / ${held} معلّقة`);
  console.log(`   ✓ ${commissions} عمولة مندوب تُسجَّلت تلقائياً`);

  // ─── 5) عروض الأسعار: 2 مفتوحة + 1 تُحوَّل لفاتورة ───
  const quoteDays = [daysAgo(3), daysAgo(1), daysAgo(0)];
  let quotesOpen = 0;
  let quotesConverted = 0;
  for (let i = 0; i < quoteDays.length; i++) {
    const items = buildItems(yer.id, mainWh.id);
    if (items.length === 0) continue;
    const payload: SaveQuotationPayload = {
      issuedAt: quoteDays[i],
      createdAt: timeAt(quoteDays[i], randInt(9, 17), randInt(0, 59)),
      customerId: pick(customers).id,
      currencyId: yer.id,
      items,
      taxRate: 0,
      validUntil: daysAgo(-7),
      notes: i === 0 ? "الأسعار مثبتة لمدة أسبوع" : null,
    };
    const quoteId = await saveQuotation(db, payload);
    if (i < 2) {
      quotesOpen++;
    } else {
      const inv = await convertQuotationToInvoice(db, quoteId, {
        warehouseId: mainWh.id,
        cashboxId: yerBox.id,
        payMode: "cash",
      });
      quotesConverted++;
      console.log(`   ✓ تحويل عرض السعر QTE#${quoteId} لفاتورة ${inv.invoiceNo}`);
    }
  }
  console.log(`   ✓ عروض الأسعار: ${quotesOpen} مفتوحة + ${quotesConverted} محوّلة`);

  // ─── 6) ملخص تحققي ───
  const [invCount, txCount, comCount, quoteCount, sumAgg] = await Promise.all([
    db.invoice.count({ where: { docType: "sale" } }),
    db.cashTx.count({ where: { refType: "invoice" } }),
    db.commission.count({ where: { refType: "invoice" } }),
    db.quotation.count(),
    db.invoice.aggregate({ _sum: { totalBase: true, costTotal: true }, where: { docType: "sale", status: "completed" } }),
  ]);
  const todayCount = await db.invoice.count({
    where: { docType: "sale", status: "completed", issuedAt: daysAgo(0) },
  });
  console.log("\n📊 الملخص النهائي:");
  console.log(`   فواتير البيع: ${invCount} | حركات صندوق مرتبطة: ${txCount} | عمولات: ${comCount} | عروض: ${quoteCount}`);
  console.log(`   مبيعات مكتملة (أساس): ${Math.round(sumAgg._sum.totalBase ?? 0).toLocaleString("en-US")} ر.ي | تكلفة: ${Math.round(sumAgg._sum.costTotal ?? 0).toLocaleString("en-US")} ر.ي | ربح: ${Math.round((sumAgg._sum.totalBase ?? 0) - (sumAgg._sum.costTotal ?? 0)).toLocaleString("en-US")} ر.ي`);
  console.log(`   فواتير اليوم (مكتملة): ${todayCount}`);
  console.log("\n✅ تم توليد بيانات الفوترة التجريبية بنجاح");
}

main()
  .catch((e) => {
    console.error("❌ فشل seed الفواتير:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
