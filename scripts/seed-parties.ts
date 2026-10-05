/**
 * Seed الأطراف والأقساط (Task 3-b) — تشغيل: bun scripts/seed-parties.ts
 *
 * عبر دوال الـ Domain الحقيقية (حفظ ذرّي):
 *  - 4 خطط تقسيط: 2 من فواتير آجلة قائمة + 2 مستقلة (مبلغ مخصص)
 *  - 6 تحصيلات أقساط (كامل/جزئي — بعضها بتاريخ اليوم لعرض «المستحق اليوم»
 *    وقسطان متأخران على الأقل بتواريخ ماضية غير مسددة)
 *  - 8 سندات: 5 قبض من عملاء بأرصدة (أحدها مرتبط بفاتورة) + 3 صرف لموردين
 *
 * حارس التكرار: يتخطى كل شيء إذا كان عدد الخطط > 2.
 */
import { PrismaClient } from "@prisma/client";
import { createPlanFromInvoice, createStandalonePlan, collectInstallment } from "../src/domain/installments";
import { saveVoucher, computeCustomerBalance, todayStr } from "../src/domain/parties";

const db = new PrismaClient();

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return isoDay(d);
}

async function main() {
  const today = todayStr();
  const planCount = await db.installmentPlan.count();
  if (planCount > 2) {
    console.log(`⏭️ Seed الأطراف: يوجد ${planCount} خطة بالفعل — تخطٍّ (حارس التكرار)`);
    return;
  }

  // ───────────── مراجع أساسية ─────────────
  const cashbox = (await db.cashbox.findFirst({ where: { isArchived: false } }))!;
  if (!cashbox) throw new Error("لا صندوق — شغّل scripts/seed.ts أولاً");
  console.log(`📦 الصندوق: ${cashbox.name} (id=${cashbox.id}) — اليوم: ${today}`);

  // ───────────── الخطط من فواتير آجلة ─────────────
  // نستبعد الفواتير المربوطة بخطط نشطة + نفضل فاتورة بمندوب تحصيل للعمولة
  const existingPlanInvoiceIds = new Set(
    (await db.installmentPlan.findMany({ select: { invoiceId: true } }))
      .filter((p) => p.invoiceId)
      .map((p) => p.invoiceId!)
  );
  const reps = await db.salesRep.findMany();
  const collectionRepIds = new Set(
    reps.filter((r) => r.commissionType === "collection" || r.commissionType === "both").map((r) => r.id)
  );
  const openCreditInvoices = await db.invoice.findMany({
    where: { docType: "sale", status: "completed", dueAmount: { gt: 20000 }, customerId: { not: null } },
    orderBy: { dueAmount: "desc" },
    take: 20,
  });
  const fresh = openCreditInvoices.filter((i) => !existingPlanInvoiceIds.has(i.id));
  // فاتورة بمندوب تحصيل (collection/both) ولو كانت صغيرة — لتوليد عمولة تحصيل FR-05-06
  const withCollectionRep = (
    await db.invoice.findMany({
      where: {
        docType: "sale",
        status: "completed",
        dueAmount: { gt: 5000 },
        customerId: { not: null },
        salesRepId: { not: null },
      },
      orderBy: { dueAmount: "desc" },
      take: 30,
    })
  ).find((i) => !existingPlanInvoiceIds.has(i.id) && i.salesRepId && collectionRepIds.has(i.salesRepId));
  const planAInvoice = fresh[0];
  const planBInvoice =
    withCollectionRep && withCollectionRep.id !== planAInvoice?.id ? withCollectionRep : fresh[1];
  if (!planAInvoice || !planBInvoice) throw new Error("لا توجد فواتير آجلة كافية — شغّل scripts/seed-invoices.ts أولاً");

  // الخطة A: أسبوعية من أكبر فاتورة آجلة — أول استحقاق قبل 3 أسابيع
  //   #1 (−21 يوم) تُحصّل كاملة، #2 (−14) جزئي، #3 (−7) متأخر، #4 اليوم، #5/#6 قادمة
  const planARes = await createPlanFromInvoice(db, {
    invoiceId: planAInvoice.id,
    months: 6,
    downPayment: 0,
    cycle: "weekly",
    firstDue: daysFromNow(-21),
    cashboxId: cashbox.id,
    txDate: daysFromNow(-21),
  });
  console.log(
    `🅰️ خطة من ${planAInvoice.invoiceNo} (${planARes.plan.customerName}): أصل ${planARes.plan.principal} × 6 أقساط أسبوعية`
  );

  // الخطة B: شهرية من فاتورة بمندوب تحصيل — دفعة أولى 10% — أول استحقاق قبل شهرين
  //   #1 و#2 محصّلان، #3 (اليوم) جزئي → عمولة تحصيل للمندوب
  const downB = Math.round((planBInvoice.dueAmount * 0.1) / 100) * 100; // مقربة لمئة
  const planBRes = await createPlanFromInvoice(db, {
    invoiceId: planBInvoice.id,
    months: 5,
    downPayment: downB,
    cycle: "monthly",
    firstDue: daysFromNow(-60),
    cashboxId: cashbox.id,
    txDate: daysFromNow(-60),
  });
  console.log(
    `🅱️ خطة من ${planBInvoice.invoiceNo} (${planBRes.plan.customerName}): أصل ${planBRes.plan.principal} + دفعة أولى ${downB} × 5 أشهر`
  );

  // ───────────── الخطط المستقلة (مبلغ مخصص — FR-05-01) ─────────────
  const customerC = await db.customer.findFirst({ where: { id: 4 } }); // محمد يحيى الشامي — رصيد افتتاحي
  const customerD = await db.customer.findFirst({ where: { id: 5 } }); // شركة النور — حد ائتمان كبير
  if (!customerC || !customerD) throw new Error("عملاء Seed الأساس غير موجودين (id 4/5)");

  // الخطة C: 240,000 بدفعة أولى 40,000 — أسبوعية أول استحقاق اليوم (عرض «المستحق اليوم»)
  const planCRes = await createStandalonePlan(db, {
    customerId: customerC.id,
    principal: 240000,
    months: 8,
    downPayment: 40000,
    cycle: "weekly",
    firstDue: today,
    cashboxId: cashbox.id,
    txDate: today,
  });
  console.log(`🅲 خطة مستقلة (${customerC.name}): 240,000 − دفعة أولى 40,000 × 8 أسابيع`);

  // الخطة D: 150,000 شهرية أول استحقاق قبل 60 يوماً بلا دفعات → قسطان متأخران+
  const planDRes = await createStandalonePlan(db, {
    customerId: customerD.id,
    principal: 150000,
    months: 4,
    downPayment: 0,
    cycle: "monthly",
    firstDue: daysFromNow(-60),
    cashboxId: cashbox.id,
    txDate: daysFromNow(-60),
  });
  console.log(`🅳 خطة مستقلة (${customerD.name}): 150,000 × 4 أشهر — أول استحقاق ${daysFromNow(-60)}`);

  // ───────────── تحصيل الأقساط (6 عمليات: كامل/جزئي) ─────────────
  const instsA = await db.installment.findMany({ where: { planId: planARes.plan.id }, orderBy: { seq: "asc" } });
  const instsB = await db.installment.findMany({ where: { planId: planBRes.plan.id }, orderBy: { seq: "asc" } });
  const instsD = await db.installment.findMany({ where: { planId: planDRes.plan.id }, orderBy: { seq: "asc" } });

  const collections: Array<{ label: string; run: () => Promise<unknown> }> = [
    {
      label: `A#1 كامل (${instsA[0].amount}) بتاريخ ${instsA[0].dueDate}`,
      run: () =>
        collectInstallment(db, {
          installmentId: instsA[0].id,
          cashboxId: cashbox.id,
          txDate: instsA[0].dueDate,
        }),
    },
    {
      label: `A#2 جزئي (60%) بتاريخ ${instsA[1].dueDate}`,
      run: () =>
        collectInstallment(db, {
          installmentId: instsA[1].id,
          amount: Math.round(instsA[1].amount * 0.6),
          cashboxId: cashbox.id,
          txDate: instsA[1].dueDate,
        }),
    },
    {
      label: `B#1 كامل (${instsB[0].amount})`,
      run: () =>
        collectInstallment(db, {
          installmentId: instsB[0].id,
          cashboxId: cashbox.id,
          txDate: instsB[0].dueDate,
        }),
    },
    {
      label: `B#2 كامل (${instsB[1].amount})`,
      run: () =>
        collectInstallment(db, {
          installmentId: instsB[1].id,
          cashboxId: cashbox.id,
          txDate: instsB[1].dueDate,
        }),
    },
    {
      label: `B#3 جزئي (50%) بتاريخ اليوم ${instsB[2].dueDate}`,
      run: () =>
        collectInstallment(db, {
          installmentId: instsB[2].id,
          amount: Math.round(instsB[2].amount * 0.5),
          cashboxId: cashbox.id,
          txDate: instsB[2].dueDate,
        }),
    },
    {
      label: `D#1 جزئي (40%) بتاريخ ${instsD[0].dueDate}`,
      run: () =>
        collectInstallment(db, {
          installmentId: instsD[0].id,
          amount: Math.round(instsD[0].amount * 0.4),
          cashboxId: cashbox.id,
          txDate: instsD[0].dueDate,
        }),
    },
  ];
  for (const c of collections) {
    const res = await c.run();
    console.log(
      `💵 تحصيل ${c.label} → cashTx#${res.cashTxId}${res.commissionCreated ? " + عمولة تحصيل للمندوب ✨" : ""}`
    );
  }

  // ───────────── السندات (5 قبض + 3 صرف) ─────────────
  const customersWithBalance = (
    await Promise.all(
      (await db.customer.findMany({ where: { isArchived: false }, select: { id: true, name: true } })).map(
        async (c) => ({ ...c, balance: await computeCustomerBalance(db, c.id) })
      )
    )
  )
    .filter((c) => c.balance > 15000)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  if (customersWithBalance.length < 5) throw new Error("لا يوجد 5 عملاء بأرصدة كافية للسندات");

  // فاتورة مفتوحة لعميل أول (للربط)
  const linkCustomer = customersWithBalance[0];
  const linkInvoice = await db.invoice.findFirst({
    where: {
      docType: "sale",
      status: "completed",
      dueAmount: { gt: 0 },
      customerId: linkCustomer.id,
    },
    orderBy: { dueAmount: "desc" },
  });

  const receiptVoucherSpecs = customersWithBalance.map((c, i) => ({
    partyId: c.id,
    name: c.name,
    amount: Math.min(Math.round((c.balance * 0.2) / 500) * 500, 30000) || 5000,
    txDate: i === 0 ? today : daysFromNow(-(i * 2 + 1)),
    description: i === 0 ? "تحصيل دفعة نقدياً" : `تحصيل دفعة ${i + 1}`,
    refInvoiceId: i === 0 && linkInvoice ? linkInvoice.id : null,
  }));

  for (const v of receiptVoucherSpecs) {
    const res = await saveVoucher(db, {
      kind: "receipt",
      partyType: "customer",
      partyId: v.partyId,
      amount: v.amount,
      cashboxId: cashbox.id,
      txDate: v.txDate,
      description: v.description,
      refInvoiceId: v.refInvoiceId,
    });
    console.log(
      `🟢 سند قبض ${res.voucher.number} — ${v.name}: ${v.amount}${v.refInvoiceId ? ` (مرتبط ${res.voucher.refInvoiceNo})` : ""} → الرصيد ${res.partyBalance}`
    );
  }

  const paySuppliers = await db.supplier.findMany({
    where: { isArchived: false, openingBalance: { gt: 0 } },
    take: 3,
  });
  for (let i = 0; i < Math.min(3, paySuppliers.length); i++) {
    const s = paySuppliers[i];
    const amount = Math.max(5000, Math.round((s.openingBalance * 0.3) / 1000) * 1000);
    const res = await saveVoucher(db, {
      kind: "payment",
      partyType: "supplier",
      partyId: s.id,
      amount,
      cashboxId: cashbox.id,
      txDate: i === 0 ? today : daysFromNow(-(i * 3 + 2)),
      description: "سداد دفعة للمورد — نقداً",
    });
    console.log(`🔴 سند صرف ${res.voucher.number} — ${s.name}: ${amount} → الرصيد ${res.partyBalance}`);
  }

  // ───────────── الملخص ─────────────
  const plans = await db.installmentPlan.findMany({ include: { installments: true, customer: true } });
  console.log("\n══════════ الملخص ══════════");
  for (const p of plans) {
    const paid = p.installments.filter((i) => i.status === "paid").length;
    const partial = p.installments.filter((i) => i.status === "partial").length;
    console.log(
      `خطة #${p.id} — ${p.customer.name} — أصل ${p.principal} (${p.invoiceId ? "من فاتورة" : "مخصص"}) ${p.cycle === "weekly" ? "أسبوعية" : "شهرية"}: مسدد ${paid}، جزئي ${partial}, المتأخر ${p.installments.filter((i) => (i.status === "pending" || i.status === "partial") && i.dueDate < today).length}`
    );
  }
  const voucherCount = await db.cashTx.count({ where: { refType: "voucher" } });
  console.log(`إجمالي السندات: ${voucherCount}`);
  console.log("✅ اكتمل Seed الأطراف والأقساط");
}

main()
  .catch((e) => {
    console.error("❌ فشل Seed الأطراف:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
