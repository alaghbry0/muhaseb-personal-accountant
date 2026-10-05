/**
 * Domain — سجل التدقيق (FR-12-04) — Task 5.
 * logAudit: كتابة صف audit_log خفيفة ولا تُفشل العملية الأساسية أبداً.
 * user_id=1 (المدير) — التطبيق شخصي بمستخدم مدير واحد في هذه النسخة.
 */
import type { Prisma, PrismaClient } from "@prisma/client"

type AnyDb = PrismaClient | Prisma.TransactionClient

export interface AuditEntry {
  action: string
  entity?: string
  entityId?: number
  details?: unknown
}

/** كتابة حدث تدقيق — أخطاؤها تُسجَّل فقط ولا ترمى */
export async function logAudit(db: AnyDb, entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: 1,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        details:
          entry.details === undefined || entry.details === null
            ? null
            : JSON.stringify(entry.details),
        at: new Date().toISOString(),
      },
    })
  } catch (e) {
    console.error("audit log failed:", e)
  }
}

/** تسميات عربية لأحداث التدقيق (تُستخدم في شاشة السجل والفلاتر) */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  invoice_create: "إنشاء مستند",
  invoice_convert_held: "إتمام فاتورة معلّقة",
  voucher_create: "إنشاء سند",
  payroll_commit: "صرف مسير رواتب",
  commission_payout: "صرف عمولات",
  backup_export: "تصدير نسخة احتياطية",
  backup_restore: "استعادة نسخة احتياطية",
  product_create: "إنشاء صنف",
  product_update: "تعديل صنف",
  stocktake_commit: "اعتماد جرد",
  stock_transfer: "تحويل مخزني",
  installment_reschedule: "إعادة جدولة أقساط",
  settings_update: "تعديل إعدادات",
  exchange_rate_update: "تحديث سعر صرف",
  cashbox_create: "إنشاء صندوق",
}

/** لون شريحة الحدث في الواجهة */
export const AUDIT_ACTION_COLORS: Record<string, string> = {
  invoice_create: "#22D3EE",
  invoice_convert_held: "#34D399",
  voucher_create: "#34D399",
  payroll_commit: "#FBBF24",
  commission_payout: "#FBBF24",
  backup_export: "#94A3B8",
  backup_restore: "#F87171",
  product_create: "#22D3EE",
  product_update: "#22D3EE",
  stocktake_commit: "#FBBF24",
  stock_transfer: "#94A3B8",
  installment_reschedule: "#F87171",
  settings_update: "#94A3B8",
  exchange_rate_update: "#FBBF24",
  cashbox_create: "#34D399",
}
