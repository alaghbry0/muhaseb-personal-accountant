"use client";

/**
 * غلاف موحد للوحات شاشة البيع السفلية (vaul Drawer) — DS-23 BottomSheet.
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

interface PosSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  contentClassName?: string
}

export function PosSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  contentClassName,
}: PosSheetProps) {
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
        <div
          className={cn(
            "scrollbar-slim max-h-[62vh] overflow-y-auto px-4 pb-5",
            contentClassName
          )}
        >
          {children}
        </div>
        {footer && (
          <div className="border-t border-border/60 p-4 pb-safe">{footer}</div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
