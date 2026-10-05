"use client";

/**
 * عناصر نماذج مشتركة لشاشات الإعدادات — Task 5.
 * حقول داكنة RTL متسقة مع نظام التصميم (DS) وأهداف لمس ≥44px.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { AppCard } from "@/components/ds";

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "tel";
  suffix?: string;
  required?: boolean;
  hint?: string;
  dir?: "rtl" | "ltr";
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  suffix,
  required,
  hint,
  dir = "rtl",
}: TextFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[13.5px] font-bold text-foreground">
        {label}
        {required ? <span className="text-[#F87171]"> *</span> : null}
      </label>
      <div
        className={cn(
          "flex h-12 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3",
          "focus-within:border-primary/70"
        )}
      >
        <input
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={dir}
          aria-label={label}
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-foreground",
            "placeholder:font-normal placeholder:text-muted-foreground/70 outline-none",
            type === "number" && "font-num"
          )}
        />
        {suffix ? <span className="shrink-0 text-[13px] text-muted-foreground">{suffix}</span> : null}
      </div>
      {hint ? <p className="text-[12px] leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  icon?: ReactNode;
}

export function ToggleRow({ label, hint, checked, onCheckedChange, icon }: ToggleRowProps) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 py-1">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
        <div className="flex min-w-0 flex-col">
          <span className="text-[14.5px] font-bold text-foreground">{label}</span>
          {hint ? <span className="text-[12px] leading-5 text-muted-foreground">{hint}</span> : null}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}

/** بطاقة قسم بعنوان */
export function SettingsSection({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[13px] font-bold text-muted-foreground">{title}</h2>
        {action}
      </div>
      <AppCard noPad className="flex flex-col gap-3 p-4">
        {children}
      </AppCard>
    </section>
  );
}
