import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPlanFromInvoice, createStandalonePlan, listPlans } from "@/domain/installments";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/**
 * GET /api/installments/plans?customerId=&status=&limit=
 * قائمة الخطط مع الرصيد المتبقي والاستحقاق القادم وعدد المتأخر.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const plans = await listPlans(db, {
      customerId: sp.get("customerId") ? Number(sp.get("customerId")) : undefined,
      status: sp.get("status") || undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    const active = plans.filter((p) => p.status === "active" || p.status === "defaulted");

    // مستحق الشهر الحالي (أقساط غير مسددة باستحقاق ضمن الشهر)
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
    const dueThisMonthRows = await db.installment.findMany({
      where: {
        status: { in: ["pending", "partial"] },
        dueDate: { gte: monthStart, lt: monthEnd },
        plan: { status: { in: ["active", "defaulted"] } },
      },
      select: { amount: true, paidAmount: true },
    });
    const dueThisMonth = dueThisMonthRows.reduce((s, r) => s + (r.amount - r.paidAmount), 0);

    return NextResponse.json({
      plans,
      stats: {
        activeCount: active.length,
        totalRemaining: active.reduce((s, p) => s + p.remaining, 0),
        lateCount: active.reduce((s, p) => s + p.lateCount, 0),
        dueThisMonth: Math.round(dueThisMonth * 100) / 100,
      },
    });
  } catch (e) {
    console.error("GET /api/installments/plans error:", e);
    return NextResponse.json({ error: "تعذر تحميل الخطط" }, { status: 500 });
  }
}

/**
 * POST /api/installments/plans — إنشاء خطة (FR-05-01)
 * Body (من فاتورة آجلة):
 *   { source: 'invoice', invoiceId, months, downPayment?, firstDue, cycle?, cashboxId?, txDate? }
 * Body (مبلغ مخصص بدون فاتورة):
 *   { source: 'custom', customerId, principal, months, downPayment?, firstDue, cycle?, currencyId?, exchangeRate?, cashboxId?, txDate? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const source = body.source === "custom" ? "custom" : body.invoiceId ? "invoice" : null;
    if (!source) {
      return NextResponse.json(
        { error: "حدد مصدر الخطة: فاتورة آجلة أو مبلغ مخصص" },
        { status: 400 }
      );
    }
    const common = {
      months: Number(body.months),
      downPayment: body.downPayment != null ? Number(body.downPayment) : 0,
      firstDue: String(body.firstDue ?? ""),
      cycle: body.cycle === "weekly" ? ("weekly" as const) : ("monthly" as const),
      cashboxId: body.cashboxId != null ? Number(body.cashboxId) : null,
      txDate: body.txDate || undefined,
    };
    const result =
      source === "invoice"
        ? await createPlanFromInvoice(db, { ...common, invoiceId: Number(body.invoiceId) })
        : await createStandalonePlan(db, {
            ...common,
            customerId: Number(body.customerId),
            principal: Number(body.principal),
            currencyId: body.currencyId != null ? Number(body.currencyId) : null,
            exchangeRate: body.exchangeRate != null ? Number(body.exchangeRate) : null,
            notes: body.notes || null,
          });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/installments/plans error:", e);
    return NextResponse.json({ error: "تعذر إنشاء خطة التقسيط" }, { status: 500 });
  }
}
