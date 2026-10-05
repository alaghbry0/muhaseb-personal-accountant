"use client";

/**
 * تخزين واستعادة البيانات (FR-11 — دليل 12/01):
 * - «حفظ نسخة احتياطية من البيانات إلى جهازي»: تنزيل JSON كامل (كل الجداول + metadata).
 * - «استعادة البيانات من جهازي»: اختيار ملف → فحص السلامة → تحذير أحمر (FR-11-02)
 *   «سيتم استبدال جميع البيانات الحالية — لا يمكن التراجع» → استعادة ذرّية مع نسخة أمان تلقائية.
 * - سجل النسخ (النوع/التاريخ/الحجم/الحالة).
 * - النسخ السحابي (Supabase): معطّل بصدق — يتطلب مفتاح Supabase خاصتك.
 */
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download, Upload, History, Cloud, ShieldAlert, FileJson, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { getJson, postJson } from "@/lib/api";
import { formatAmount, formatDateTimeDisplay } from "@/lib/format";
import { AppHeader, AppCard, PrimaryButton, EmptyState, StatusChip } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { cn } from "@/lib/utils";

interface BackupLogRow {
  id: number;
  kind: string;
  kindLabel: string;
  fileName: string | null;
  fileSize: number | null;
  checksum: string | null;
  status: string | null;
  at: string;
  userName: string | null;
}

interface BackupFileMeta {
  kind: string;
  app: string;
  version: string;
  schemaVersion: number;
  date: string;
  counts: Record<string, number>;
  checksum: string;
}

function sizeLabel(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
}

