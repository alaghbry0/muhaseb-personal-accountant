"use client";

/**
 * عنوان قسم داخل الشاشة — صغير ثانوي + إجراء اختياري (عرض الكل...).
 */
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SectionTitleProps {
  children: ReactNode;
  /** إجراء في نهاية السطر (زر صغير) */
  action?: ReactNode;
  className?: string;
}

export function SectionTitle({ children, action, className }: SectionTitleProps) {
  return (
    <div className={cn("flex items-center justify-between gap-2 px-1", className)}>
      <h2 className="text-[14px] font-bold text-foreground">{children}</h2>
      {action}
    </div>
  );
}
