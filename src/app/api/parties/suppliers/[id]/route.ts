import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSupplierFile } from "@/domain/parties";
import { DomainError } from "@/domain/invoice-save";

export const dynamic = "force-dynamic";

/** GET /api/parties/suppliers/[id] — بطاقة مورد: بيانات + رصيد + إحصاءات + آخر فواتير الشراء */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await getSupplierFile(db, Number(id));
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof DomainError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("GET /api/parties/suppliers/[id] error:", e);
    return NextResponse.json({ error: "تعذر تحميل بطاقة المورد" }, { status: 500 });
  }
}

/** PATCH /api/parties/suppliers/[id] — تعديل مورد أو أرشفته/استعادته */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supplierId = Number(id);
    const body = await req.json();
    const supplier = await db.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier) return NextResponse.json({ error: "المورد غير موجود" }, { status: 404 });

    if (body.archive === true || body.archive === false) {
      await db.supplier.update({
        where: { id: supplierId },
        data: { isArchived: body.archive },
      });
      return NextResponse.json({ ok: true, archived: body.archive });
    }

    const name = body.name != null ? String(body.name).trim() : supplier.name;
    if (!name) return NextResponse.json({ error: "اسم المورد إلزامي" }, { status: 400 });

    await db.supplier.update({
      where: { id: supplierId },
      data: {
        name,
        phone: body.phone !== undefined ? strOrNull(body.phone) : supplier.phone,
        address: body.address !== undefined ? strOrNull(body.address) : supplier.address,
        openingBalance:
          body.openingBalance !== undefined
            ? Number(body.openingBalance) || 0
            : supplier.openingBalance,
        notes: body.notes !== undefined ? strOrNull(body.notes) : supplier.notes,
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("PATCH /api/parties/suppliers/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل المورد" }, { status: 500 });
  }
}

/** DELETE /api/parties/suppliers/[id] — ممنوع مع وجود حركات → أرشفة فقط */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supplierId = Number(id);
    const [invCount, cashCount] = await Promise.all([
      db.invoice.count({ where: { supplierId } }),
      db.cashTx.count({ where: { supplierId } }),
    ]);
    if (invCount + cashCount > 0) {
      return NextResponse.json(
        { error: "لا يمكن حذف مورد له حركات — استخدم الأرشفة" },
        { status: 400 }
      );
    }
    await db.supplier.delete({ where: { id: supplierId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/parties/suppliers/[id] error:", e);
    return NextResponse.json({ error: "تعذر حذف المورد" }, { status: 500 });
  }
}

function strOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
