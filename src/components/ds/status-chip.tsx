"use client";

/**
 * DS-26 — StatusChip: شريحة حالة ملونة.
 * نقدي أخضر / آجل كهرماني / معلّق رمادي / ملغى أحمر باهت / مكتمل سماوي.
 */
import { cn } from "@/lib/utils";

export type ChipStatus =
  | "cash" | "credit" | "mixed" | "held" | "void" | "completed"
  | "draft" | "converted" | "open" | "accepted" | "rejected" | "expired"
  | "active" | "paid" | "partial" | "late" | "pending" | "due" | "cancelled";

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  cash: { label: "نقدي", cls: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30" },
  credit: { label: "آجل", cls: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30" },
  mixed: { label: "مختلط", cls: "bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/30" },
  held: { label: "معلّق", cls: "bg-[#64748B]/20 text-[#94A3B8] border-[#64748B]/30" },
  void: { label: "ملغى", cls: "bg-[#F87171]/10 text-[#F87171]/80 border-[#F87171]/20" },
  completed: { label: "مكتمل", cls: "bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/30" },
  draft: { label: "مسودة", cls: "bg-[#64748B]/20 text-[#94A3B8] border-[#64748B]/30" },
  converted: { label: "محوّل", cls: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30" },
  open: { label: "مفتوح", cls: "bg-[#22D3EE]/15 text-[#22D3EE] border-[#22D3EE]/30" },
  accepted: { label: "مقبول", cls: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30" },
  rejected: { label: "مرفوض", cls: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30" },
  expired: { label: "منتهي", cls: "bg-[#64748B]/20 text-[#94A3B8] border-[#64748B]/30" },
  active: { label: "نشط", cls: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30" },
  paid: { label: "مسدد", cls: "bg-[#34D399]/15 text-[#34D399] border-[#34D399]/30" },
  partial: { label: "جزئي", cls: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30" },
  late: { label: "متأخر", cls: "bg-[#F87171]/15 text-[#F87171] border-[#F87171]/30" },
  pending: { label: "قيد الانتظار", cls: "bg-[#64748B]/20 text-[#94A3B8] border-[#64748B]/30" },
  due: { label: "مستحق", cls: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30" },
  cancelled: { label: "ملغى", cls: "bg-[#F87171]/10 text-[#F87171]/80 border-[#F87171]/20" },
};

interface StatusChipProps {
  status: ChipStatus | string;
  /** نص مخصص يلغي النص الافتراضي */
  label?: string;
  className?: string;
}

export function StatusChip({ status, label, className }: StatusChipProps) {
  const m = STATUS_MAP[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium leading-5",
        m.cls,
        className
      )}
    >
      {label ?? m.label}
    </span>
  );
}
