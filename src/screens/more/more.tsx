"use client";

/**
 * شاشة «المزيد» (جذر تبويب المزيد) — قائمة تنقل لكل الوحدات الثانوية.
 */
import type { Component } from "react";
import { useNav } from "@/lib/nav";
import { AppHeader } from "@/components/ds";
import { AppCard, ListRow } from "@/components/ds";
import type { LucideIcon } from "lucide-react";
import {
  Users, Truck, Handshake, Wallet, Calculator, CalendarClock, ReceiptText,
  BriefcaseBusiness, Boxes, FileText, ClipboardCheck, ArrowLeftRight, History,
  DatabaseBackup, Settings, Info, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Entry {
  title: string
  subtitle: string
  screen: string
  icon: LucideIcon
  color: string
}

const GROUPS: Array<{ label: string; entries: Entry[] }> = [
  {
    label: "الأطراف والمناديب",
    entries: [
      { title: "العملاء والموردون", subtitle: "ملفات العملاء وكشوف حساباتهم", screen: "parties-customers", icon: Users, color: "#22D3EE" },
      { title: "الموردون", subtitle: "موردو البضاعة وأرصدتهم", screen: "parties-suppliers", icon: Truck, color: "#FBBF24" },
      { title: "المناديب", subtitle: "مندوبو البيع والتحصيل والعمولات", screen: "parties-reps", icon: Handshake, color: "#34D399" },
    ],
  },
  {
    label: "الخزينة والأقساط",
    entries: [
      { title: "الخزينة", subtitle: "الصناديق وأرصدتها الحية", screen: "cash-boxes", icon: Wallet, color: "#34D399" },
      { title: "المصروفات", subtitle: "مصروفات التشغيل وفئاتها", screen: "cash-expenses", icon: Calculator, color: "#F87171" },
      { title: "الأقساط", subtitle: "خطط التقسيط والتحصيل", screen: "installments-plans", icon: CalendarClock, color: "#FBBF24" },
      { title: "سندات القبض والصرف", subtitle: "سندات العملاء والموردين", screen: "parties-voucher", icon: ReceiptText, color: "#FB923C" },
    ],
  },
  {
    label: "الموظفون",
    entries: [
      { title: "الموظفون", subtitle: "ملفاتهم وحضورهم وسحبياتهم ورواتبهم", screen: "employees-list", icon: BriefcaseBusiness, color: "#A78BFA" },
    ],
  },
  {
    label: "الفوترة والمخزون",
    entries: [
      { title: "فواتير المشتريات", subtitle: "شراء البضاعة ومرتجعاتها", screen: "purchases-list", icon: Boxes, color: "#FBBF24" },
      { title: "عروض الأسعار", subtitle: "عروض قابلة للتحويل لفواتير", screen: "sales-quotations", icon: FileText, color: "#22D3EE" },
      { title: "الجرد", subtitle: "جرد المخازن واعتماد الفروقات", screen: "inventory-stocktake", icon: ClipboardCheck, color: "#34D399" },
      { title: "تحويل المخازن", subtitle: "نقل البضاعة بين المخازن", screen: "inventory-transfers", icon: ArrowLeftRight, color: "#FBBF24" },
      { title: "سجل الحركات", subtitle: "كل حركات دخول وخروج الأصناف", screen: "inventory-movements", icon: History, color: "#94A3B8" },
    ],
  },
  {
    label: "النظام",
    entries: [
      { title: "النسخ الاحتياطي", subtitle: "تصدير واستيراد نسخ JSON", screen: "settings-backup", icon: DatabaseBackup, color: "#F87171" },
      { title: "الإعدادات", subtitle: "كل إعدادات التطبيق", screen: "settings-main", icon: Settings, color: "#94A3B8" },
      { title: "حول", subtitle: "عن التطبيق والإصدار", screen: "settings-about", icon: Info, color: "#22D3EE" },
    ],
  },
]

export default function MoreScreen() {
  const { push } = useNav();

  return (
    <div className="flex flex-col">
      <AppHeader noBack title="المزيد" />
      <div className="flex flex-col gap-4 p-4 pb-6">
        {/* بطاقة المستخدم */}
        <div className="bg-gradient-cyan relative flex items-center gap-3 overflow-hidden rounded-2xl p-4 text-[#06202B] shadow-lg ring-1 ring-[#22D3EE]/30">
          <span className="pointer-events-none absolute -left-6 -top-8 size-24 rounded-full bg-white/10" aria-hidden />
          <span className="relative flex size-12 items-center justify-center rounded-full bg-white/25 text-xl font-extrabold">
            م
          </span>
          <div className="relative flex flex-1 flex-col">
            <span className="text-[16px] font-extrabold leading-tight">المدير</span>
            <span className="flex items-center gap-1 text-[12px] font-medium opacity-80">
              <ShieldCheck className="size-3.5" aria-hidden />
              مدير النظام — صلاحيات كاملة
            </span>
          </div>
        </div>

        {GROUPS.map((group) => (
          <section key={group.label} className="flex flex-col gap-2" aria-label={group.label}>
            <h2 className="px-1 text-[13px] font-bold text-muted-foreground">{group.label}</h2>
            <AppCard noPad className="overflow-hidden">
              {group.entries.map((e, i) => (
                <ListRow
                  key={e.screen}
                  title={e.title}
                  subtitle={e.subtitle}
                  divider={i < group.entries.length - 1}
                  onClick={() => push(e.screen)}
                  leading={
                    <span
                      className={cn("flex size-10 items-center justify-center rounded-xl")}
                      style={{ backgroundColor: `${e.color}1A` }}
                    >
                      <e.icon className="size-5" style={{ color: e.color }} aria-hidden />
                    </span>
                  }
                />
              ))}
            </AppCard>
          </section>
        ))}
      </div>
    </div>
  );
}
