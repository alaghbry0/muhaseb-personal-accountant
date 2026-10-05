/**
 * Domain — النسخ الاحتياطي والاستعادة (FR-11) — Task 5.
 *
 * تصدير: تفريغ كل الجداول (34) إلى JSON مع metadata (إصدار/تاريخ/عدّادات/checksum).
 * استعادة: داخل معاملة واحدة — نسخة أمان (pre_restore) أولاً، ثم فصل الربط الدائري
 * (Invoice↔Quotation)، فمسح كل الجداول (الأبناء أولاً)، فالإدراج بالمعرّفات الأصلية
 * (الآباء أولاً)، ثم إعادة ربط الفاتورة↔العرض.
 */
import type { Prisma, PrismaClient } from "@prisma/client"
import { createHash } from "crypto"
import { promises as fs } from "fs"
import path from "path"

type AnyDb = PrismaClient | Prisma.TransactionClient
export type TableRows = Record<string, unknown>[]
export type TableMap = Record<string, TableRows>

export const BACKUP_KIND = "muhasib-backup"
export const SCHEMA_VERSION = 1
export const APP_VERSION = "1.0.0"

/** أسماء الجداول بترتيب الإدراج: الآباء أولاً (الأبناء تشير إليهم بـ FK) */
export const TABLES_PARENT_FIRST = [
  "currency",
  "category",
  "unit",
  "warehouse",
  "expenseCategory",
  "customer",
  "supplier",
  "salesRep",
  "employee",
  "attendance", // بعد الموظف — attendance.employee_id FK
  "cashbox",
  "appUser",
  "company",
  "settings",
  "exchangeRate",
  "product",
  "productPrice",
  "stockLevel",
  "batch",
  // فاتورة/عرض: الربط الدائري يُستكمل بعد الإدراج (انظر restoreTableMap)
  "invoice",
  "quotation",
  "quotationItem",
  "invoiceItem",
  "stockMovement",
  "cashTx",
  "shift",
  "installmentPlan",
  "installment",
  "commission",
  "salaryPeriod",
  "stocktake",
  "stocktakeLine",
  "auditLog",
  "backupLog",
] as const

/** ترتيب المسح: الأبناء أولاً (عكس ترتيب الإدراج) */
export const TABLES_CHILDREN_FIRST = [...TABLES_PARENT_FIRST].reverse()

type FindManyDb = Record<string, { findMany: () => Promise<Record<string, unknown>[]> }>
type WriteDb = Record<string, {
  deleteMany: (args?: unknown) => Promise<unknown>
  createMany: (args: { data: unknown[] }) => Promise<unknown>
}>

/** تفريغ كل الجداول إلى خريطة (أسماء نماذج Prisma camelCase) */
export async function dumpAllTables(db: AnyDb): Promise<TableMap> {
  const delegates = db as unknown as FindManyDb
  const tables: TableMap = {}
  for (const t of TABLES_PARENT_FIRST) {
    tables[t] = await delegates[t].findMany()
  }
  return tables
}

/** checksum للمحتويات — md5 على تسلسل JSON القياسي */
export function computeChecksum(tables: TableMap): string {
  return createHash("md5").update(JSON.stringify(tables), "utf8").digest("hex")
}

export interface BackupMeta {
  kind: string
  app: string
  version: string
  schemaVersion: number
  date: string
  counts: Record<string, number>
  checksum: string
}

/** بناء metadata كاملة لنسخة احتياطية */
export function buildMeta(tables: TableMap): BackupMeta {
  const counts: Record<string, number> = {}
  for (const [k, rows] of Object.entries(tables)) counts[k] = rows.length
  return {
    kind: BACKUP_KIND,
    app: "المُحاسِب الشخصي",
    version: APP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    date: new Date().toISOString(),
    counts,
    checksum: computeChecksum(tables),
  }
}

/** تحويل createdAt/updatedAt من نص ISO إلى Date (كل حقول DateTime في السكيما هذان فقط) */
export function reviveDates(rows: TableRows): TableRows {
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row }
    for (const key of ["createdAt", "updatedAt"]) {
      const v = out[key]
      if (typeof v === "string") out[key] = new Date(v)
    }
    return out
  })
}

export interface RestoreResult {
  restored: Record<string, number>
  preRestoreFile: string
}

/**
 * استعادة خريطة جداول داخل معاملة — تمسح كل شيء وتعيد الإدراج بالمعرّفات الأصلية.
 * يجب أن تكون البيانات متحققاً منها قبل الاستدعاء (validateBackupPayload).
 */
