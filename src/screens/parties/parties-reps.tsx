"use client";

/**
 * المناديب — FR-06-01 (قائمة هيكلية): الاسم + نوع العمولة (على المبيعات/التحصيل/الاثنين)
 * + النسبة + المناطق + عمولات مستحقة → بطاقة المندوب.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Handshake, MapPin } from "lucide-react";
import { getJson } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { AppHeader, ListRow, AmountText, EmptyState, StatusChip } from "@/components/ds";

interface RepListItem {
  id: number
  name: string
  phone: string | null
  commissionType: "sales" | "collection" | "both"
  commissionPercent: number
  areas: string | null
  commissionDue: number
  commissionDueCount: number
  commissionPaid: number
}

const TYPE_LABELS: Record<string, string> = {
  sales: "على المبيعات",
  collection: "على التحصيل",
  both: "الاثنين",
}

export default function PartiesRepsScreen() {
  const { push } = useNav();
  const { data, isLoading } = useQuery<{ reps: RepListItem[] }>({
    queryKey: ["parties", "reps"],
    queryFn: () => getJson<{ reps: RepListItem[] }>("/api/parties/reps"),
  });

  const reps = data?.reps ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="المناديب" />
      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل المناديب…</p>
        ) : reps.length === 0 ? (
          <EmptyState icon={Handshake} message="لا مناديب بعد" hint="يُدار ملف المندوب من شاشة الموظفين والمناديب — المرحلة القادمة" />
        ) : (
          <div className="flex flex-col">
            {reps.map((r) => (
              <ListRow
                key={r.id}
                onClick={() => push("parties-rep-card", { repId: r.id })}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-full bg-[#34D399]/15 text-[15px] font-bold text-[#34D399]">
                    {r.name.trim().charAt(0)}
                  </span>
                }
                title={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate">{r.name}</span>
                    <StatusChip
                      status={r.commissionType === "collection" ? "due" : "active"}
                      label={`${TYPE_LABELS[r.commissionType]} ${r.commissionPercent}%`}
                    />
                  </span>
                }
                subtitle={
                  r.areas ? (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <MapPin className="size-3" aria-hidden />
                      {r.areas}
                    </span>
                  ) : (
                    "بلا مناطق محددة"
                  )
                }
                trailing={
                  r.commissionDue > 0.005 ? (
                    <span className="flex flex-col items-end gap-0.5">
                      <AmountText value={r.commissionDue} currency="YER" size="sm" variant="due" />
                      <span className="text-[10.5px] text-muted-foreground">عمولات مستحقة</span>
                    </span>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
