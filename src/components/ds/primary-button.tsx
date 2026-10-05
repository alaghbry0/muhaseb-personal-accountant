"use client";

/**
 * DS-20 — PrimaryButton: خلفية سماوية #22D3EE، نص داكن عريض، نصف قطر 12،
 * ارتفاع 48 (هدف لمس مريح)، تكبير خفيف عند الضغط.
 */
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "success" | "danger" | "warning" | "ghost" | "outline";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97]",
  success: "bg-[#34D399] text-[#052e1c] hover:bg-[#34D399]/90 active:scale-[0.97]",
  danger: "bg-[#F87171] text-[#2b0707] hover:bg-[#F87171]/90 active:scale-[0.97]",
  warning: "bg-[#FBBF24] text-[#2b1a02] hover:bg-[#FBBF24]/90 active:scale-[0.97]",
  ghost: "bg-transparent text-foreground hover:bg-accent/40 active:scale-[0.97]",
  outline: "bg-transparent border border-border text-foreground hover:bg-accent/30 active:scale-[0.97]",
};

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  /** ملء العرض */
  block?: boolean;
}

export function PrimaryButton({
  variant = "primary",
  loading = false,
  block,
  className,
  children,
  disabled,
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold transition-all",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        block && "w-full",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
