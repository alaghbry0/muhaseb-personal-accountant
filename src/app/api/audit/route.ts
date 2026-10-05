import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit?limit=100&action= — سجل التدقيق (FR-12-04):
 * الوقت، المستخدم، الإجراء، الكيان، تفاصيل JSON. الأحدث أولاً.
 */
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(300, Math.max(1, Number(sp.get("limit") ?? 100) || 100));
    const action = sp.get("action") || undefined;

    const rows = await db.auditLog.findMany({
      where: action ? { action } : undefined,
      orderBy: { at: "desc" },
      take: limit,
      include: { user: { select: { displayName: true, role: true } } },
    });

    const distinct = await db.auditLog.findMany({
      distinct: ["action"],
      orderBy: { at: "desc" },
      select: { action: true },
    });

    return NextResponse.json({
      logs: rows.map((r) => ({
        id: r.id,
        at: r.at,
        userId: r.userId,
        userName: r.user?.displayName ?? "النظام",
        action: r.action,
        entity: r.entity,
        entityId: r.entityId,
        details: r.details,
      })),
      actions: distinct.map((d) => d.action),
      total: await db.auditLog.count(),
    });
  } catch (e) {
    console.error("GET /api/audit error:", e);
    return NextResponse.json({ error: "تعذر تحميل سجل التدقيق" }, { status: 500 });
  }
}
