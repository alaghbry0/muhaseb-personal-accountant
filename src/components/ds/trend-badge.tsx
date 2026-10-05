"use client";

/**
 * شارة اتجاه التغيّر — سهم + نسبة. أعلى = أخضر افتراضياً (مبيعات)،
 * `goodWhenDown` يقلب الدلالة (المصروفات).
 * نسب مبالغ فيها (يوم سابق شبه صفري) تُقيَّد عند 999%+ / -999%+.
 */
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TrendBadgeProps {
  percent: number | null | undefined;
  goodWhenDown?: boolean;
  className?: string;
}

export function TrendBadge({ percent, goodWhenDown = false, className }: TrendBadgeProps) {
  if (percent == null || !isFinite(percent)) return null;
  const rounded = Math.round(percent * 10) / 10;
  const isUp = rounded > 0.05;
  const isDown = rounded < -0.05;
  const good = goodWhenDown ? !isUp && isDown : isUp;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  // قيد النسب السخيفة (مثل +1026% عند مبيعات أمس شبه معدومة): سقف 999%
  const clamped = Math.max(-999, Math.min(999, rounded));
  const capped = clamped !== rounded;
  return (
    <span
      dir="ltr"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium font-num",
        isUp || isDown
          ? good
            ? "bg-[#34D399]/15 text-[#34D399]"
            : "bg-[#F87171]/15 text-[#F87171]"
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {/* قيد النسب: عند التقييد نعرض ">999%" / "<-999%" — أوضح من تكرار + */}
      {capped
        ? `${clamped > 0 ? ">" : "<"}${Math.abs(clamped)}%`
        : `${clamped > 0 ? "+" : ""}${clamped}%`}
    </span>
  );
}
