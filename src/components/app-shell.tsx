"use client";

/**
 * هيكل التطبيق — إطار موبايل مركزي (430px) على الشاشات الكبيرة، ملء الشاشة على الجوال.
 * منطقة محتوى قابلة للتمرير + تنقل شاشات مكدسة بحركة fade+slide (180ms) واعية للاتجاه
 * + شريط تبويبات سفلي بزر بيع بارز في الوسط.
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, ShoppingCart, Package, BarChart3, LayoutGrid,
} from "lucide-react";
import { useNav, type TabId } from "@/lib/nav";
import { useDisplaySettings } from "@/components/settings/numbers-context";
import { registry } from "@/screens/registry";
import { cn } from "@/lib/utils";
import { StubScreen } from "@/components/ds";

const TABS: Array<{ id: TabId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "home", label: "الرئيسية", icon: LayoutDashboard },
  { id: "sales", label: "البيع", icon: ShoppingCart },
  { id: "inventory", label: "المخزون", icon: Package },
  { id: "reports", label: "التقارير", icon: BarChart3 },
  { id: "more", label: "المزيد", icon: LayoutGrid },
];

export function AppShell() {
  const { activeTab, stacks, direction, seq, setTab } = useNav();
  // حجم الخط (عادي/كبير) — إعدادات العرض، تُطبّق على إطار التطبيق كله (Task 5)
  const fontSize = useDisplaySettings((s) => s.fontSize);
  const current = stacks[activeTab].at(-1) ?? { screen: activeTab };
  const scrollRef = useRef<HTMLDivElement>(null);

  // إعادة التمرير للأعلى عند كل انتقال
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [seq, activeTab]);

  const Screen = registry[current.screen];

  // اتجاه الحركة: push يدخل من اليسار (RTL)، pop من اليمين، tab/root تلاشي فقط
  const variants = {
    push: {
      initial: { x: -64, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: 64, opacity: 0 },
    },
    pop: {
      initial: { x: 64, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: -64, opacity: 0 },
    },
    tab: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
    root: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
    },
  } as const;
  const v = variants[direction] ?? variants.tab;

  return (
    <div className="flex min-h-dvh justify-center bg-[#080E1A]">
      <div
        className="relative flex min-h-dvh w-full max-w-[430px] flex-col border-border/40 bg-background shadow-[0_0_60px_rgba(0,0,0,0.6)] md:border-x"
        style={fontSize === "large" ? { zoom: 1.08 } : undefined}
      >
        {/* منطقة المحتوى */}
        <main
          ref={scrollRef}
          className="scrollbar-slim flex flex-1 flex-col overflow-y-auto overflow-x-hidden"
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={`${activeTab}:${current.screen}:${seq}`}
              initial={v.initial}
              animate={v.animate}
              exit={v.exit}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="flex min-h-full flex-col"
            >
              {Screen ? (
                <Screen {...(current.params ?? {})} />
              ) : (
                <StubScreen title="شاشة غير موجودة" description={`المعرّف: ${current.screen}`} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* شريط التبويبات السفلي */}
        <nav
          aria-label="التنقل الرئيسي"
          className="relative z-30 flex shrink-0 items-stretch justify-around border-t border-border/60 bg-card/95 pb-safe backdrop-blur-md"
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            // زر البيع البارز في الوسط
            if (tab.id === "sales") {
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTab(tab.id)}
                  aria-label="البيع — نقطة البيع"
                  aria-current={isActive ? "page" : undefined}
                  className="group relative -mt-5 flex flex-1 flex-col items-center justify-end pb-2"
                >
                  <span
                    className={cn(
                      "flex size-14 items-center justify-center rounded-full bg-gradient-cyan shadow-[0_6px_20px_rgba(34,211,238,0.45)] ring-4 ring-[#0F172A] transition-transform",
                      isActive ? "scale-105" : "group-active:scale-95"
                    )}
                  >
                    <ShoppingCart className="size-6 text-[#06202B]" aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "mt-1 text-[11px] font-bold",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            }
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                aria-label={tab.label}
                aria-current={isActive ? "page" : undefined}
                className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 pt-1 transition-colors"
              >
                <tab.icon
                  className={cn(
                    "size-6 transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "text-[11px] font-bold transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
