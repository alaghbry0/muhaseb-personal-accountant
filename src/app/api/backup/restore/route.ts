import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/domain/audit";
import {
  dumpAllTables,
  buildMeta,
  validateBackupPayload,
  restoreTableMap,
  saveLocalBackup,
  BackupError,
} from "@/domain/backup";

export const dynamic = "force-dynamic";

/**
 * POST /api/backup/restore — استعادة من ملف نسخة (FR-11-02):
 * Body: { file: <نص الملف JSON الخام> }
 * 1) فحص السلامة (النوع + إصدار المخطط + Checksum + العدّادات) — 400 برسالة عربية عند الفشل.
 * 2) نسخة أمان تلقائية للبيانات الحالية (pre_restore) قبل أي مسح.
 * 3) استبدال ذرّي داخل معاملة واحدة: فك الربط الدائري ← مسح ← إدراج بالمعرّفات ← إعادة الربط.
 * 4) تسجيل في سجل التدقيق + backup_log.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { file?: string };
    const raw = String(body.file ?? "");
    if (!raw) {
      return NextResponse.json({ error: "أرفق نص ملف النسخة" }, { status: 400 });
    }

    // 1) فحص السلامة
    let validation;
    try {
      validation = validateBackupPayload(raw);
    } catch (e) {
      if (e instanceof BackupError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
    const { meta, tables } = validation;

    // 2) نسخة أمان قبل الاستعادة
    const currentTables = await dumpAllTables(db);
    const preBody = JSON.stringify({ meta: buildMeta(currentTables), tables: currentTables });
    const pre = await saveLocalBackup(preBody, "pre-restore");
    await db.backupLog.create({
      data: {
        kind: "pre_restore",
        fileName: pre.fileName,
        fileSize: pre.size,
        status: "ok",
        at: new Date().toISOString(),
        userId: 1,
      },
    });

    // 3) الاستبدال الذرّي
    const restored = await db.$transaction(async (tx) => restoreTableMap(tx, tables));

    const total = Object.values(restored).reduce((s, n) => s + n, 0);
    await logAudit(db, {
      action: "backup_restore",
      entity: "backup",
      details: {
        date: meta.date,
        records: total,
        preRestoreFile: pre.fileName,
        counts: meta.counts,
      },
    });

    return NextResponse.json({
      ok: true,
      restored,
      total,
      preRestoreFile: pre.fileName,
      backupDate: meta.date,
    });
  } catch (e) {
    if (e instanceof BackupError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("POST /api/backup/restore error:", e);
    return NextResponse.json({ error: "تعذرت الاستعادة — لم تُمسح أي بيانات (فشلت المعاملة بأمان)" }, { status: 500 });
  }
}
