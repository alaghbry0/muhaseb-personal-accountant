"use client";

/**
 * شاشة الموردين — 05_الموردين (الوحدة 03): إحصاءات (عدد الموردين / إجمالي المستحق لهم)
 * + بحث + قائمة بالأرصدة (موجب = مستحق له كهرماني، سالب = مستحق عليه أخضر)
 * + FAB «مورد جديد» (FR-03-03).
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Truck, Phone } from "lucide-react";
import { getJson } from "@/lib/api";
import { useNav } from "@/lib/nav";
import type { SupplierDto } from "@/domain/parties";
import {
  AppHeader, ListRow, AmountText, EmptyState, SearchBar, StatTile, StatusChip,
} from "@/components/ds";
import { SupplierForm } from "@/components/parties/supplier-form";

interface SuppliersResponse {
  suppliers: SupplierDto[]
  stats: { count: number; totalDue: number }
}

export default function PartiesSuppliersScreen() {
  const { push } = useNav();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const url = useMemo(() => `/api/parties/suppliers?q=${encodeURIComponent(q)}`, [q]);
  const { data, isLoading } = useQuery<SuppliersResponse>({
    queryKey: ["parties", "suppliers", url],
    queryFn: () => getJson<SuppliersResponse>(url),
  });

  const suppliers = data?.suppliers ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title={`الموردون (${data?.stats.count ?? 0})`}
        action={
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            aria-label="مورد جديد"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="px-3 pb-3">
          <SearchBar value={q} onChange={setQ} placeholder="البحث بإسم المورد…" />
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        <div className="mb-3">
          <StatTile
            title="إجمالي المستحق للموردين"
            amount={data?.stats.totalDue ?? 0}
            currency="YER"
            variant="due"
            icon={Truck}
            hint="الذمم الدائنة للموردين"
          />
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الموردين…</p>
        ) : suppliers.length === 0 ? (
          <EmptyState
            icon={Truck}
            message={q ? "لا نتائج مطابقة" : "لا موردين بعد"}
            hint="سجّل الموردين لمتابعة المستحقات وسدادها بسندات الصرف"
            actionLabel="تسجيل مورد"
            onAction={() => setFormOpen(true)}
          />
        ) : (
          <div className="flex flex-col">
            {suppliers.map((s) => (
              <ListRow
                key={s.id}
                onClick={() => push("parties-supplier-card", { supplierId: s.id })}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-full bg-[#FBBF24]/15 text-[15px] font-bold text-[#FBBF24]">
                    {s.name.trim().charAt(0)}
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className="truncate">{s.name}</span>
                    {s.isArchived && <StatusChip status="held" label="مؤرشف" />}
                  </span>
                }
                subtitle={
                  s.phone ? (
                    <span dir="ltr" className="flex items-center gap-1 font-num">
                      <Phone className="size-3" aria-hidden />
                      {s.phone}
                    </span>
                  ) : undefined
                }
                trailing={
                  <span className="flex flex-col items-end gap-0.5">
                    <AmountText
                      value={s.balance}
                      currency="YER"
                      size="md"
                      variant={s.balance > 0.005 ? "due" : s.balance < -0.005 ? "pos" : "neutral"}
                    />
                    {s.balance > 0.005 ? (
                      <span className="text-[11px] text-muted-foreground">مستحق له</span>
                    ) : s.balance < -0.005 ? (
                      <span className="text-[11px] text-[#34D399]">مستحق عليه</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">مسدد</span>
                    )}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      <SupplierForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["parties", "suppliers"] })}
      />
    </div>
  );
}
