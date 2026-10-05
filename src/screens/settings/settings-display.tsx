"use client";

/**
 * إعدادات العرض (FR-13-05): شكل الأرقام (غربية/هندية) + حجم الخط (عادي/كبير —
 * يُطبَّق فوراً على إطار التطبيق كله عبر zoom) + الثيم (داكن افتراضي، فاتح «قريباً»).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Sun, Moon } from "lucide-react";
import { toast } from "sonner";
import { getJson, patchJson } from "@/lib/api";
import { AppHeader, AppCard, PrimaryButton } from "@/components/ds";
import { SettingsSection } from "@/components/settings/fields";
import {
  useDisplaySettings,
  useFormatD,
  type NumbersShape,
  type FontSize,
} from "@/components/settings/numbers-context";
import { cn } from "@/lib/utils";
import type { BootstrapData } from "@/lib/types";

const NUMBERS_OPTIONS: Array<{ id: NumbersShape; title: string; sample: string; desc: string }> = [
  { id: "western", title: "غربية", sample: "0123456789", desc: "الأرقام اللاتينية الأكثر شيوعاً" },
  { id: "arabic", title: "هندية", sample: "٠١٢٣٤٥٦٧٨٩", desc: "الأرقام العربية الشرقية" },
];

export default function SettingsDisplayScreen() {
  const qc = useQueryClient();
  const fmt = useFormatD();
  const { numbers, fontSize, setNumbers, setFontSize } = useDisplaySettings();

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  // القيمة الحالية من المخزن المحلي (localStorage) — كل تعديل يكتب الخادم أيضاً
  // (persistNumbers/persistFontSize) فيبقى الطرفان متزامنين.

  async function persistNumbers(shape: NumbersShape) {
    setNumbers(shape);
    try {
      await patchJson("/api/settings", { key: "display.numbers", value: shape });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(shape === "arabic" ? "سيُعرض شكل الأرقام الهندية" : "سيُعرض شكل الأرقام الغربية");
    } catch {
      /* توست من api.ts */
    }
  }

  async function persistFontSize(size: FontSize) {
    setFontSize(size);
    try {
      await patchJson("/api/settings", { key: "app.fontSize", value: size });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
      toast.success(size === "large" ? "تم تكبير خط التطبيق" : "أُعيد الخط إلى الحجم العادي");
    } catch {
      /* توست من api.ts */
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="إعدادات العرض" />
      <div className="flex flex-1 flex-col gap-4 p-4 pb-8">
        <SettingsSection title="شكل الأرقام">
          <div className="flex gap-2.5">
            {NUMBERS_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => persistNumbers(o.id)}
                aria-pressed={numbers === o.id}
                className={cn(
                  "flex flex-1 flex-col gap-1.5 rounded-2xl border p-3 text-right transition-all active:scale-[0.98]",
                  numbers === o.id ? "border-primary bg-primary/10" : "border-border/60 bg-card hover:border-primary/40"
                )}
              >
                <span className="flex items-center justify-between">
                  <span className="text-[14.5px] font-bold text-foreground">{o.title}</span>
                  {numbers === o.id ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[#06202B]">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span dir="ltr" className="font-num text-[17px] font-bold text-primary">
                  {o.sample}
                </span>
                <span className="text-[11.5px] leading-4 text-muted-foreground">{o.desc}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-muted/50 p-3">
            <p className="text-[12px] text-muted-foreground">معاينة: مبلغ فاتورة</p>
            <p dir="auto" className="font-num text-[15px] font-bold text-foreground">
              {fmt(1234567, { currency: boot?.baseCurrency?.code ?? "YER" })}
            </p>
            <p className="text-[11.5px] leading-5 text-muted-foreground">
              يُطبَّق فوراً على مبالغ وكميات كل شاشات التطبيق (التواريخ تبقى بالشكل القياسي).
            </p>
          </div>
        </SettingsSection>

        <SettingsSection title="حجم الخط">
          <div className="flex gap-2.5">
            {(
              [
                { id: "normal", title: "عادي", desc: "الحجم الافتراضي" },
                { id: "large", title: "كبير", desc: "أوضح للقراءة — يكبّر كل التطبيق" },
              ] as Array<{ id: FontSize; title: string; desc: string }>
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => persistFontSize(o.id)}
                aria-pressed={fontSize === o.id}
                className={cn(
                  "flex flex-1 flex-col gap-1 rounded-2xl border p-3 text-right transition-all active:scale-[0.98]",
                  fontSize === o.id ? "border-primary bg-primary/10" : "border-border/60 bg-card hover:border-primary/40"
                )}
              >
                <span className="flex items-center justify-between">
                  <span className={cn("font-bold text-foreground", o.id === "large" ? "text-[16.5px]" : "text-[14.5px]")}>
                    {o.title}
                  </span>
                  {fontSize === o.id ? (
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[#06202B]">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                  ) : null}
                </span>
                <span className="text-[11.5px] leading-4 text-muted-foreground">{o.desc}</span>
              </button>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection title="الثيم">
          <div className="flex gap-2.5">
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-primary bg-primary/10 p-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-[#0F172A] text-primary">
                <Moon className="size-5" aria-hidden />
              </span>
              <div className="flex flex-col">
                <span className="text-[14.5px] font-bold text-foreground">داكن</span>
                <span className="text-[11.5px] text-muted-foreground">الافتراضي — كحلي/سماوي</span>
              </div>
              <span className="ms-auto flex size-5 items-center justify-center rounded-full bg-primary text-[#06202B]">
                <Check className="size-3.5" aria-hidden />
              </span>
            </div>
            <div className="flex flex-1 items-center gap-3 rounded-2xl border border-border/60 bg-card p-3 opacity-60" aria-disabled>
              <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Sun className="size-5" aria-hidden />
              </span>
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-[14.5px] font-bold text-foreground">
                  فاتح
                  <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                    قريباً
                  </span>
                </span>
                <span className="text-[11.5px] text-muted-foreground">غير متاح في هذا الإصدار</span>
              </div>
            </div>
          </div>
        </SettingsSection>

        <AppCard noPad className="p-3">
          <p className="text-[12px] leading-5 text-muted-foreground">
            اللغة: العربية فقط (واجهة التطبيق مصممة عربية RTL بالكامل). إعدادات العرض تُحفظ محلياً وعلى الخادم معاً.
          </p>
        </AppCard>

        <PrimaryButton
          variant="outline"
          onClick={() => {
            persistNumbers("western");
            persistFontSize("normal");
          }}
        >
          إعادة الضبط الافتراضي (غربية / عادي / داكن)
        </PrimaryButton>
      </div>
    </div>
  );
}
