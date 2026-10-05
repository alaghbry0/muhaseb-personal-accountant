"use client";

/**
 * صف «مفتاح: قيمة» — للتسميات والقيم في بطاقات التفاصيل والإعدادات.
 */
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface KeyValueRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function KeyValueRow({ label, value, className }: KeyValueRowProps) {
  return (
    <div className={cn("flex min-h-10 items-center justify-between gap-4 py-1", className)}>
      <span className="shrink-0 text-[13.5px] text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-[14.5px] font-medium text-foreground">{value}</span>
    </div>
  );
}
