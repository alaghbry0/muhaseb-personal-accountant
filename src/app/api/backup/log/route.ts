import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** تسميات أنواع النسخ (FR-11-06) */
export const BACKUP_KIND_LABELS: Record<string, string> = {
  manual: "يدوي",
  auto: "تلقائي",
  cloud: "سحابي",
  pre_restore: "قبل الاستعادة",
};

/**
 * GET /api/backup/log?limit=30 — سجل النسخ الاحتياطية:
 * النوع، التاريخ، اسم الملف، الحجم، الحالة. الأحدث أولاً.
 */
export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 30) || 30));
    const rows = await db.backupLog.findMany({
      orderBy: { at: "desc" },
      take: limit,
      include: { user: { select: { displayName: true } } },
    });
    return NextResponse.json({
      logs: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        kindLabel: BACKUP_KIND_LABELS[r.kind] ?? r.kind,
        fileName: r.fileName,
        fileSize: r.fileSize,
        checksum: r.checksum,
        status: r.status,
        at: r.at,
        userName: r.user?.displayName ?? null,
      })),
    });
  } catch (e) {
    console.error("GET /api/backup/log error:", e);
    return NextResponse.json({ error: "تعذر تحميل سجل النسخ" }, { status: 500 });
  }
}
