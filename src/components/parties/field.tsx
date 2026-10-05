"use client";

/**
 * حقول نموذج موحدة لوحدة الأطراف — تسمية + إدخال بنفس هوية التطبيق.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-[13px] font-medium text-muted-foreground">
        {label}
        {required && <span className="text-[#F87171]"> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputCls =
  "h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/70";

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  dir,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal" | "tel";
  dir?: "ltr" | "rtl";
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      dir={dir}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(inputCls, dir === "ltr" && "font-num text-start", className)}
    />
  );
}

export function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(inputCls, "font-num")}
    />
  );
}

/** أزرار خيارات (Segmented) — نعم/لا، مدين/دائن، شهري/أسبوعي… */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ id: T; label: string; color?: string }>;
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1.5", className)} role="tablist">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "min-h-11 flex-1 rounded-xl border px-3 text-[14px] font-bold transition-colors",
              active
                ? o.color === "green"
                  ? "border-[#34D399]/60 bg-[#34D399]/15 text-[#34D399]"
                  : o.color === "red"
                    ? "border-[#F87171]/60 bg-[#F87171]/15 text-[#F87171]"
                    : "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/30"
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  );
}