const KIND_CHIP: Record<string, { label: string; cls: string }> = {
  manual: { label: "يدوي", cls: "bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/30" },
  auto: { label: "تلقائي", cls: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30" },
  cloud: { label: "سحابي", cls: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30" },
  pre_restore: { label: "قبل الاستعادة", cls: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30" },
};

export default function SettingsBackupScreen() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const logQ = useQuery<{ logs: BackupLogRow[] }>({
    queryKey: ["backup", "log"],
    queryFn: () => getJson<{ logs: BackupLogRow[] }>("/api/backup/log?limit=30"),
  });

  // ═══ تصدير ═══
  const [exporting, setExporting] = useState(false);
  async function doExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/backup/export");
      if (!res.ok) {
        toast.error("تعذر إنشاء النسخة الاحتياطية");
        return;
      }
      const fileName =
        res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ??
        `muhasib-backup-${Date.now()}.json`;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("تم تنزيل النسخة الاحتياطية إلى جهازك", { description: fileName });
      qc.invalidateQueries({ queryKey: ["backup", "log"] });
    } catch {
      toast.error("تعذر تنزيل النسخة");
    } finally {
      setExporting(false);
    }
  }

  // ═══ استعادة ═══
  const [pendingFile, setPendingFile] = useState<{ raw: string; meta: BackupFileMeta } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as { meta?: BackupFileMeta; tables?: unknown };
      if (!parsed.meta || !parsed.tables) {
        setFileError("الملف ليس نسخة احتياطية صالحة من «المُحاسِب الشخصي»");
        return;
      }
      if (parsed.meta.kind !== "muhasib-backup") {
        setFileError("هذا الملف ليس نسخة احتياطية من هذا التطبيق");
        return;
      }
      if (parsed.meta.schemaVersion !== 1) {
        setFileError(`إصدار مخطط الملف (${parsed.meta.schemaVersion}) غير مدعوم`);
        return;
      }
      setPendingFile({ raw, meta: parsed.meta });
    } catch {
      setFileError("تعذر قراءة الملف — تأكد أنه ملف JSON سليم");
    }
  }

  async function doRestore() {
    if (!pendingFile) return;
    setRestoring(true);
    try {
      const res = await postJson<{ ok: boolean; total: number; preRestoreFile: string }>(
        "/api/backup/restore",
        { file: pendingFile.raw }
      );
      toast.success(`تمت الاستعادة بنجاح (${res.total} سجلاً)`, {
        description: `نسخة أمان تلقائية: ${res.preRestoreFile}`,
      });
      setPendingFile(null);
      qc.invalidateQueries();
      // إعادة تحميل التطبيق لجلب بيانات إقلاع جديدة بالكامل
      setTimeout(() => window.location.reload(), 1600);
    } catch {
      /* توست من api.ts — لم تُمسح أي بيانات */
    } finally {
      setRestoring(false);
    }
  }

  const totalRecords = pendingFile
    ? Object.values(pendingFile.meta.counts).reduce((s, n) => s + n, 0)
    : 0;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="تخزين واستعادة البيانات" />
      <div className="flex flex-1 flex-col gap-4 p-4 pb-8">
        {/* التحذير الإرشادي (دليل 12/01) */}
        <AppCard noPad className="flex items-start gap-2 border-[#FBBF24]/30 bg-[#FBBF24]/5 p-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#FBBF24]" aria-hidden />
          <p className="text-[12px] leading-5 text-muted-foreground">
            النسخ الاحتياطي والاستعادة عمليتان متسلسلتان — أكمل العملية الواحدة قبل بدء الأخرى.
            الاستعادة تستبدل البيانات الحالية بالكامل (مع نسخة أمان تلقائية قبلها).
          </p>
        </AppCard>

        {/* تصدير */}
        <AppCard noPad className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-[#22D3EE]/15">
              <Download className="size-5 text-[#22D3EE]" aria-hidden />
            </span>
            <div className="flex flex-1 flex-col">
              <span className="text-[15px] font-extrabold text-foreground">حفظ نسخة احتياطية إلى جهازي</span>
              <span className="text-[12px] text-muted-foreground">
                ملف JSON كامل: كل الفواتير والأصناف والأطراف والحركات — مع فحص سلامة (Checksum)
              </span>
            </div>
          </div>
          <PrimaryButton block loading={exporting} onClick={doExport}>
            <Download className="size-4" aria-hidden />
            أخذ نسخة احتياطية الآن
          </PrimaryButton>
        </AppCard>

        {/* استعادة */}
        <AppCard noPad className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-[#34D399]/15">
              <Upload className="size-5 text-[#34D399]" aria-hidden />
            </span>
            <div className="flex flex-1 flex-col">
              <span className="text-[15px] font-extrabold text-foreground">استعادة البيانات من جهازي</span>
              <span className="text-[12px] text-muted-foreground">
                اختر ملف نسخة صادر من هذا التطبيق — يُفحص قبل التنفيذ
              </span>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={onFileChosen}
            aria-label="اختيار ملف النسخة الاحتياطية"
          />
          <PrimaryButton block variant="outline" onClick={() => fileRef.current?.click()}>
            <FileJson className="size-4" aria-hidden />
            اختيار ملف النسخة…
          </PrimaryButton>
          {fileError ? (
            <p className="rounded-xl border border-[#F87171]/30 bg-[#F87171]/10 p-2.5 text-[12.5px] font-medium text-[#F87171]">
              {fileError}
            </p>
          ) : null}
        </AppCard>

        {/* سجل النسخ */}
        <section className="flex flex-col gap-2" aria-label="سجل النسخ">
          <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-bold text-muted-foreground">
            <History className="size-3.5" aria-hidden />
            سجل النسخ
          </h2>
          <AppCard noPad className="overflow-hidden">
            {logQ.isLoading ? (
              <p className="py-4 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
            ) : (logQ.data?.logs ?? []).length === 0 ? (
              <div className="p-4">
                <EmptyState icon={History} message="لا نسخ مسجلة بعد" hint="خذ نسختك الأولى الآن" />
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto scrollbar-slim">
                {(logQ.data?.logs ?? []).map((r, i, arr) => {
                  const chip = KIND_CHIP[r.kind] ?? { label: r.kindLabel, cls: "bg-muted text-muted-foreground border-border" };
                  return (
                    <div
                      key={r.id}
                      className={cn(
                        "flex items-center gap-3 px-3.5 py-3",
                        i < arr.length - 1 && "border-b border-border/40"
                      )}
                    >
                      <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold", chip.cls)}>
                        {chip.label}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[13px] font-medium text-foreground" dir="ltr">
                          {r.fileName ?? "—"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDateTimeDisplay(r.at)} {r.userName ? `• ${r.userName}` : ""}
                        </span>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="font-num text-[12px] text-muted-foreground">{sizeLabel(r.fileSize)}</span>
                        {r.status === "ok" ? (
                          <span className="flex items-center gap-1 text-[10.5px] font-bold text-[#34D399]">
                            <CheckCircle2 className="size-3" aria-hidden />
                            سليمة
                          </span>
                        ) : (
                          <StatusChip status="late" label={r.status ?? "—"} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AppCard>
          <p className="px-1 text-[11.5px] leading-5 text-muted-foreground">
            تُحفظ آخر 7 نسخ أمان محلية تلقائياً (قبل كل استعادة) في مجلد قاعدة البيانات.
          </p>
        </section>

        {/* السحاب */}
        <AppCard noPad className="flex flex-col gap-2 p-4 opacity-70">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-xl bg-muted">
                <Cloud className="size-5 text-muted-foreground" aria-hidden />
              </span>
              <div className="flex flex-col">
                <span className="text-[15px] font-extrabold text-foreground">النسخ السحابي (Supabase)</span>
                <span className="text-[12px] text-muted-foreground">
                  رفع مشفّر AES-256 إلى مساحتك الخاصة
                </span>
              </div>
            </div>
            <span className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground">
              مغلق
            </span>
          </div>
          <p className="text-[11.5px] leading-5 text-muted-foreground">
            يتطلب مفتاح Supabase خاصتك — ميزة اختيارية. النسخة الحالية تعمل محلياً بالكامل: صدّر الملف وخزّنه
            بنفسك على أي وسط تخزين (واتساب، بريد، سحابتك).
          </p>
        </AppCard>
      </div>

      {/* لوحة تأكيد الاستعادة — حمراء (FR-11-02) */}
      <PosSheet
        open={!!pendingFile}
        onOpenChange={(o) => {
          if (!o) setPendingFile(null);
        }}
        title="تأكيد الاستعادة"
        description="إجراء لا يمكن التراجع عنه"
      >
        {pendingFile ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5 rounded-2xl border border-[#F87171]/40 bg-[#F87171]/10 p-3.5">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-[#F87171]" aria-hidden />
              <p className="text-[13.5px] font-bold leading-6 text-[#F87171]">
                سيتم استبدال جميع البيانات الحالية — لا يمكن التراجع.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-xl bg-muted/50 p-3 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">تاريخ النسخة</span>
                <span className="font-medium text-foreground">{formatDateTimeDisplay(pendingFile.meta.date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إصدار التطبيق</span>
                <span className="font-num font-medium text-foreground" dir="ltr">v{pendingFile.meta.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي السجلات</span>
                <span className="font-num font-medium text-foreground">{formatAmount(totalRecords, { decimals: 0, showSymbol: false })}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="shrink-0 text-muted-foreground">أبرز المحتويات</span>
                <span className="text-left font-medium text-foreground">
                  {pendingFile.meta.counts.invoice ?? 0} فاتورة • {pendingFile.meta.counts.product ?? 0} صنف •{" "}
                  {pendingFile.meta.counts.customer ?? 0} عميل
                </span>
              </div>
            </div>
            <p className="text-[12px] leading-5 text-muted-foreground">
              تُنشأ نسخة أمان تلقائية من بياناتك الحالية قبل الاستبدال — يمكنك الرجوع إليها يدوياً عند الحاجة.
            </p>
            <div className="flex gap-2.5">
              <PrimaryButton
                variant="outline"
                className="flex-1"
                onClick={() => setPendingFile(null)}
                disabled={restoring}
              >
                إلغاء
              </PrimaryButton>
              <PrimaryButton variant="danger" className="flex-1" loading={restoring} onClick={doRestore}>
                {restoring ? "جارٍ الاستعادة…" : "استبدال البيانات"}
              </PrimaryButton>
            </div>
          </div>
        ) : null}
      </PosSheet>
    </div>
  );
}
