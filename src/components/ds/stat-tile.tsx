"use client";

/**
 * DS-19 — StatTile: بلاطة إحصائية — عنوان صغير + رقم كبير + سهم نسبة التغيّر.
 */
import { cn } from "@/lib/utils";
import { AmountText } from "./amount-text";
import { TrendBadge } from "./trend-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";

interface StatTileProps {
  title: string;
  amount: number | null | undefined;
  currency?: string;
  /** نسبة التغيّر عن الفترة السابقة (+/-) — undefined يخفي الشارة */
  trendPercent?: number | null;
  /** العنوان الفرعي أسفل المبلغ (بديل عن النسبة) */
  hint?: string;
  icon?: LucideIcon;
  variant?: "default" | "pos" | "neg" | "due" | "primary";
  loading?: boolean;
  /** عرض عدد صرف (بدون كسور) بدل مبلغ */
  plain?: boolean;
  decimals?: number;
  onClick?: () => void;
  className?: string;
}

export function StatTile({
  title,
  amount,
  currency,
  trendPercent,
  hint,
  icon: Icon,
  variant = "default",
  loading,
  plain,
  decimals,
  onClick,
  className,
}: StatTileProps) {
  const amountVariant =
    variant === "pos" ? "pos" : variant === "neg" ? "neg" : variant === "due" ? "due" : variant === "primary" ? "primary" : "neutral";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex w-full flex-col items-start gap-1.5 rounded-2xl bg-card border border-border/60 p-4 text-start shadow-[0_2px_12px_rgba(0,0,0,0.25)] transition-colors",
        onClick && "active:bg-accent/40 cursor-pointer",
        className
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted-foreground">{title}</span>
        {Icon && <Icon className="size-4 shrink-0 text-primary/70" aria-hidden />}
      </span>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <AmountText value={amount ?? 0} currency={currency} size="xl" variant={amountVariant} plain={plain} decimals={decimals} />
      )}
      {typeof trendPercent === "number" && !loading ? (
        <TrendBadge percent={trendPercent} />
      ) : hint ? (
        <span className="font-num text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </button>
  );
}
