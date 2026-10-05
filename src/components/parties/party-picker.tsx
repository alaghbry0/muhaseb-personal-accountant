"use client";

/**
 * منتقي طرف (عميل/مورد) — بحث فوري + اختيار، مع الأرصدة للعملاء.
 * يُركَّب داخل نموذج السند عند الضغط على زر الطرف.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, User, Truck, Check } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CustomerDto, SupplierDto } from "@/domain/parties";

interface PartyPickerProps {
  partyType: "customer" | "supplier";
  selected: { id: number; name: string } | null;
  onSelect: (p: { id: number; name: string }) => void;
  className?: string;
}

export function PartyPicker({ partyType, selected, onSelect, className }: PartyPickerProps) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data } = useQuery<{ customers?: CustomerDto[]; suppliers?: SupplierDto[] }>({
    queryKey: ["parties", partyType, "picker", q],
    queryFn: () =>
      partyType === "customer"
        ? getJson(`/api/parties/customers?q=${encodeURIComponent(q)}&limit=30`)
        : getJson(`/api/parties/suppliers?q=${encodeURIComponent(q)}&limit=30`),
    enabled: open,
  });

  const customers = partyType === "customer" ? (data?.customers ?? []) : [];
  const suppliers = partyType === "supplier" ? (data?.suppliers ?? []) : [];
  const Icon = partyType === "customer" ? User : Truck;

  const items = useMemo(
    () =>
      partyType === "customer"
        ? customers.map((c) => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            amount: c.balance,
          }))
        : suppliers.map((s) => ({
            id: s.id,
            name: s.name,
            phone: s.phone,
            amount: s.balance,
          })),
    [partyType, customers, suppliers]
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-start text-[15px] transition-colors",
          selected
            ? "border-primary/60 bg-primary/10 text-foreground"
            : "border-border bg-muted/60 text-muted-foreground hover:bg-accent/30"
        )}
      >
        <Icon className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">
          {selected ? selected.name : partyType === "customer" ? "اختر العميل…" : "اختر المورد…"}
        </span>
        <span className="text-[12px] text-muted-foreground">{open ? "إغلاق ▲" : "فتح ▼"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-2">
          <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-muted/60 px-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={partyType === "customer" ? "بحث باسم العميل أو الهاتف…" : "بحث باسم المورد…"}
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none"
            />
          </div>
          <div className="scrollbar-slim max-h-64 overflow-y-auto">
            {items.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-muted-foreground">لا نتائج</p>
            ) : (
              items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    onSelect({ id: it.id, name: it.name });
                    setOpen(false);
                    setQ("");
                  }}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-start transition-colors hover:bg-accent/40",
                    selected?.id === it.id && "bg-primary/10"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{it.name}</span>
                    {it.phone && (
                      <span dir="ltr" className="block font-num text-[12px] text-muted-foreground">
                        {it.phone}
                      </span>
                    )}
                  </span>
                  <span
                    dir="ltr"
                    className={cn(
                      "font-num text-[13px] font-bold",
                      it.amount > 0 ? "text-[#FBBF24]" : it.amount < 0 ? "text-[#34D399]" : "text-muted-foreground"
                    )}
                  >
                    {formatAmount(it.amount, { decimals: 0, showSymbol: false })}
                  </span>
                  {selected?.id === it.id && <Check className="size-4 text-primary" aria-hidden />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
