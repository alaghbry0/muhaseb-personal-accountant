"use client";

/**
 * DS-17 — AppCard: بطاقة أساسية #1E293B، نصف قطر 16، حشوة 16، ظل خفيف.
 */
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface AppCardProps extends HTMLAttributes<HTMLDivElement> {
  /** بلا حشوة داخلية (للقوائم) */
  noPad?: boolean;
}

export function AppCard({ className, noPad, ...props }: AppCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-card border border-border/60 shadow-[0_2px_12px_rgba(0,0,0,0.25)]",
        !noPad && "p-4",
        className
      )}
      {...props}
    />
  );
}
