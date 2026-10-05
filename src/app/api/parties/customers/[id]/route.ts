import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCustomerFile } from "@/domain/parties";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/** GET /api/parties/customers/[id] — بطاقة عميل: بيانات + رصيد + إحصاءات + آخر الفواتير + المتأخر */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getCustomerFile(db, Number(id));
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/parties/customers/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل بطاقة العميل" }, { status: 500 });
  }
}

/**
 * PATCH /api/parties/customers/[id] — تعديل بيانات العميل أو أرشفته/استعادته (FR-03-09)
 * Body: الحقول المعدلة أو { archive: true|false }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customerId = Number(id);
    const body = await req.json();
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) return NextResponse.json({ error: "العميل غير موجود" }, { status: 404 });

    if (body.archive === true || body.archive === false) {
      await db.customer.update({
        where: { id: customerId },
        data: { isArchived: body.archive },
      });
      return NextResponse.json({ ok: true, archived: body.archive });
    }

    const name = body.name != null ? String(body.name).trim() : customer.name;
    if (!name) return NextResponse.json({ error: "اسم العميل إلزامي" }, { status: 400 });

    await db.customer.update({
      where: { id: customerId },
      data: {
        name,
        phone: body.phone !== undefined ? strOrNull(body.phone) : customer.phone,
        whatsapp: body.whatsapp !== undefined ? strOrNull(body.whatsapp) : customer.whatsapp,
        address: body.address !== undefined ? strOrNull(body.address) : customer.address,
        area: body.area !== undefined ? strOrNull(body.area) : customer.area,
        creditLimit:
          body.creditLimit !== undefined
            ? Math.max(0, Number(body.creditLimit) || 0)
            : customer.creditLimit,
        openingBalance:
          body.openingBalance !== undefined
            ? Number(body.openingBalance) || 0
            : customer.openingBalance,
        notes: body.notes !== undefined ? strOrNull(body.notes) : customer.notes,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/parties/customers/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل العميل" }, { status: 500 });
  }
}

/** DELETE /api/parties/customers/[id] — ممنوع مع وجود حركات → أرشفة فقط (FR-03-09) */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const customerId = Number(id);
    const [invCount, cashCount, planCount] = await Promise.all([
      db.invoice.count({ where: { customerId } }),
      db.cashTx.count({ where: { customerId } }),
      db.installmentPlan.count({ where: { customerId } }),
    ]);
    if (invCount + cashCount + planCount > 0) {
      return NextResponse.json(
        { error: "لا يمكن حذف عميل له حركات (فواتير/سندات/خطط) — استخدم الأرشفة" },
        { status: 400 }
      );
    }
    await db.customer.delete({ where: { id: customerId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/parties/customers/[id] error:", e);
    return NextResponse.json({ error: "تعذر حذف العميل" }, { status: 500 });
  }
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
