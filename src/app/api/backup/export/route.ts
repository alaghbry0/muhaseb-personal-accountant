import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/domain/audit";
import { dumpAllTables, buildMeta } from "@/domain/backup";

export const dynamic = "force-dynamic";

/**
 * GET /api/backup/export — تنزيل نسخة احتياطية كاملة JSON (FR-11-01، مكافئ الويب):
 * كل الجداول + metadata (الإصدار/التاريخ/العدّادات/Checksum) مع Content-Disposition.
 * يسجَّل في backup_log (kind=manual) وفي سجل التدقيق.
 */
export async function GET() {
  try {
    const tables = await dumpAllTables(db);
    const meta = buildMeta(tables);
    const body = JSON.stringify({ meta, tables });
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const fileName = `muhasib-backup-${stamp}.json`;
    const total = Object.values(meta.counts).reduce((s, n) => s + n, 0);

    await db.backupLog.create({
      data: {
        kind: "manual",
        fileName,
        fileSize: Buffer.byteLength(body, "utf8"),
        checksum: meta.checksum,
        status: "ok",
        at: new Date().toISOString(),
        userId: 1,
      },
    });
    await logAudit(db, {
      action: "backup_export",
      entity: "backup",
      details: { fileName, records: total },
    });

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "X-Backup-Records": String(total),
      },
    });
  } catch (e) {
    console.error("GET /api/backup/export error:", e);
    return NextResponse.json({ error: "تعذر إنشاء النسخة الاحتياطية" }, { status: 500 });
  }
}
