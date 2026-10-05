"use client";

/**
 * DS-25 — EmptyState: أيقونة + رسالة + زر إجراء اختياري.
 */
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PrimaryButton } from "./primary-button";

interface EmptyStateProps {
  message: string;
  hint?: string;
  icon?: LucideIcon;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  message,
  hint,
  icon: Icon = Inbox,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      <div className="flex size-16 items-center justify-center rounded-full bg-muted/70">
        <Icon className="size-8 text-muted-foreground" aria-hidden />
      </div>
      <p className="text-[15px] font-medium text-foreground">{message}</p>
      {hint && <p className="max-w-[260px] text-[13px] text-muted-foreground">{hint}</p>}
      {actionLabel && onAction && (
        <PrimaryButton onClick={onAction} className="mt-2">
          {actionLabel}
        </PrimaryButton>
      )}
    </div>
  );
}
