"use client";

/**
 * رأس الشاشة — سهم رجوع (يشير لليمين في RTL) + عنوان + إجراء اختياري.
 * يُثبَّت أعلى منطقة التمرير مع خلفية شفافة ضبابية.
 */
import { cn } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { useNav } from "@/lib/nav";
import type { ReactNode } from "react";

interface AppHeaderProps {
  title: string;
  /** إخفاء زر الرجوع (الشاشات الجذرية) */
  noBack?: boolean;
  /** إجراء في نهاية الرأس (أيقونة/زر) */
  action?: ReactNode;
  /** محتوى إضافي أسفل الرأس (شريط بحث مثلاً) */
  children?: ReactNode;
  className?: string;
}

export function AppHeader({ title, noBack, action, children, className }: AppHeaderProps) {
  const { pop, canPop } = useNav()
  const showBack = !noBack && canPop()

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex flex-col gap-3 border-b border-border/60 bg-background/90 backdrop-blur-md",
        className
      )}
    >
      <div className="flex min-h-14 items-center gap-2 px-3 pt-safe">
        {showBack ? (
          <button
            type="button"
            onClick={pop}
            aria-label="رجوع"
            className="flex size-11 items-center justify-center rounded-xl text-foreground hover:bg-accent/40 active:scale-95"
          >
            <ArrowRight className="size-5" aria-hidden />
          </button>
        ) : (
          <span className="w-2" aria-hidden />
        )}
        <h1 className="flex-1 truncate text-center text-[18px] font-bold text-foreground">
          {title}
        </h1>
        <div className="flex min-w-11 items-center justify-end gap-1">{action}</div>
      </div>
      {children}
    </header>
  );
}