export async function restoreTableMap(tx: Prisma.TransactionClient, tables: TableMap): Promise<Record<string, number>> {
  const dbw = tx as unknown as WriteDb

  // 1) فك الربط الدائري قبل المسح
  await tx.invoice.updateMany({ data: { quotationId: null } })
  await tx.quotation.updateMany({ data: { invoiceId: null } })

  // 2) مسح الأبناء أولاً
  for (const t of TABLES_CHILDREN_FIRST) {
    if (t === "invoice" || t === "quotation") {
      // أُعيد فك الربط أعلاه — المسح الآن آمن
    }
    await dbw[t].deleteMany({})
  }

  // 3) الإدراج بالآباء أولاً — بمعرّفات أصلية (الربط الدائري مؤجل)
  const restored: Record<string, number> = {}
  for (const t of TABLES_PARENT_FIRST) {
    const rows = tables[t] ?? []
    if (rows.length === 0) continue
    const clean = reviveDates(rows).map((row) => {
      const r = { ...row }
      if (t === "invoice") r.quotationId = null
      if (t === "quotation") r.invoiceId = null
      return r
    })
    await dbw[t].createMany({ data: clean })
    restored[t] = clean.length
  }

  // 4) إعادة الربط الدائري Invoice↔Quotation
  for (const row of tables.invoice ?? []) {
    if (row.quotationId != null) {
      await tx.invoice.update({
        where: { id: row.id as number },
        data: { quotationId: row.quotationId as number },
      })
    }
  }
  for (const row of tables.quotation ?? []) {
    if (row.invoiceId != null) {
      await tx.quotation.update({
        where: { id: row.id as number },
        data: { invoiceId: row.invoiceId as number },
      })
    }
  }
  return restored
}

export interface BackupValidation {
  meta: BackupMeta
  tables: TableMap
}

/** فحص سلامة ملف النسخة (FR-11-02): النوع + إصدار المخطط + Checksum + العدّادات */
export function validateBackupPayload(raw: string): BackupValidation {
  let parsed: { meta?: BackupMeta; tables?: TableMap }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new BackupError("الملف ليس JSON صالحاً — تأكد من اختيار ملف نسخة صحيح")
  }
  const meta = parsed.meta
  const tables = parsed.tables
  if (!meta || !tables || typeof tables !== "object") {
    throw new BackupError("بنية الملف غير صحيحة — ليس ملف نسخة احتياطية من «المُحاسِب الشخصي»")
  }
  if (meta.kind !== BACKUP_KIND) {
    throw new BackupError("هذا الملف ليس نسخة احتياطية من هذا التطبيق")
  }
  if (meta.schemaVersion !== SCHEMA_VERSION) {
    throw new BackupError(`إصدار مخطط الملف (${meta.schemaVersion}) غير مدعوم — هذا التطبيق يدعم ${SCHEMA_VERSION}`)
  }
  // فحص العدّادات (سلامة البنية)
  for (const [t, n] of Object.entries(meta.counts ?? {})) {
    const actual = (tables[t] ?? []).length
    if (actual !== n) {
      throw new BackupError(`عدّاد الجدول «${t}» غير مطابق (${actual} ≠ ${n}) — الملف غير مكتمل`)
    }
  }
  // فحص Checksum (سلامة المحتوى)
  const checksum = computeChecksum(tables)
  if (meta.checksum && checksum !== meta.checksum) {
    throw new BackupError("فحص السلامة (Checksum) فشل — الملف تالف أو عُدِّل يدوياً")
  }
  return { meta, tables }
}

export class BackupError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

/** مجلد النسخ المحلية (بجانب ملف قاعدة البيانات) */
export function backupsDir(): string {
  const dbFile = (process.env.DATABASE_URL ?? "file:db/custom.db").replace(/^file:/, "")
  return path.join(path.dirname(path.resolve(dbFile)), "backups")
}

/** حفظ نسخة أمان محلية (قبل الاستعادة) + الاحتفاظ بآخر 7 ملفات فقط (FR-11-05) */
export async function saveLocalBackup(content: string, prefix: string): Promise<{ fileName: string; size: number }> {
  const dir = backupsDir()
  await fs.mkdir(dir, { recursive: true })
  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`
  const fileName = `${prefix}-${stamp}.json`
  await fs.writeFile(path.join(dir, fileName), content, "utf8")
  // الاحتفاظ بآخر 7 نسخ محلية
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort()
  while (files.length > 7) {
    const oldest = files.shift()
    if (oldest) await fs.rm(path.join(dir, oldest), { force: true })
  }
  return { fileName, size: Buffer.byteLength(content, "utf8") }
}

/** حجم ملف قاعدة البيانات بالبايت */
export async function dbFileSize(): Promise<number> {
  const dbFile = (process.env.DATABASE_URL ?? "file:db/custom.db").replace(/^file:/, "")
  try {
    const st = await fs.stat(dbFile)
    return st.size
  } catch {
    return 0
  }
}
