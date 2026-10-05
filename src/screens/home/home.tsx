"use client";

/**
 * 01 — الصفحة الرئيسية (الداشبورد) — SRS §6.5 + دليل الشاشات القسم 01
 * بطاقة ترحيب متدرجة + 4 بلاطات إحصائية + رسم 30 يوماً + شبكة 12 بطاقة
 * + تنبيهات سريعة + لوحة الطابعة السريعة.
 */
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Store, Receipt, Boxes, TrendingUp, Truck, Users, BriefcaseBusiness,
  Calculator, Wallet, DatabaseBackup, Settings, BarChart3, Banknote, Search,
  Bluetooth, X, Printer, ChevronDown, ChevronUp, CalendarDays,
  AlertCircle, BellRing, PackageX,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
} from "recharts";
import { getJson } from "@/lib/api";
import { formatDateLong, formatAmount } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { BootstrapData, DashboardData } from "@/lib/types";
import { AppCard, AmountText, StatTile, SectionTitle, ListRow, PrimaryButton } from "@/components/ds";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── شبكة الوحدات (كما في التطبيق الأصلي: 3×4) ───
interface ModuleTile {
  label: string
  screen: string
  icon: typeof Store
  color: string
}

const MODULES: ModuleTile[] = [
  { label: "المبيعات", screen: "sales-pos", icon: Store, color: "#22D3EE" },
  { label: "فواتير مبيعات", screen: "sales-invoices", icon: Receipt, color: "#34D399" },
  { label: "فواتير مشتريات", screen: "purchases-list", icon: Boxes, color: "#FBBF24" },
  { label: "حركة البيع", screen: "report-sales-by", icon: TrendingUp, color: "#34D399" },
  { label: "الموردون", screen: "parties-suppliers", icon: Truck, color: "#F87171" },
  { label: "العملاء", screen: "parties-customers", icon: Users, color: "#22D3EE" },
  { label: "موظفين", screen: "employees-list", icon: BriefcaseBusiness, color: "#FBBF24" },
  { label: "المصروفات", screen: "cash-expenses", icon: Calculator, color: "#34D399" },
  { label: "الخزينة", screen: "cash-boxes", icon: Wallet, color: "#22D3EE" },
  { label: "تحديث البيانات", screen: "settings-backup", icon: DatabaseBackup, color: "#F87171" },
  { label: "الإعدادات", screen: "settings-main", icon: Settings, color: "#94A3B8" },
  { label: "التقارير", screen: "reports-gallery", icon: BarChart3, color: "#34D399" },
]

