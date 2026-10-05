import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { listExpenseCategories } from "@/domain/cash";

export const dynamic = "force-dynamic";

/**
 * GET /api/expenses/categories — فئات المصروفات مع عدّ الاستخدام.
 */
export async function GET() {
  try {
    const categories = await listExpenseCategories(db);
    return NextResponse.json({ categories });
  } catch (e) {
    console.error("GET /api/expenses/categories error:", e);
    return NextResponse.json({ error: "تعذر تحميل الفئات" }, { status: 500 });
  }
}

/**
 * POST /api/expenses/categories — إنشاء فئة.
 * Body: { name }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "أدخل اسم الفئة" }, { status: 400 });
    const existing = await db.expenseCategory.findFirst({ where: { name } });
    if (existing) return NextResponse.json({ error: "الفئة موجودة بالفعل" }, { status: 400 });
    const row = await db.expenseCategory.create({ data: { name } });
    return NextResponse.json({ category: row });
  } catch (e) {
    console.error("POST /api/expenses/categories error:", e);
    return NextResponse.json({ error: "تعذر إنشاء الفئة" }, { status: 500 });
  }
}
