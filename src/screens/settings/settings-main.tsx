"use client";

/**
 * الإعدادات — القائمة الرئيسية (دليل 11/00): بلاطات أيقونية للشاشات الفرعية.
 * الرأس يعرض اسم المنشأة + شارة الإصدار.
 */
import { useQuery } from "@tanstack/react-query";
import {
  Building2, Hash, Printer, Palette, Database, DatabaseBackup,
  ScrollText, Info, ChevronLeft, type LucideIcon,
} from "lucide-react";
import { getJson } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { AppHeader, AppCard } from "@/components/ds";
import { cn } from "@/lib/utils";
import type { BootstrapData } from "@/lib/types";

interface Entry {
  title: string;
  subtitle: string;
  screen: string;
  icon: LucideIcon;
  color: string;
}

const ENTRIES: Entry[] = [
  { title: "بيانات المنشأة", subtitle: "الاسم والهاتف والضريبة والتذييل", screen: "settings-company", icon: Building2, color: "#22D3EE" },
  { title: "ترقيم المستندات", subtitle: "بادئات الفواتير والعدّادات السنوية", screen: "settings-numbering", icon: Hash, color: "#FBBF24" },
  { title: "إعدادات الطباعة", subtitle: "القالب وحجم الورق والنسخ والخيارات", screen: "settings-printing", icon: Printer, color: "#34D399" },
  { title: "إعدادات العرض", subtitle: "شكل الأرقام وحجم الخط والثيم", screen: "settings-display", icon: Palette, color: "#A78BFA" },
  { title: "البيانات المرجعية", subtitle: "العملات وأسعار الصرف والصناديق", screen: "settings-data", icon: Database, color: "#22D3EE" },
  { title: "النسخ الاحتياطي والاستعادة", subtitle: "تصدير واستيراد نسخ JSON وسجلها", screen: "settings-backup", icon: DatabaseBackup, color: "#F87171" },
  { title: "سجل التدقيق", subtitle: "من فعل ماذا ومتى", screen: "settings-audit", icon: ScrollText, color: "#FBBF24" },
  { title: "حول التطبيق", subtitle: "الإصدار وفحص سلامة القاعدة", screen: "settings-about", icon: Info, color: "#94A3B8" },
];

const APP_VERSION = "1.0.0";

export default function SettingsMainScreen() {
  const { push } = useNav();
  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="الإعدادات"
        action={
          <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
            v{APP_VERSION}
          </span>
        }
      >
        <div className="border-b border-border/60 px-3 pb-3">
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Building2 className="size-3.5 text-primary" aria-hidden />
            <span className="truncate">
              {boot?.company?.name ?? "…"}
              {boot?.company?.phone ? ` • ${boot.company.phone}` : ""}
            </span>
          </div>
        </div>
      </AppHeader>

      <div className="grid grid-cols-2 gap-3 p-4 pb-8">
        {ENTRIES.map((e) => (
          <button
            key={e.screen}
            type="button"
            onClick={() => push(e.screen)}
            aria-label={e.title}
            className="group flex min-h-28 flex-col items-start justify-between gap-2 rounded-2xl border border-border/60 bg-card p-3.5 text-right transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-accent/30 hover:shadow-md active:scale-[0.98] active:translate-y-0"
          >
            <span className="flex w-full items-center justify-between gap-2">
              <span
                className={cn("flex size-10 items-center justify-center rounded-xl")}
                style={{ backgroundColor: `${e.color}1A` }}
              >
                <e.icon className="size-5" style={{ color: e.color }} aria-hidden />
              </span>
              <ChevronLeft
                className={cn(
                  "size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground"
                )}
                aria-hidden
              />
            </span>
            <span className="flex w-full flex-col gap-0.5">
              <span className="text-[14px] font-bold leading-tight text-foreground">{e.title}</span>
              <span className="text-[11.5px] leading-4 text-muted-foreground">{e.subtitle}</span>
            </span>
          </button>
        ))}
      </div>

      <AppCard noPad className="mx-4 mb-6 flex items-center gap-2 p-3">
        <Info className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-[12px] leading-5 text-muted-foreground">
          العملة الأساسية وأول تشغيل التطبيق ثُبِّتا عند الإعداد — يمكن تعديل بيانات المنشأة كاملة من شاشتها.
        </p>
      </AppCard>
    </div>
  );
}
