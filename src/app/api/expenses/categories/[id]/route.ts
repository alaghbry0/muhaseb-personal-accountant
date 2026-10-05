import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/expenses/categories/[id] — تعديل اسم فئة.
 * DELETE — حذف فئة غير مستخدمة؛ المستخدمة تُؤرشف فقط (لا حذف مع حركات).
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "أدخل اسم الفئة" }, { status: 400 });
    const row = await db.expenseCategory.update({ where: { id: Number(id) }, data: { name } });
    return NextResponse.json({ category: row });
  } catch (e) {
    console.error("PATCH /api/expenses/categories/[id] error:", e);
    return NextResponse.json({ error: "تعذر تعديل الفئة" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const catId = Number(id);
    const used = await db.cashTx.count({ where: { expenseCategoryId: catId } });
    if (used > 0) {
      await db.expenseCategory.update({ where: { id: catId }, data: { isArchived: true } });
      return NextResponse.json({ archived: true, used });
    }
    await db.expenseCategory.delete({ where: { id: catId } });
    return NextResponse.json({ deleted: true });
  } catch (e) {
    console.error("DELETE /api/expenses/categories/[id] error:", e);
    return NextResponse.json({ error: "تعذر حذف الفئة" }, { status: 500 });
  }
}
