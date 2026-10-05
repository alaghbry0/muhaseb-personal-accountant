/**
 * Seed الخزينة (Task 4-a) — تشغيل: bun scripts/seed-cash.ts
 *
 * عبر saveCashTx الحقيقية (ذرّي + منع السالب + قواعد الربط FR-04-03):
 *  - ~24 مصروفاً خلال آخر 30 يوماً عبر الفئات (إيجار شهري 150,000، كهرباء،
 *    نقل، صيانة، اتصالات، أخرى) من الصندوق الرئيسي
 *  - تحويلان بين الصندوقين: يمني ← سعودي (70,000 ر.ي) ثم سعودي ← يمني (50 ر.س)
 *  - زوج إيداع/سحب بنكي (20,000 ر.ي)
 * حارس التكرار: يتخطى كل شيء إذا كان عدد المصروفات > 10.
 */
import { PrismaClient } from "@prisma/client";
import { saveCashTx, TX_TYPE_LABELS } from "../src/domain/cash";

const db = new PrismaClient();

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

async function main() {
  const expenseCount = await db.cashTx.count({ where: { txType: "expense" } });

  const [yerBox, sarBox, cats] = await Promise.all([
    db.cashbox.findFirst({ where: { isDefault: true }, include: { currency: true } }),
    db.cashbox.findFirst({ where: { isDefault: false }, include: { currency: true } }),
    db.expenseCategory.findMany(),
  ]);
  if (!yerBox || !sarBox) throw new Error("لا توجد صناديق — شغّل scripts/seed.ts أولاً");
  const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? null;

  // وصف الحركات الموجودة مسبقاً — لعدم التكرار عند إعادة التشغيل بعد فشل جزئي
  const existing = new Set(
    (
      await db.cashTx.findMany({
        where: { txType: { in: ["expense", "opening", "box_transfer", "bank_deposit", "bank_withdraw"] } },
        select: { description: true },
      })
    ).map((r) => r.description ?? "")
  );

  const liveBalance = await db.$transaction((tx) =>
    tx.cashTx.findMany({
      where: { OR: [{ cashboxId: yerBox.id }, { toCashboxId: yerBox.id }] },
      select: { txType: true, cashboxId: true, toCashboxId: true, amount: true },
    })
  );
  let bal = 0;
  for (const t of liveBalance) {
    const sign =
      t.cashboxId === yerBox.id
        ? ["receipt", "opening", "bank_withdraw"].includes(t.txType)
          ? 1
          : -1
        : ["box_transfer", "bank_deposit"].includes(t.txType)
          ? 1
          : -1;
    bal += sign * t.amount;
  }
  console.log(`💰 الرصيد الحي لـ«${yerBox.name}» قبل البذر: ${bal.toLocaleString("en-US")} ر.ي (يشمل رواتب/سحبيات 4-b)`);

  // ─── تعزيز سيولة افتتاحي ديناميكي (صافي البذر المخطط ≈ 359 ألف + هامش 200 ألف) ───
  const OPENING_DESC = "رصيد افتتاحي — تعزيز سيولة الصندوق الرئيسي";
  if (!existing.has(OPENING_DESC)) {
    const need = 200000 + 358800 - bal;
    if (need > 0) {
      const boostAmount = Math.ceil(need / 50000) * 50000;
      const boost = await saveCashTx(db, {
        txType: "opening",
        cashboxId: yerBox.id,
        amount: boostAmount,
        exchangeRate: 1,
        txDate: daysFromNow(30),
        description: OPENING_DESC,
      });
      console.log(`  ✅ رصيد افتتاحي ${boostAmount.toLocaleString("en-US")} ر.ي (الرصيد الآن ${boost.cashboxBalance.toLocaleString("en-US")})`);
    }
  } else {
    console.log("  ⏭️  الرصيد الافتتاحي موجود مسبقاً.");
  }

  // ─── المصروفات (~24) خلال آخر 30 يوماً ───
  const expenses: Array<{ day: number; cat: string; amount: number; desc: string }> = [
    { day: 29, cat: "إيجار", amount: 150000, desc: "إيجار المحل — شهر أكتوبر 2026" },
    { day: 26, cat: "كهرباء ومياه", amount: 18400, desc: "فاتورة كهرباء المنشأة" },
    { day: 24, cat: "نقل وشحن", amount: 9500, desc: "نقل بضاعة من السوق للمعرض" },
    { day: 22, cat: "إنترنت واتصالات", amount: 5500, desc: "تعبئة إنترنت المكتب" },
    { day: 20, cat: "صيانة", amount: 12000, desc: "صيانة مكيف المعرض" },
    { day: 18, cat: "نقل وشحن", amount: 7500, desc: "أجرة توصيل طلبية الشامي" },
    { day: 16, cat: "كهرباء ومياه", amount: 14200, desc: "فاتورة مياه" },
    { day: 14, cat: "أخرى", amount: 6000, desc: "قرطاسية وطباعة" },
    { day: 12, cat: "صيانة", amount: 8500, desc: "صيانة ميزان إلكتروني" },
    { day: 10, cat: "إنترنت واتصالات", amount: 4800, desc: "رصيد هاتف الخدمة" },
    { day: 9, cat: "نقل وشحن", amount: 10200, desc: "شحن بضاعة للزبائن الخارجيين" },
    { day: 8, cat: "كهرباء ومياه", amount: 16100, desc: "فاتورة كهرباء" },
    { day: 7, cat: "أخرى", amount: 7500, desc: "ضيافة العمال" },
    { day: 6, cat: "صيانة", amount: 9800, desc: "صيانة باب المعرض" },
    { day: 5, cat: "نقل وشحن", amount: 6800, desc: "أجرة ونتر تنزيل البضاعة" },
    { day: 4, cat: "إنترنت واتصالات", amount: 5200, desc: "اشتراك إنترنت شهري" },
    { day: 3, cat: "أخرى", amount: 4500, desc: "رسوم حوالة بنكية" },
    { day: 2, cat: "كهرباء ومياه", amount: 13900, desc: "فاتورة كهرباء" },
    { day: 1, cat: "نقل وشحن", amount: 8300, desc: "نقل أثاث للمستودع" },
    { day: 0, cat: "إنترنت واتصالات", amount: 5100, desc: "تعبئة باقة البيانات" },
  ];

  let saved = 0;
  for (const e of expenses) {
    if (expenseCount > 10 || existing.has(e.desc)) {
      if (expenseCount <= 10) console.log(`  ⏭️  موجود مسبقاً: ${e.desc}`);
      continue;
    }
    const res = await saveCashTx(db, {
      txType: "expense",
      cashboxId: yerBox.id,
      amount: e.amount,
      expenseCategoryId: cat(e.cat),
      txDate: daysFromNow(e.day),
      description: e.desc,
    });
    saved++;
    console.log(`  ✅ ${TX_TYPE_LABELS.expense}: ${e.desc} — ${e.amount.toLocaleString("en-US")} ر.ي (رصيد ${res.cashboxBalance.toLocaleString("en-US")})`);
  }

  // ─── تحويلان بين الصندوقين (يمني ← سعودي ثم سعودي ← يمني) ───
  if (!existing.has("تحويل رأس مال عامل لصندوق الريال السعودي")) {
    const t1 = await saveCashTx(db, {
      txType: "box_transfer",
      cashboxId: yerBox.id,
      toCashboxId: sarBox.id,
      amount: 70000,
      exchangeRate: 1,
      txDate: daysFromNow(11),
      description: "تحويل رأس مال عامل لصندوق الريال السعودي",
    });
    console.log(
      `  ✅ تحويل: 70,000 ر.ي ← «${t1.tx.cashboxName}» إلى «${t1.tx.toCashboxName}» (رصيد الوجهة ${t1.toCashboxBalance?.toLocaleString("en-US")} ر.س)`
    );
  }

  if (!existing.has("إعادة جزء من التحويل للصندوق الرئيسي")) {
    const t2 = await saveCashTx(db, {
      txType: "box_transfer",
      cashboxId: sarBox.id,
      toCashboxId: yerBox.id,
      amount: 50,
      exchangeRate: 700,
      txDate: daysFromNow(4),
      description: "إعادة جزء من التحويل للصندوق الرئيسي",
    });
    console.log(
      `  ✅ تحويل: 50 ر.س ← «${t2.tx.cashboxName}» إلى «${t2.tx.toCashboxName}» بوصول ≈ ${(50 * 700).toLocaleString("en-US")} ر.ي (رصيد ${t2.toCashboxBalance?.toLocaleString("en-US")})`
    );
  }

  // ─── زوج إيداع/سحب بنكي ───
  if (!existing.has("إيداع نقدي في حساب المنشأة البنكي")) {
    const dep = await saveCashTx(db, {
      txType: "bank_deposit",
      cashboxId: yerBox.id,
      amount: 20000,
      exchangeRate: 1,
      txDate: daysFromNow(6),
      description: "إيداع نقدي في حساب المنشأة البنكي",
    });
    console.log(`  ✅ ${TX_TYPE_LABELS.bank_deposit}: 20,000 ر.ي (رصيد ${dep.cashboxBalance.toLocaleString("en-US")})`);
  }

  if (!existing.has("سحب نقدي من البنك للصندوق")) {
    const wd = await saveCashTx(db, {
      txType: "bank_withdraw",
      cashboxId: yerBox.id,
      amount: 20000,
      exchangeRate: 1,
      txDate: daysFromNow(2),
      description: "سحب نقدي من البنك للصندوق",
    });
    console.log(`  ✅ ${TX_TYPE_LABELS.bank_withdraw}: 20,000 ر.ي (رصيد ${wd.cashboxBalance.toLocaleString("en-US")})`);
  }

  console.log(`\n🎉 تم بذر الخزينة: ${saved} مصروفاً + 2 تحويل + زوج بنكي.`);
}

main()
  .catch((e) => {
    console.error("seed-cash failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
