/**
 * Seed — الموظفون والمناديب (Task 4-b) — يعوّض بيانات demo لوحدة الموظفين:
 *   • حضور آخر 14 يوماً × 5 موظفين (أغلبهم حاضر + غياب/تأخير/إجازة/نص يوم)
 *   • 4 سحبيات (2 في الشهر الحالي تُخصم من مسيره، 2 في الشهر الماضي خُصمت مع مسيره)
 *   • مسير الشهر الماضي «مدفوع» من الصندوق الرئيسي (عبر generatePayroll + commitPayroll الحقيقية)
 *   • مسير الشهر الحالي «مسودة» غير مصروفة (للعرض التجريبي)
 * لا يُنشئ عمولات (وُلِّدت فعلياً من فواتير/تحصيلات المهام 2 و3-b).
 * تشغيل: bun scripts/seed-people.ts — متكرر الأمان: يتخطى إذا صفوف الحضور > 20.
 */
import { PrismaClient } from "@prisma/client";
import {
  markAttendanceBatch,
  saveAdvance,
  generatePayroll,
  commitPayroll,
  currentPeriod,
  type AttendanceStatus,
} from "../src/domain/payroll";

const db = new PrismaClient();

function dayStr(offsetFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetFromToday);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const attCount = await db.attendance.count();
  if (attCount > 20) {
    console.log(`⏭️  تخطي seed-people — يوجد ${attCount} صف حضور مسبقاً`);
    return;
  }

  const employees = await db.employee.findMany({ where: { isArchived: false }, orderBy: { id: "asc" } });
  if (employees.length === 0) {
    console.log("❌ لا موظفون — شغّل scripts/seed.ts الأساسي أولاً");
    return;
  }
  const box = await db.cashbox.findFirst({ where: { isDefault: true } });
  if (!box) {
    console.log("❌ لا صندوق افتراضي");
    return;
  }

  // آخر 14 يوماً: days[0]=قبل 13 يوماً … days[13]=اليوم
  const offsets = Array.from({ length: 14 }, (_, i) => i - 13);

  // خطة الحضور: لكل موظف خريطة offset → {status, lateMinutes?}
  const plan: Record<number, Record<number, { status: AttendanceStatus; lateMinutes?: number }>> = {
    // محمد (بائع): غياب واحد + تأخيران
    1: { "-10": { status: "absent" }, "-12": { status: "late", lateMinutes: 40 }, "-3": { status: "late", lateMinutes: 25 } },
    // سالم (كاشير): انتظام كامل
    2: {},
    // وليد (عامل مخزن): إجازة يوم + نص يوم
    3: { "-9": { status: "leave" }, "-1": { status: "half" } },
    // أنس (سائق): تأخير + غياب
    4: { "-8": { status: "late", lateMinutes: 20 }, "-4": { status: "absent" } },
    // رائد (حارس): نص يوم
    5: { "-2": { status: "half" } },
  };

  // 1) الحضور — دفعة لكل يوم
  let attSaved = 0;
  for (const off of offsets) {
    const entries: Array<{ employeeId: number; status: AttendanceStatus; lateMinutes?: number }> = [];
    for (const emp of employees) {
      const p = plan[emp.id]?.[off];
      entries.push({ employeeId: emp.id, status: p?.status ?? "present", lateMinutes: p?.lateMinutes ?? 0 });
    }
    const res = await markAttendanceBatch(db, dayStr(off), entries);
    attSaved += res.saved;
  }
  console.log(`✅ حضور: ${attSaved} صف (14 يوماً × ${employees.length} موظفين)`);

  // 2) السحبيات — 2 في الشهر الماضي (تُخصم مع مسيره) + 2 في الشهر الحالي (تُخصم من مسير الشهر الجاري)
  const advancesSpec: Array<{ employeeId: number; amount: number; offset: number; description: string }> = [
    { employeeId: 3, amount: 8000, offset: -11, description: "سحبية — ظرف عائلي" },
    { employeeId: 4, amount: 12000, offset: -7, description: "سحبية — إصلاح سيارة" },
    { employeeId: 1, amount: 15000, offset: -4, description: "سحبية — قرض شخصي" },
    { employeeId: 2, amount: 10000, offset: -2, description: "سحبية — مصاريف مدرسية" },
  ];
  for (const a of advancesSpec) {
    await saveAdvance(db, {
      employeeId: a.employeeId,
      amount: a.amount,
      cashboxId: box.id,
      txDate: dayStr(a.offset),
      description: a.description,
      createdAt: `${dayStr(a.offset)}T10:00:00.000Z`,
    });
  }
  console.log(`✅ سحبيات: ${advancesSpec.length} (بإجمالي ${advancesSpec.reduce((s, a) => s + a.amount, 0)} ر.ي)`);

  // 3) مسير الشهر الماضي: توليد + صرف (مدفوع من الصندوق)
  const now = new Date();
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastPeriod = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, "0")}`;
  const lastDayOfPrev = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const paidAt = `${lastPeriod}-${String(lastDayOfPrev).padStart(2, "0")}`;

  await generatePayroll(db, { period: lastPeriod });
  const committed = await commitPayroll(db, {
    period: lastPeriod,
    cashboxId: box.id,
    txDate: paidAt,
    createdAt: `${paidAt}T12:00:00.000Z`,
  });
  console.log(
    `✅ مسير ${lastPeriod} مُصروف: ${committed.paid} موظفاً بإجمالي ${committed.totalNet.toLocaleString("en-US")} ر.ي من «${committed.cashbox.name}»`
  );
  for (const r of committed.rows) {
    console.log(`   • ${r.name}: صافي ${r.net.toLocaleString("en-US")}`);
  }

  // 4) مسير الشهر الحالي: مسودة فقط (غير مصروفة — للعرض)
  const cur = currentPeriod();
  const draft = await generatePayroll(db, { period: cur });
  console.log(`✅ مسير ${cur} مسودة (غير مصروف): ${draft.rows.length} موظفاً بإجمالي ${draft.totals.net.toLocaleString("en-US")} ر.ي`);
  for (const r of draft.rows) {
    const c = (r as { calc: { absentDays: number; lateDeductionStored: number; advancesApplied: number; net: number } }).calc;
    console.log(
      `   • ${r.name}: غياب ${c.absentDays} — تأخير/نص ${c.lateDeductionStored} — سحبيات ${c.advancesApplied} — صافي ${c.net.toLocaleString("en-US")}`
    );
  }
}

main()
  .catch((e) => {
    console.error("فشل seed-people:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
