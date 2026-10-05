"use client";

/**
 * DS-22 — ListRow: صف قائمة — عنوان + سطر ثانوي + مبلغ/شارة في الطرف + فاصل رفيع.
 * ارتفاع ≥ 64px، الـ chevron في نهاية الصف (يسار الشاشة في RTL).
 *
 * ملاحظة HTML: الصف القابل للنقر يُصيَّر <div role="button"> وليس <button>،
 * لأن الأبناء (children/trailing) قد يحتون أزراراً (واتساب/تعديل/شراء…) —
 * وتداخل <button> داخل <button> غير صالح في HTML ويسبب أخطاء hydration.
 * الوصولية محفوظة: tabIndex + تشغيل Enter/Space.
 */
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** المحتوى الطرفي: مبلغ/شارة/أي عنصر */
  trailing?: ReactNode;
  /** أيقونة في بداية الصف */
  leading?: ReactNode;
  onClick?: () => void;
  /** إظهار سهم التفاصيل */
  chevron?: boolean;
  /** الفاصل السفلي */
  divider?: boolean;
  className?: string;
  children?: ReactNode;
}

export function ListRow({
  title,
  subtitle,
  trailing,
  leading,
  onClick,
  chevron,
  divider = true,
  className,
  children,
}: ListRowProps) {
  const showChevron = chevron ?? Boolean(onClick);
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <div
      {...(onClick
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onKeyDown: handleKeyDown,
          }
        : {})}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-start transition-colors",
        onClick && "cursor-pointer hover:bg-accent/30 active:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
        divider && "border-b border-border/60",
        className
      )}
    >
      {leading && <div className="flex shrink-0 items-center">{leading}</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[15px] font-medium text-foreground">{title}</span>
        {subtitle && (
          <span className="truncate text-[13px] text-muted-foreground">{subtitle}</span>
        )}
        {children}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2 ps-2">{trailing}</div>}
      {showChevron && (
        <ChevronLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      )}
    </div>
  );
}
