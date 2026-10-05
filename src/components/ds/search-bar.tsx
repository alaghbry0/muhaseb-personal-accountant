"use client";

/**
 * DS-21 — SearchBar: حقل بحث بأيقونات مدمجة (بحث + مسح ✕ + مسح باركود سماوي اختياري).
 */
import { cn } from "@/lib/utils";
import { Search, X, ScanBarcode } from "lucide-react";
import { useRef } from "react";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** زر مسح الباركود (سماوي) */
  onScan?: () => void;
  autoFocus?: boolean;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = "بحث...",
  onScan,
  autoFocus,
  className,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      className={cn(
        "flex h-12 items-center gap-2 rounded-xl border border-border bg-muted/60 px-3 focus-within:border-primary/70",
        className
      )}
    >
      <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        inputMode={onScan ? "text" : "search"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("")
            inputRef.current?.focus()
          }}
          aria-label="مسح البحث"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent/40 hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
      {onScan && (
        <button
          type="button"
          onClick={onScan}
          aria-label="مسح باركود"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25"
        >
          <ScanBarcode className="size-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