export default function HomeScreen() {
  const { push } = useNav()
  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60 * 1000,
  })
  const { data: dash, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: () => getJson<DashboardData>("/api/dashboard"),
    refetchInterval: 30 * 1000,
  })

  const company = boot?.company
  const chartData = (dash?.last30Days ?? []).map((d) => ({
    ...d,
    label: d.date.slice(5), // MM-DD
  }))
  const last30Total = chartData.reduce((s, d) => s + (d.total ?? 0), 0)

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      {/* ─── بطاقة الترحيب ─── */}
      <div className="bg-gradient-cyan relative overflow-hidden rounded-2xl p-4 text-[#06202B] shadow-lg">
        <div className="pointer-events-none absolute -left-8 -top-10 size-36 rounded-full bg-white/10" aria-hidden />
        <div className="pointer-events-none absolute -bottom-14 left-16 size-28 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => push("global-search")}
            aria-label="البحث الشامل"
            title="البحث الشامل"
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/20 text-[#06202B] transition-colors hover:bg-white/30 active:scale-95"
          >
            <Search className="size-4.5" aria-hidden />
          </button>
          <div className="flex flex-col gap-1">
            <span className="text-[19px] font-extrabold leading-tight">
              {company?.name ?? "متجر الأمانة للتجارة"}
            </span>
            <span className="flex items-center gap-1.5 text-[13px] font-medium opacity-80">
              <CalendarDays className="size-3.5" aria-hidden />
              اليوم، {formatDateLong(new Date())}
            </span>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1 text-[12.5px] font-bold">
            مرحباً، المدير 👋
          </span>
        </div>
      </div>

      {/* ─── البلاطات الإحصائية 2×2 ─── */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          title="مبيعات اليوم"
          amount={dash?.todaySales ?? 0}
          currency="YER"
          trendPercent={dash?.salesTrendPercent ?? null}
          icon={TrendingUp}
          loading={isLoading}
          onClick={() => push("sales-invoices")}
        />
        <StatTile
          title="أرباح اليوم"
          amount={dash?.todayProfit ?? 0}
          currency="YER"
          variant="pos"
          icon={Banknote}
          hint={isLoading ? undefined : "إجمالي يوم النقدية"}
          loading={isLoading}
          onClick={() => push("report-pl")}
        />
        <StatTile
          title="فواتير اليوم"
          amount={dash?.todayInvoiceCount ?? 0}
          plain
          icon={Receipt}
          hint={isLoading ? undefined : "فاتورة مبيعات"}
          loading={isLoading}
          onClick={() => push("sales-invoices")}
        />
        <StatTile
          title="صافي الصندوق"
          amount={dash?.cashNet ?? 0}
          currency="YER"
          icon={Wallet}
          hint={isLoading ? undefined : "حركة اليوم: قبض − صرف"}
          loading={isLoading}
          onClick={() => push("cash-boxes")}
        />
      </div>

      {/* ─── حركة الشركة (30 يوماً) ─── */}
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => push("report-pl")}
            className="text-[12.5px] font-medium text-primary hover:underline"
          >
            التقرير الكامل
          </button>
        }
      >
        حركة الشركة — آخر 30 يوماً
      </SectionTitle>
      <AppCard className="pt-2">
        {/* رأس الرسم: إجمالي 30 يوماً + مفتاح الوضع */}
        <div className="flex items-center justify-between gap-2 px-3 pb-1.5">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[12.5px] font-medium text-muted-foreground">الإجمالي 30 يوماً:</span>
            <AmountText value={last30Total} currency="YER" size="md" variant="neutral" />
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className="size-2 rounded-full bg-primary" aria-hidden />
            المبيعات اليومية
          </span>
        </div>
        <div className="h-32 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
              <defs>
                <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#22D3EE" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "var(--font-plex-arabic)" }}
                tickLine={false}
                axisLine={false}
                interval={6}
              />
              <YAxis hide width={0} />
              <Tooltip
                contentStyle={{
                  background: "#1E293B",
                  border: "1px solid #334155",
                  borderRadius: 12,
                  fontFamily: "var(--font-tajawal)",
                  fontSize: 12,
                  direction: "rtl",
                }}
                labelStyle={{ color: "#94A3B8" }}
                formatter={(value: number | string) => [
                  formatAmount(Number(value), { currency: "YER" }),
                  "المبيعات",
                ]}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#22D3EE"
                strokeWidth={2}
                fill="url(#salesArea)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </AppCard>

      {/* ─── شبكة الوحدات 3×4 ─── */}
      <SectionTitle>وحدات النظام</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        {MODULES.map((m) => (
          <button
            key={m.label}
            type="button"
            onClick={() => push(m.screen)}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-border/60 bg-card p-2 text-center shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_4px_20px_rgba(34,211,238,0.15)] active:scale-95"
          >
            <span
              className="flex size-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${m.color}1A` }}
            >
              <m.icon
                className="size-6"
                style={{ color: m.color }}
                aria-hidden
                strokeWidth={1.8}
              />
            </span>
            <span className="text-[12px] font-medium leading-snug text-foreground">
              {m.label}
            </span>
          </button>
        ))}
      </div>

      {/* ─── تنبيهات سريعة ─── */}
      <SectionTitle>تنبيهات اليوم</SectionTitle>
      <AppCard noPad className="overflow-hidden">
        <ListRow
          title="أقساط مستحقة اليوم"
          subtitle="خطط تقسيط تحتاج متابعة تحصيل"
          leading={
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#FBBF24]/15">
              <BellRing className="size-5 text-[#FBBF24]" aria-hidden />
            </span>
          }
          trailing={
            <span
              className={cn(
                "font-num rounded-full px-2.5 py-1 text-[13px] font-bold",
                (dash?.dueInstallmentsToday ?? 0) > 0
                  ? "bg-[#FBBF24]/15 text-[#FBBF24]"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {dash?.dueInstallmentsToday ?? 0}
            </span>
          }
          divider
          onClick={() => push("installments-due")}
        />
        <ListRow
          title="تنبيهات المخزون"
          subtitle="أصناف وصلت تحت الحد الأدنى"
          leading={
            <span className="flex size-10 items-center justify-center rounded-xl bg-[#F87171]/15">
              <PackageX className="size-5 text-[#F87171]" aria-hidden />
            </span>
          }
          trailing={
            <span
              className={cn(
                "font-num rounded-full px-2.5 py-1 text-[13px] font-bold",
                (dash?.lowStockCount ?? 0) > 0
                  ? "bg-[#F87171]/15 text-[#F87171]"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {dash?.lowStockCount ?? 0}
            </span>
          }
          divider={false}
          onClick={() => push("inventory-alerts")}
        />
      </AppCard>

      {/* ─── لوحة الطابعة السريعة ─── */}
      <PrinterPanel />
    </div>
  );
}

// ═══════════════ لوحة الطابعة السريعة (كما في التطبيق الأصلي) ═══════════════

function PrinterPanel() {
  const [paper, setPaper] = useState("80");
  const [width, setWidth] = useState("80");
  const [dpi, setDpi] = useState("58");
  const [connected, setConnected] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  return (
    <AppCard noPad className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-10 items-center justify-center rounded-xl bg-primary/10">
            <Bluetooth className="size-5 text-primary" aria-hidden />
            {!connected && (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-[#F87171] text-[#2b0707]">
                <X className="size-2.5" strokeWidth={3} aria-hidden />
              </span>
            )}
          </span>
          <div className="flex flex-col">
            <span className="text-[15px] font-bold text-foreground">إعدادات الطابعة</span>
            <span className={cn("text-[12px]", connected ? "text-[#34D399]" : "text-[#F87171]")}>
              {connected ? "جاهزة للطباعة" : "غير متصلة"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "توسيع" : "طي"}
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/40"
        >
          {collapsed ? <ChevronDown className="size-5" aria-hidden /> : <ChevronUp className="size-5" aria-hidden />}
        </button>
      </div>

      {!collapsed && (
        <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">الورق</span>
              <select
                value={paper}
                onChange={(e) => setPaper(e.target.value)}
                className="h-10 rounded-lg border border-border bg-muted/60 px-2 text-[13px] text-foreground outline-none focus:border-primary/70"
                aria-label="مقاس الورق"
              >
                <option value="A4">A4</option>
                <option value="80">80</option>
                <option value="58">58</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">العرض</span>
              <input
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                inputMode="numeric"
                className="font-num h-10 rounded-lg border border-border bg-muted/60 px-2 text-[13px] text-foreground outline-none focus:border-primary/70"
                aria-label="عرض الورق"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">الدقة</span>
              <input
                value={dpi}
                onChange={(e) => setDpi(e.target.value)}
                inputMode="numeric"
                className="font-num h-10 rounded-lg border border-border bg-muted/60 px-2 text-[13px] text-foreground outline-none focus:border-primary/70"
                aria-label="دقة الطباعة"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setConnected((c) => !c)
                toast.success(connected ? "تم فصل الطابعة" : "تم توصيل الطابعة")
              }}
              className={cn(
                "min-h-10 rounded-lg border px-3 text-[13px] font-bold transition-colors",
                connected
                  ? "border-primary/50 bg-primary/20 text-primary"
                  : "border-border bg-muted/60 text-muted-foreground"
              )}
            >
              {connected ? "موصولة ✓" : "يوصل"}
            </button>
            <button
              type="button"
              onClick={() => toast.info("اختر طابعة حرارية — وضع الويب: الطباعة عبر نافذة المتصفح")}
              className="min-h-10 rounded-lg border border-border bg-muted/60 px-3 text-[13px] font-medium text-foreground"
            >
              اسم الطابعة
            </button>
            <PrimaryButton
              variant="outline"
              className="min-h-10 rounded-lg text-[13px]"
              onClick={() => toast.success("وضع الويب: الطباعة عبر نافذة المتصفح")}
            >
              <Printer className="size-4" aria-hidden />
              تجربة الطابعة
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="min-h-10 rounded-lg border border-border bg-muted/60 px-3 text-[13px] font-medium text-muted-foreground"
            >
              طى التعديل
            </button>
          </div>
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden />
            وضع الويب: يتم الطباعة عبر نافذة المتصفح بقالب حراري {paper}مم
          </p>
        </div>
      )}
    </AppCard>
  );
}
