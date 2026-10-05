"use client";

/**
 * غلاف موحد للوحات وحدة الأطراف السفلية (vaul Drawer) — نفس نمط PosSheet.
 * المحتوى يُركَّب عند الفتح فقط (قاعدة React 19: لا set-state داخل effect).
 */
import type { ReactNode } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

interface PartySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
}

export function PartySheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
}: PartySheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="rounded-t-2xl border-t border-border/70"
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DrawerHeader className="pb-2 text-start">
          <DrawerTitle className="text-base font-bold">{title}</DrawerTitle>
          {description && (
            <DrawerDescription className="text-[13px]">{description}</DrawerDescription>
          )}
        </DrawerHeader>
        {open && (
          <div
            className={cn("scrollbar-slim max-h-[64vh] overflow-y-auto px-4 pb-5", contentClassName)}
          >
            {children}
          </div>
        )}
        {open && footer && <div className="border-t border-border/60 p-4 pb-safe">{footer}</div>}
      </DrawerContent>
    </Drawer>
  );
}
