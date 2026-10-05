"use client";

/**
 * حول التطبيق (FR-13-07): بطاقة التطبيق (الاسم/الإصدار/طبيعة النسخة)
 * + إحصاءات (حجم القاعدة + عدد السجلات) + زر «فحص سلامة القاعدة»
 * (PRAGMA integrity_check + foreign_key_check) + روابط تواصل + credits.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calculator, Database, ShieldCheck, MessageCircle, Mail, Globe, Loader2,
  CheckCircle2, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getJson, postJson } from "@/lib/api";
import { AppHeader, AppCard, PrimaryButton, StatusChip } from "@/components/ds";
import { useFormatD } from "@/components/settings/numbers-context";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const APP_VERSION = "1.0.0";

interface CheckResult {
  integrity: string;
  fkViolations: number;
  ok: boolean;
  dbSizeBytes: number;
  counts: Record<string, number>;
  checkedAt: string;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
}

export default function SettingsAboutScreen() {
  const fmt = useFormatD();
  const { data: stats, isLoading, refetch, isFetching } = useQuery<CheckResult>({
    queryKey: ["about", "stats"],
    queryFn: () => getJson<CheckResult>("/api/backup/check"),
  });

  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState<CheckResult | null>(null);

  async function runCheck() {
    setChecking(true);
    try {
      const res = await postJson<CheckResult>("/api/backup/check");
      setLastCheck(res);
      if (res.ok) {
        toast.success("القاعدة سليمة", { description: `integrity: ${res.integrity} • لا مخالفات مفاتيح` });
      } else {
        toast.error("توجد ملاحظات على القاعدة", {
          description: res.fkViolations > 0 ? `${res.fkViolations} مخالفة مفاتيح أجنبية` : `integrity: ${res.integrity}`,
        });
      }
    } catch {
      /* توست من api.ts */
    } finally {
      setChecking(false);
    }
  }

  const check = lastCheck ?? stats ?? null;
  const counts = check?.counts ?? {};

  const RECORDS: Array<{ label: string; key: string }> = [
    { label: "الفواتير", key: "invoice" },
    { label: "بنود الفواتير", key: "invoiceItem" },
    { label: "الأصناف", key: "product" },
    { label: "العملاء", key: "customer" },
    { label: "الموردون", key: "supplier" },
    { label: "حركات الصندوق", key: "cashTx" },
    { label: "حركات المخزون", key: "stockMovement" },
    { label: "الأقساط", key: "installment" },
    { label: "العمولات", key: "commission" },
    { label: "أسعار الصرف", key: "exchangeRate" },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="حول التطبيق" />
      <div className="flex flex-1 flex-col gap-4 p-4 pb-8">
        {/* بطاقة التطبيق */}
        <div className="bg-gradient-cyan relative overflow-hidden rounded-2xl p-5 text-[#06202B]">
          <div className="pointer-events-none absolute -left-10 -top-12 size-40 rounded-full bg-white/10" aria-hidden />
          <div className="relative flex items-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-white/25">
              <Calculator className="size-8" aria-hidden />
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-[20px] font-extrabold leading-tight">المُحاسِب الشخصي</span>
              <span className="flex items-center gap-2 text-[12.5px] font-medium opacity-80">
                الإصدار <span className="font-num font-bold" dir="ltr">v{APP_VERSION}</span>
                <span className="rounded-full bg-[#06202B]/15 px-2 py-0.5 text-[11px] font-bold">نسخة ويب مكافئة</span>
              </span>
            </div>
          </div>
          <p className="relative mt-3 text-[12.5px] leading-5 opacity-85">
            نسخة ويب مكافئة — تعمل محلياً بالكامل: كل بياناتك في قاعدة محلية على جهازك، بلا اشتراكات ولا إعلانات ولا تتبّع.
          </p>
        </div>

        {/* إحصاءات القاعدة */}
        <section className="flex flex-col gap-2" aria-label="إحصاءات قاعدة البيانات">
          <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-bold text-muted-foreground">
            <Database className="size-3.5" aria-hidden />
            قاعدة البيانات
          </h2>
          <AppCard noPad className="flex flex-col gap-3 p-4">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl bg-muted/50 p-3">
                <span className="text-[11.5px] text-muted-foreground">حجم القاعدة</span>
                <p className="font-num mt-0.5 text-[17px] font-extrabold text-foreground">
                  {isLoading || !check ? "…" : sizeLabel(check.dbSizeBytes)}
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <span className="text-[11.5px] text-muted-foreground">إجمالي السجلات</span>
                <p className="font-num mt-0.5 text-[17px] font-extrabold text-foreground">
                  {isLoading || !check
                    ? "…"
                    : fmt(Object.values(counts).reduce((s, n) => s + n, 0), { decimals: 0, showSymbol: false })}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {RECORDS.map((r) => (
                <div key={r.key} className="flex min-h-8 items-center justify-between gap-2">
                  <span className="text-[12.5px] text-muted-foreground">{r.label}</span>
                  <span className="font-num text-[13px] font-bold text-foreground">
                    {counts[r.key] != null ? fmt(counts[r.key], { decimals: 0, showSymbol: false }) : "…"}
                  </span>
                </div>
              ))}
            </div>
          </AppCard>
        </section>

        {/* فحص السلامة */}
        <AppCard noPad className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex size-11 items-center justify-center rounded-xl",
                  check?.ok ? "bg-[#34D399]/15" : "bg-[#FBBF24]/15"
                )}
              >
                {checking || isFetching ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
                ) : check?.ok ? (
                  <CheckCircle2 className="size-5 text-[#34D399]" aria-hidden />
                ) : (
                  <AlertTriangle className="size-5 text-[#FBBF24]" aria-hidden />
                )}
              </span>
              <div className="flex flex-col">
                <span className="text-[14.5px] font-extrabold text-foreground">فحص سلامة القاعدة</span>
                {check ? (
                  <span className="text-[11.5px] text-muted-foreground">
                    آخر فحص: {formatDateTime(check.checkedAt)} —{" "}
                    {check.ok ? "سليمة" : "تحتاج مراجعة"}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-muted-foreground">integrity_check + مفاتيح أجنبية</span>
                )}
              </div>
            </div>
            {check ? (
              <StatusChip status={check.ok ? "paid" : "partial"} label={check.ok ? "سليمة" : "ملاحظات"} />
            ) : null}
          </div>
          <PrimaryButton
            block
            variant="outline"
            loading={checking}
            onClick={runCheck}
          >
            <ShieldCheck className="size-4" aria-hidden />
            فحص سلامة القاعدة الآن
          </PrimaryButton>
        </AppCard>

        {/* التواصل */}
        <section className="flex flex-col gap-2" aria-label="التواصل">
          <h2 className="px-1 text-[13px] font-bold text-muted-foreground">التواصل والدعم</h2>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: MessageCircle, label: "واتساب الدعم" },
              { icon: Mail, label: "البريد" },
              { icon: Globe, label: "الموقع" },
            ].map((c) => (
              <div
                key={c.label}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card p-3.5 text-center opacity-60"
                aria-disabled
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-muted">
                  <c.icon className="size-5 text-muted-foreground" aria-hidden />
                </span>
                <span className="text-[11.5px] font-medium text-muted-foreground">{c.label}</span>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[9.5px] font-bold text-muted-foreground">
                  قريباً
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Credits */}
        <AppCard noPad className="flex flex-col gap-1.5 p-4">
          <p className="text-[12.5px] leading-6 text-muted-foreground">
            مبني على مواصفات <span className="font-bold text-foreground">SRS v1.1</span> — نظام محاسبي شخصي عربي
            RTL كامل (35 جدولاً) بواجهة مكافئة لتطبيق «المحاسب المالي | فواتير مبيعات».
          </p>
          <p className="text-[11.5px] text-muted-foreground">
            الطباعة عبر نافذة المتصفح (إيصال 58/80مم + A4) • المشاركة عبر واتساب نصياً — كل البيانات محلية.
          </p>
        </AppCard>
      </div>
    </div>
  );
}
