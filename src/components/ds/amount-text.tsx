"use client";

/**
 * DS-18 — AmountText: رقم مبلّغ بخط IBM Plex Sans Arabic (font-num)
 * بلون حسب الدلالة المحاسبية: قبض/ربح أخضر، صرف أحمر، آجل كهرماني.
 */
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/format";
import type { CSSProperties, ReactNode } from "react";

export type AmountVariant = "pos" | "neg" | "due" | "neutral" | "primary";
export type AmountSize = "sm" | "md" | "lg" | "xl" | "2xl";

const SIZES: Record<AmountSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl font-semibold",
  xl: "text-2xl font-bold",
  "2xl": "text-3xl font-bold",
};

const VARIANT_CLASS: Record<AmountVariant, string> = {
  pos: "text-[#34D399]",
  neg: "text-[#F87171]",
  due: "text-[#FBBF24]",
  neutral: "text-foreground",
  primary: "text-primary",
};

const VARIANT_SIGN: Record<AmountVariant, string> = {
  pos: "+",
  neg: "−",
  due: "",
  neutral: "",
  primary: "",
};

interface AmountTextProps {
  value: number | null | undefined;
  variant?: AmountVariant;
  size?: AmountSize;
  /** رمز العملة: YER/SAR/USD — يُظهر الرمز */
  currency?: string;
  decimals?: number;
  /** إظهار إشارة + / − حسب الدلالة */
  signed?: boolean;
  className?: string;
  style?: CSSProperties;
  /** يلغي تنسيق المبلغ ويعرض أرقاماً فقط (للكميات) */
  plain?: boolean;
  children?: ReactNode;
}

export function AmountText({
  value,
  variant = "neutral",
  size = "md",
  currency,
  decimals,
  signed = false,
  className,
  style,
  plain = false,
}: AmountTextProps) {
  const text = plain
    ? formatAmount(value, { decimals: decimals ?? 0, showSymbol: false })
    : formatAmount(value, { decimals, currency });
  const sign = signed ? VARIANT_SIGN[variant] : "";
  return (
    <span dir="ltr" className={cn("font-num", SIZES[size], VARIANT_CLASS[variant], className)} style={style}>
      {sign}
      {text}
    </span>
  );
}
