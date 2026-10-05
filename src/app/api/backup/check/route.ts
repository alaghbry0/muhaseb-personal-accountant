import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dbFileSize, TABLES_PARENT_FIRST } from "@/domain/backup";

export const dynamic = "force-dynamic";

interface CountDelegate {
  count: (args?: unknown) => Promise<number>
}
type CountDb = Record<string, CountDelegate>

/** فحص سلامة القاعدة (FR-13-07): PRAGMA integrity_check + foreign_key_check + عدّادات + الحجم */
async function runCheck() {
  const integrityRows = (await db.$queryRawUnsafe("PRAGMA integrity_check")) as Array<{
    integrity_check?: string
  }>
  const integrity = integrityRows[0]?.integrity_check ?? "unknown"
  const fkRows = (await db.$queryRawUnsafe("PRAGMA foreign_key_check")) as unknown[]

  const countDb = db as unknown as CountDb
  const counts: Record<string, number> = {}
  for (const t of TABLES_PARENT_FIRST) {
    counts[t] = await countDb[t].count()
  }

  const size = await dbFileSize()
  return {
    integrity,
    fkViolations: fkRows.length,
    ok: integrity === "ok" && fkRows.length === 0,
    dbSizeBytes: size,
    counts,
    checkedAt: new Date().toISOString(),
  }
}

/**
 * POST /api/backup/check — فحص سلامة القاعدة (زر «حساب» في شاشة حول).
 */
export async function POST() {
  try {
    return NextResponse.json(await runCheck())
  } catch (e) {
    console.error("POST /api/backup/check error:", e)
    return NextResponse.json({ error: "تعذر فحص القاعدة" }, { status: 500 })
  }
}

/** GET = نفس الفحص (لتغذية إحصاءات شاشة «حول») */
export async function GET() {
  try {
    return NextResponse.json(await runCheck())
  } catch (e) {
    console.error("GET /api/backup/check error:", e)
    return NextResponse.json({ error: "تعذر فحص القاعدة" }, { status: 500 })
  }
}
