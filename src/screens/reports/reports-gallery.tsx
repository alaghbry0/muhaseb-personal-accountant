"use client";

/**
 * معرض التقارير — 13_التقارير (FR-09): كل تقارير النظام مجمّعة
 * (المالية / المبيعات / النقدية / الضرائب / البشر) ببطاقات أيقونية ووصف.
 */
import {
  TrendingUp, BarChart3, Clock4, Users, Package, Wallet, Receipt, Landmark,
  Percent, BriefcaseBusiness, ChevronLeft, PieChart,
} from "lucide-react";
import { useNav } from "@/lib/nav";
import { SectionTitle } from "@/components/ds";
import { cn } from "@/lib/utils";

interface ReportTile {
  label: string;
  desc: string;
  screen: string;
  icon: typeof BarChart3;
  color: string;
}

const GROUPS: Array<{ title: string; icon: typeof BarChart3; items: ReportTile[] }> = [
  {
    title: "التقارير المالية",
    icon: PieChart,
    items: [
      { label: "حركة الشركة", desc: "الأرباح والخسائر — إيرادات وتكاليف ومصاريف وصافي الربح", screen: "report-pl", icon: TrendingUp, color: "#34D399" },
      { label: "أعمار الديون", desc: "أرصدة العملاء موزعة حسب عمر الدين (0–30 / 31–60 / 61–90 / +90)", screen: "report-aging", icon: Clock4, color: "#FBBF24" },
    ],
  },
  {
    title: "تقارير المبيعات",
    icon: BarChart3,
    items: [
      { label: "المبيعات حسب", desc: "حسب العميل أو المندوب أو الفئة أو الصنف أو اليوم مع مقارنة الفترة السابقة", screen: "report-sales-by", icon: BarChart3, color: "#22D3EE" },
      { label: "حركة صنف", desc: "بطاقة صنف: كل الحركات والرصيد التراكمي ووارد/صادر", screen: "report-item-movement", icon: Package, color: "#FB923C" },
    ],
  },
  {
    title: "تقارير النقدية",
    icon: Wallet,
    items: [
      { label: "الصناديق", desc: "افتتاحي ووارد وصادر وختامي لكل صندوق بعملته", screen: "report-cashboxes", icon: Wallet, color: "#22D3EE" },
      { label: "المصروفات", desc: "المصروفات حسب الفئة مع النسب والمقارنة", screen: "report-expenses", icon: Receipt, color: "#F87171" },
      { label: "الأقساط", desc: "المحصّل والمستحق والمتأخر + توقع التدفق النقدي 6 أشهر", screen: "report-installments", icon: Clock4, color: "#34D399" },
    ],
  },
  {
    title: "الضرائب",
    icon: Percent,
    items: [
      { label: "تقرير الضريبة", desc: "إجمالي المبيعات والمشتريات والضريبة المحصّلة والمدخلة", screen: "report-tax", icon: Percent, color: "#A78BFA" },
    ],
  },
  {
    title: "تقارير الموارد البشرية",
    icon: BriefcaseBusiness,
    items: [
      { label: "أداء المناديب", desc: "فواتير ومبيعات وتحصيلات ومرتجعات وعمولات كل مندوب", screen: "report-reps", icon: Users, color: "#F472B6" },
    ],
  },
];

export default function ReportsGalleryScreen() {
  const { push } = useNav();

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-8">
      <div className="bg-gradient-cyan relative overflow-hidden rounded-2xl p-4 text-[#06202B]">
        <div className="pointer-events-none absolute -left-8 -top-10 size-36 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-xl bg-[#06202B]/15">
            <Landmark className="size-6" aria-hidden />
          </span>
          <div className="flex flex-col">
            <span className="text-[19px] font-extrabold">التقارير</span>
            <span className="text-[12.5px] font-medium opacity-80">كل تقارير النظام — بفترة مخصصة وطباعة وتصدير</span>
          </div>
        </div>
      </div>

      {GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title} className="flex flex-col gap-2">
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <g.icon className="size-4 text-primary/80" aria-hidden />
              {g.title}
            </span>
          </SectionTitle>
          <div className="flex flex-col gap-2">
            {g.items.map((it) => {
              const Icon = it.icon;
              return (
                <button
                  key={it.screen}
                  type="button"
                  onClick={() => push(it.screen)}
                  className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 text-start shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-colors hover:bg-accent/30 active:scale-[0.99]"
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                    style={{ backgroundColor: `${it.color}22`, color: it.color }}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px] font-bold text-foreground">{it.label}</span>
                    <span className="text-[12.5px] leading-tight text-muted-foreground">{it.desc}</span>
                  </span>
                  <ChevronLeft className={cn("size-4 shrink-0 text-muted-foreground")} aria-hidden />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
