/**
 * تحقق جودة Task 3-a (مؤقت — يُحذف بعد التشغيل).
 * يشغَّل والخادم يعمل على 3000: bun verify-3a.tmp.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const API = "http://localhost:3000";
let passed = 0;
let failed = 0;

function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function get(path: string) {
  const r = await fetch(`${API}${path}`);
  const text = await r.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300), parseError: true }; }
  return { status: r.status, body };
}
async function post(path: string, data: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const text = await r.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300), parseError: true }; }
  return { status: r.status, body };
}
async function del(path: string) {
  const r = await fetch(`${API}${path}`, { method: "DELETE" });
  return { status: r.status, body: await r.json().catch(() => ({})) as any };
}

function ean13Valid(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === Number(code[12]);
}

async function main() {
  console.log("═══ 1) GET قوائم جديدة ═══");
  {
    const products = await get("/api/products?pageSize=5");
    ok("GET /api/products", products.status === 200 && products.body.products.length > 0,
      `stats: ${products.body.stats.productsCount} صنفاً، قيمة ${products.body.stats.stockValueBase} ر.ي، منخفض ${products.body.stats.lowStockCount}`);
    const alerts = await get("/api/stock/alerts");
    ok("GET /api/stock/alerts", alerts.status === 200 && Array.isArray(alerts.body.lowStock),
      `lowStock=${alerts.body.lowStock.length}, deadStock=${alerts.body.deadStock.length}`);
    const stk = await get("/api/stock/stocktake");
    ok("GET /api/stock/stocktake", stk.status === 200 && Array.isArray(stk.body.stocktakes));
    const tr = await get("/api/stock/transfers");
    ok("GET /api/stock/transfers", tr.status === 200 && Array.isArray(tr.body.transfers));
    const sup = await get("/api/suppliers");
    ok("GET /api/suppliers", sup.status === 200 && sup.body.suppliers.length >= 5,
      `${sup.body.suppliers.length} موردين`);
    const cats = await get("/api/categories");
    ok("GET /api/categories", cats.status === 200 && cats.body.categories.length >= 5);
    const units = await get("/api/units");
    ok("GET /api/units", units.status === 200 && units.body.units.length >= 5);
    const whs = await get("/api/warehouses");
    ok("GET /api/warehouses", whs.status === 200 && whs.body.warehouses.length >= 2);
    const movs = await get("/api/stock/movements?type=purchase");
    ok("GET /api/stock/movements?type=purchase", movs.status === 200 && movs.body.movements.length > 0,
      `${movs.body.total} حركة شراء`);
    const invs = await get("/api/invoices?docType=purchase");
    ok("GET /api/invoices?docType=purchase", invs.status === 200 && invs.body.invoices.length > 0,
      `${invs.body.total} فاتورة، أول واحدة: ${invs.body.invoices[0]?.invoiceNo} مورد: ${invs.body.invoices[0]?.supplierName}`);
    const nn = await get("/api/invoices/next-number?docType=purchase");
    ok("GET next-number?docType=purchase", nn.status === 200 && nn.body.invoiceNo.startsWith("PUR-"),
      nn.body.invoiceNo);
  }

  console.log("═══ 2) فاتورة شراء + WAC ═══");
  let purchasedProductId = 0;
  {
    const product = await db.product.findFirst({ where: { isArchived: false }, orderBy: { id: "asc" } });
    const wh = await db.warehouse.findFirst({ where: { isDefault: true } })!;
    const currency = await db.currency.findFirst({ where: { isBase: true } })!;
    const cashbox = await db.cashbox.findFirst({ where: { currencyId: currency.id } })!;
    const supplier = await db.supplier.findFirst()!;

    const oldCost = product!.costPrice;
    const oldStockAgg = await db.stockLevel.aggregate({ _sum: { qty: true }, where: { productId: product!.id } });
    const oldQty = oldStockAgg._sum.qty ?? 0;
    const buyQty = 40;
    const buyPrice = 123; // ر.ي للوحدة
    const expectedWac = oldQty > 0
      ? Math.round(((oldQty * oldCost + buyQty * buyPrice) / (oldQty + buyQty)) * 10000) / 10000
      : buyPrice;

    const res = await post("/api/invoices", {
      docType: "purchase",
      supplierId: supplier.id,
      cashboxId: cashbox.id,
      warehouseId: wh.id,
      currencyId: currency.id,
      items: [{ productId: product!.id, qty: buyQty, unitPrice: buyPrice }],
      payMode: "cash",
    });
    purchasedProductId = product!.id;
    ok("POST فاتورة شراء نقدي", res.status === 200 && res.body.invoice?.invoiceNo?.startsWith("PUR-"),
      `${res.body.invoice?.invoiceNo} — إجمالي ${res.body.invoice?.total}`);
    ok("الصندوق: حركة دفع مسجلة",
      res.body.invoice?.payments?.some((p: any) => p.txType === "payment" && p.amount === buyQty * buyPrice) === true);

    const after = await db.product.findUnique({ where: { id: product!.id } });
    ok(`WAC: ${oldCost} → ${after!.costPrice} (متوقع ${expectedWac})`,
      Math.abs(after!.costPrice - expectedWac) < 0.01,
      `oldQty=${oldQty}, +${buyQty} @ ${buyPrice}`);
    const level = await db.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: product!.id, warehouseId: wh.id } },
    });
    const totalAfter = (await db.stockLevel.aggregate({ _sum: { qty: true }, where: { productId: product!.id } }))._sum.qty ?? 0;
    ok("المخزون زاد بالكمية", level != null && Math.abs(totalAfter - (oldQty + buyQty)) < 0.01,
      `الرصيد الكلي ${oldQty} → ${totalAfter} (+${buyQty}) — بالمخزن الرئيسي: ${level?.qty}`);

    // آجل بلا مورد → 400
    const badCredit = await post("/api/invoices", {
      docType: "purchase", warehouseId: wh.id, currencyId: currency.id,
      items: [{ productId: product!.id, qty: 1, unitPrice: 10 }], payMode: "credit",
    });
    ok("شراء آجل بلا مورد → 400", badCredit.status === 400 && /مورد/.test(badCredit.body.error), badCredit.body.error);
  }

  console.log("═══ 3) مرتجع بيع مرتبط (مخزون + رصيد عميل) ═══");
  {
    const inv = await db.invoice.findFirst({
      where: { docType: "sale", status: "completed", customerId: { not: null }, payStatus: { in: ["credit", "mixed"] } },
      include: { items: true },
      orderBy: { id: "desc" },
    });
    if (!inv) {
      ok("مرتجع بيع: لا فاتورة آجلة للاختبار", false);
    } else {
      const item = inv.items[0];
      const levelBefore = await db.stockLevel.findUnique({
        where: { productId_warehouseId: { productId: item.productId, warehouseId: inv.warehouseId } },
      });
      const stockBefore = levelBefore?.qty ?? 0;
      const balBefore = await get("/api/parties/customers");
      const customerBefore = (balBefore.body.customers as any[]).find((c) => c.id === inv.customerId);

      const res = await post("/api/invoices", {
        docType: "sale_return",
        originalInvoiceId: inv.id,
        warehouseId: inv.warehouseId,
        currencyId: inv.currencyId,
        refundMethod: "credit",
        items: [{ productId: item.productId, qty: Math.min(2, item.qty), unitPrice: item.unitPrice }],
      });
      ok("POST مرتجع بيع مرتبط", res.status === 200 && res.body.invoice?.invoiceNo?.startsWith("SRN-"),
        `${res.body.invoice?.invoiceNo}`);
      const levelAfter = await db.stockLevel.findUnique({
        where: { productId_warehouseId: { productId: item.productId, warehouseId: inv.warehouseId } },
      });
      const returnedQty = Math.min(2, item.qty);
      ok(`المخزون عاد: ${stockBefore} → ${levelAfter?.qty}`,
        Math.abs((levelAfter?.qty ?? 0) - stockBefore - returnedQty) < 0.01);
      ok(`رصيد العميل: ${customerBefore?.balance} → ${res.body.customerBalance} (نقص ${returnedQty * item.unitPrice})`,
        res.body.customerBalance != null &&
        Math.abs(res.body.customerBalance - (customerBefore.balance - returnedQty * item.unitPrice)) < 1,
      );
      // تجاوز الكمية الأصلية → 400
      const over = await post("/api/invoices", {
        docType: "sale_return",
        originalInvoiceId: inv.id,
        warehouseId: inv.warehouseId,
        currencyId: inv.currencyId,
        refundMethod: "credit",
        items: [{ productId: item.productId, qty: item.qty + 1, unitPrice: item.unitPrice }],
      });
      ok("تجاوز كمية الفاتورة الأصلية → 400", over.status === 400, over.body.error);
    }
  }

  console.log("═══ 4) مرتجع شراء (يمنع السالب + استرداد نقدي) ═══");
  {
    const pur = await db.invoice.findFirst({
      where: { docType: "purchase", status: "completed" },
      include: { items: true },
      orderBy: { id: "desc" },
    });
    const item = pur!.items[0];
    const wh = await db.warehouse.findFirst({ where: { isDefault: true } })!;
    const currency = await db.currency.findFirst({ where: { isBase: true } })!;
    const cashbox = await db.cashbox.findFirst({ where: { currencyId: currency.id } })!;
    // كمية أكبر من الرصيد → 400
    const level = await db.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: item.productId, warehouseId: wh.id } },
    });
    const tooMuch = (level?.qty ?? 0) + 50;
    const over = await post("/api/invoices", {
      docType: "purchase_return", warehouseId: wh.id, currencyId: currency.id,
      cashboxId: cashbox.id, refundMethod: "cash",
      items: [{ productId: item.productId, qty: tooMuch, unitPrice: item.unitPrice }],
    });
    ok("مرتجع شراء يمنع السالب → 400", over.status === 400 && /غير كافية/.test(over.body.error), over.body.error);

    const res = await post("/api/invoices", {
      docType: "purchase_return", warehouseId: wh.id, currencyId: currency.id,
      cashboxId: cashbox.id, refundMethod: "cash",
      items: [{ productId: item.productId, qty: 3, unitPrice: item.unitPrice }],
    });
    ok("POST مرتجع شراء نقدي (حر)", res.status === 200 && res.body.invoice?.invoiceNo?.startsWith("PRN-"),
      `${res.body.invoice?.invoiceNo} — قبض ${res.body.invoice?.payments?.[0]?.amount}`);
  }

  console.log("═══ 5) تحويل مخازن ═══");
  {
    const whs = await db.warehouse.findMany({ where: { isArchived: false } });
    const [from, to] = whs;
    const product = await db.product.findFirst({
      where: { stockLevels: { some: { warehouseId: from.id, qty: { gte: 10 } } } },
      include: { stockLevels: true },
    });
    if (!product) {
      ok("تحويل: لا رصيد كافٍ", false);
    } else {
      const fromBefore = product.stockLevels.find((l) => l.warehouseId === from.id)!.qty;
      const toBefore = product.stockLevels.find((l) => l.warehouseId === to.id)?.qty ?? 0;
      const res = await post("/api/stock/transfer", {
        productId: product.id, fromWarehouseId: from.id, toWarehouseId: to.id, qty: 7,
        notes: "اختبار تحويل",
      });
      ok("POST /api/stock/transfer", res.status === 201, `transferId=${res.body.transferId}`);
      const after = await db.stockLevel.findMany({ where: { productId: product.id } });
      const fromAfter = after.find((l) => l.warehouseId === from.id)!.qty;
      const toAfter = after.find((l) => l.warehouseId === to.id)!.qty;
      ok(`المصدر ${fromBefore} → ${fromAfter} (−7)`, Math.abs(fromAfter - (fromBefore - 7)) < 0.01);
      ok(`الوجهة ${toBefore} → ${toAfter} (+7)`, Math.abs(toAfter - (toBefore + 7)) < 0.01);
      const list = await get("/api/stock/transfers");
      ok("سجل التحويلات يظهر الزوج",
        list.body.transfers.some((t: any) => t.id === res.body.transferId && t.fromWarehouse === from.name && t.toWarehouse === to.name));
      // تجاوز الرصيد → 400
      const overT = await post("/api/stock/transfer", {
        productId: product.id, fromWarehouseId: from.id, toWarehouseId: to.id, qty: 999999,
      });
      ok("تحويل بكمية أكبر من الرصيد → 400", overT.status === 400, overT.body.error);
    }
  }

  console.log("═══ 6) جرد (تسوية) ═══");
  {
    const wh = await db.warehouse.findFirst({ where: { isDefault: true } })!;
    const product = await db.product.findFirst({
      where: { stockLevels: { some: { warehouseId: wh.id, qty: { gt: 0 } } } },
      include: { stockLevels: true },
    });
    const before = product!.stockLevels.find((l) => l.warehouseId === wh.id)!.qty;
    const counted = Math.max(0, before - 3);
    const res = await post("/api/stock/stocktake", {
      warehouseId: wh.id,
      notes: "اختبار جرد",
      lines: [{ productId: product!.id, countedQty: counted }],
    });
    ok("POST /api/stock/stocktake", res.status === 201,
      `تسوية ${res.body.linesCount} — قيمة الفرق ${res.body.totalDiff}`);
    const after = await db.stockLevel.findUnique({
      where: { productId_warehouseId: { productId: product!.id, warehouseId: wh.id } },
    });
    ok(`الرصيد ضُبط على الفعلي: ${before} → ${after!.qty}`, Math.abs(after!.qty - counted) < 0.01);
    const mv = await db.stockMovement.findFirst({
      where: { productId: product!.id, movementType: "adjustment" },
      orderBy: { id: "desc" },
    });
    ok("حركة جرد مسجلة", mv != null && mv.refType === "stocktake", `qty=${mv?.qty}`);
    const detail = await get(`/api/stock/stocktake/${res.body.stocktakeId}`);
    ok("GET /api/stock/stocktake/[id]", detail.status === 200 && detail.body.stocktake.lines.length === 1);
    // لا فروقات → 400
    const same = await post("/api/stock/stocktake", {
      warehouseId: wh.id, lines: [{ productId: product!.id, countedQty: counted }],
    });
    ok("جرد بلا فروقات → 400", same.status === 400, same.body.error);
  }

  console.log("═══ 7) صنف جديد بباركود تلقائي (FR-01-02) ═══");
  {
    const res = await post("/api/products", {
      name: "صنف اختبار التوليد",
      costPrice: 150,
      minStock: 5,
      prices: { YER: 200, SAR: 0.28 },
      openingQty: 12,
      openingWarehouseId: (await db.warehouse.findFirst({ where: { isDefault: true } }))!.id,
    });
    ok("POST /api/products بلا باركود", res.status === 201 && !!res.body.barcode,
      `باركود: ${res.body.barcode}`);
    ok("الباركود EAN-13 صالح (خانة تحقق)", ean13Valid(res.body.barcode));
    const detail = await get(`/api/products/${res.body.productId}`);
    ok("الرصيد الافتتاحي مسجل", detail.body.totalStock === 12, `totalStock=${detail.body.totalStock}`);
    const mv = await db.stockMovement.findFirst({
      where: { productId: res.body.productId, movementType: "opening" },
    });
    ok("حركة opening مسجلة", mv != null && mv.qty === 12);
    // باركود مكرر → 400
    const dup = await post("/api/products", {
      name: "صنف مكرر", barcode: res.body.barcode, costPrice: 10,
    });
    ok("باركود مكرر → 400", dup.status === 400 && /مستخدم/.test(dup.body.error), dup.body.error);
    // حذف صنف له حركات → 400 (FR-01-15)
    const delRes = await del(`/api/products/${res.body.productId}`);
    ok("حذف صنف له حركات → 400 (FR-01-15)", delRes.status === 400 && /أرشفه/.test(delRes.body.error), delRes.body.error);
    // أرشفة عبر PATCH ثم استعادة
    const arch = await fetch(`${API}/api/products/${res.body.productId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: true, name: "صنف اختبار التوليد" }),
    });
    const archBody = await arch.json() as any;
    ok("PATCH أرشفة صنف", arch.status === 200);
    const unarch = await fetch(`${API}/api/products/${res.body.productId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isArchived: false, name: "صنف اختبار التوليد" }),
    });
    ok("PATCH استعادة صنف", unarch.status === 200);
    void archBody;
  }

  console.log("═══ 8) حركات صنف + فلاتر ═══");
  {
    const product = await db.product.findFirst({
      where: { stockMovements: { some: { movementType: "purchase" } } },
    });
    const res = await get(`/api/products/${product!.id}/movements`);
    ok("GET /api/products/[id]/movements", res.status === 200 && res.body.movements.length > 0,
      `${res.body.total} حركة — رصيد جاري أخير: ${res.body.movements[0]?.balance}`);
    const filtered = await get(`/api/products/${product!.id}/movements?type=&from=2020-01-01`);
    ok("فلترة from/to تعمل", filtered.status === 200);
  }

  console.log("═══ 9) بيع سليم بلا تغيير (انحدار) ═══");
  {
    const wh = await db.warehouse.findFirst({ where: { isDefault: true } })!;
    const currency = await db.currency.findFirst({ where: { isBase: true } })!;
    const cashbox = await db.cashbox.findFirst({ where: { currencyId: currency.id } })!;
    const product = await db.product.findFirst({
      where: { stockLevels: { some: { warehouseId: wh.id, qty: { gte: 3 } } } },
    });
    const res = await post("/api/invoices", {
      docType: "sale", warehouseId: wh.id, currencyId: currency.id, cashboxId: cashbox.id,
      items: [{ productId: product!.id, qty: 2, unitPrice: 999 }], payMode: "cash",
    });
    ok("POST فاتورة بيع نقدي (كما في Task 2)", res.status === 200 && res.body.invoice?.invoiceNo?.startsWith("INV-"),
      `${res.body.invoice?.invoiceNo} — ربح ${res.body.invoice?.profit}`);
  }

  console.log(`\n══════════ النتيجة: ${passed} ✅ / ${failed} ❌ ══════════`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("خطأ في سكربت التحقق:", e);
  process.exitCode = 1;
}).finally(() => db.$disconnect());
