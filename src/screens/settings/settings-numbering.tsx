"use client";

/**
 * ترقيم المستندات (FR-13-02 + §5.4-1): لكل نوع مستند — البادئة (قابلة للتعديل)
 * + العداد السنوي الحالي (قراءة فقط، محسوب من آخر مستند) + معاينة الرقم القادم
 * + عدد مستندات السنة. الحفظ يكتب settings['invoice.prefixes'].
 * الترقيم سنوي متسلسل ولا يعيد استخدام الأرقام الملغاة/المحذوفة.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Hash, Info, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getJson, patchJson } from "@/lib/api";
import { AppHeader, AppCard, PrimaryButton } from "@/components/ds";
import { useFormatD } from "@/components/settings/numbers-context";
import { SettingsSection } from "@/components/settings/fields";
import { toArabicDigits } from "@/lib/format";

interface NumberingRow {
  docType: string;
  label: string;
  prefix: string;
  year: number;
  lastNo: number;
  nextNo: string;
  count: number;
}

const EXAMPLES: Record<string, string> = {
  sale: "INV-2026-00068",
  purchase: "PUR-2026-00015",
  sale_return: "SRN-2026-00004",
  purchase_return: "PRN-2026-00003",
  quotation: "QTE-2026-00006",
};

export default function SettingsNumberingScreen() {
  const qc = useQueryClient();
  const fmt = useFormatD();
  const { data, isLoading, refetch, isFetching } = useQuery<{ rows: NumberingRow[]; year: number }>({
    queryKey: ["settings", "numbering"],
    queryFn: () => getJson<{ rows: NumberingRow[]; year: number }>("/api/settings/numbering"),
  });

  const [prefixes, setPrefixes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.rows) return;
    const p: Record<string, string> = {};
    for (const r of data.rows) p[r.docType] = r.prefix;
    setPrefixes(p);
  }, [data]);

  const dirty =
    !!data?.rows.some((r) => (prefixes[r.docType] ?? "") !== r.prefix);

  async function save() {
    const cleaned: Record<string, string> = {};
    for (const [k, v] of Object.entries(prefixes)) {
      const p = v.trim().toUpperCase();
      if (p && !/^[A-Za-z0-9_-]{1,8}$/.test(p)) {
        toast.error("البادئة: حروف إنجليزية/أرقام حتى 8 خانات");
        return;
      }
      cleaned[k] = p;
    }
    setSaving(true);
    try {
      await patchJson("/api/settings", { key: "invoice.prefixes", value: cleaned });
      toast.success("تم حفظ بادئات الترقيم");
      qc.invalidateQueries({ queryKey: ["settings", "numbering"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch {
      /* توست من api.ts */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="ترقيم المستندات"
        action={
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="تحديث"
            className="flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/40"
          >
            <RefreshCw className={isFetching ? "size-5 animate-spin" : "size-5"} aria-hidden />
          </button>
        }
      />
      <div className="flex flex-1 flex-col gap-3 p-4 pb-8">
        <AppCard noPad className="flex items-start gap-2 p-3">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <p className="text-[12px] leading-5 text-muted-foreground">
            الترقيم سنوي متسلسل <span className="font-num" dir="ltr">PREFIX-YYYY-NNNNN</span> ولا يعيد استخدام
            الأرقام الملغاة أو المحذوفة — العدّاد يُحسب من آخر مستند صادر ولا يمكن تعديله يدوياً.
          </p>
        </AppCard>

        {isLoading ? (
          <p className="py-6 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
        ) : (
          <>
            <SettingsSection title={`عدّادات سنة ${fmt(data?.year ?? new Date().getFullYear(), { decimals: 0, showSymbol: false })}`}>
              {(data?.rows ?? []).map((r) => (
                <div key={r.docType} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[14px] font-bold text-foreground">
                      <Hash className="size-3.5 text-primary" aria-hidden />
                      {r.label}
                    </span>
                    <span className="text-[11.5px] text-muted-foreground">
                      {fmt(r.count, { decimals: 0, showSymbol: false })} مستند هذه السنة
                    </span>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="flex h-11 w-28 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/60 px-2 focus-within:border-primary/70">
                      <input
                        value={prefixes[r.docType] ?? ""}
                        onChange={(e) =>
                          setPrefixes((p) => ({ ...p, [r.docType]: e.target.value.toUpperCase() }))
                        }
                        dir="ltr"
                        aria-label={`بادئة ${r.label}`}
                        className="font-num h-full w-full bg-transparent text-center text-[15px] font-bold text-foreground outline-none"
                      />
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="text-[11px] text-muted-foreground">الرقم القادم</span>
                      <span dir="ltr" className="font-num truncate rounded-lg bg-primary/10 px-2.5 py-1.5 text-[14px] font-bold text-primary">
                        {(prefixes[r.docType] || r.prefix)
                          ? `${prefixes[r.docType] || r.prefix}-${r.year}-${String(r.lastNo + 1).padStart(5, "0")}`
                          : r.nextNo}
                      </span>
                    </div>
                    <div className="flex flex-col items-center gap-0.5 rounded-xl bg-muted/50 px-3 py-1.5">
                      <span className="text-[10.5px] text-muted-foreground">العداد</span>
                      <span className="font-num text-[15px] font-bold text-foreground">
                        {fmt(r.lastNo, { decimals: 0, showSymbol: false })}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-muted-foreground" dir="ltr">
                    مثال: {EXAMPLES[r.docType] ?? ""}
                  </span>
                </div>
              ))}
            </SettingsSection>

            <PrimaryButton block loading={saving} disabled={!dirty} onClick={save}>
              {dirty ? "حفظ البادئات المعدّلة" : "لا تغييرات"}
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}
