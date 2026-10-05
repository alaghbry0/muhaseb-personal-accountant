"use client";

/**
 * شاشة العملاء — 06_العملاء (الوحدة 03): إحصاءات (عدد العملاء / إجمالي المديونية)
 * + بحث بالاسم/الهاتف + فلترة منطقة + قائمة بالأرصدة الحية (مدين كهرماني / دائن أخضر)
 * + FAB «عميل جديد» (FR-03-01). تجاوز حد الائتمان = شارة حمراء.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Phone, MapPin, AlertTriangle } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type { CustomerDto } from "@/domain/parties";
import {
  AppHeader, ListRow, AmountText, EmptyState, SearchBar, StatTile, StatusChip,
} from "@/components/ds";
import { CustomerForm } from "@/components/parties/customer-form";
import { openWhatsApp } from "@/components/parties/whatsapp";
import { cn } from "@/lib/utils";

interface CustomersResponse {
  customers: CustomerDto[]
  stats: { count: number; totalDebt: number; creditors: number; overLimit: number }
  areas: string[]
}

export default function PartiesCustomersScreen() {
  const { push } = useNav();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (area) params.set("area", area);
    return `/api/parties/customers?${params.toString()}`;
  }, [q, area]);

  const { data, isLoading } = useQuery<CustomersResponse>({
    queryKey: ["parties", "customers", url],
    queryFn: () => getJson<CustomersResponse>(url),
  });

  const customers = data?.customers ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title={`العملاء (${data?.stats.count ?? 0})`}
        action={
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            aria-label="عميل جديد"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3">
          <SearchBar value={q} onChange={setQ} placeholder="البحث باسم العميل أو الهاتف…" />
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setArea("")}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                area === ""
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/30"
              )}
            >
              كل المناطق
            </button>
            {(data?.areas ?? []).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setArea(a === area ? "" : a)}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  area === a
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/70 text-muted-foreground hover:bg-accent/30"
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <StatTile
            title="إجمالي المديونية"
            amount={data?.stats.totalDebt ?? 0}
            currency="YER"
            variant="due"
            icon={Users}
            hint="مجموع أرصدة العملاء المدينة"
          />
          <StatTile
            title="تجاوزوا حد الائتمان"
            amount={data?.stats.overLimit ?? 0}
            variant={data?.stats.overLimit ? "neg" : "default"}
            plain
            icon={AlertTriangle}
            hint={`${data?.stats.creditors ?? 0} عميل دائن (دفعة مقدمة)`}
          />
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل العملاء…</p>
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            message={q || area ? "لا نتائج مطابقة" : "لا عملاء بعد"}
            hint={q || area ? "جرّب تعديل البحث أو الفلتر" : "سجّل أول عميل لتبدأ البيع الآجل والتحصيل"}
            actionLabel="تسجيل عميل"
            onAction={() => setFormOpen(true)}
          />
        ) : (
          <div className="flex flex-col">
            {customers.map((c) => (
              <ListRow
                key={c.id}
                onClick={() => push("parties-customer-card", { customerId: c.id })}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-[15px] font-bold text-primary">
                    {c.name.trim().charAt(0)}
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className="truncate">{c.name}</span>
                    {c.overLimit && <StatusChip status="late" label="تجاوز الحد" />}
                  </span>
                }
                subtitle={
                  <span className="flex items-center gap-2">
                    {c.phone && (
                      <span dir="ltr" className="flex items-center gap-1 font-num">
                        <Phone className="size-3" aria-hidden />
                        {c.phone}
                      </span>
                    )}
                    {c.area && (
                      <span className="flex items-center gap-0.5 text-muted-foreground">
                        <MapPin className="size-3" aria-hidden />
                        {c.area}
                      </span>
                    )}
                  </span>
                }
                trailing={
                  <span className="flex flex-col items-end gap-0.5">
                    <AmountText
                      value={c.balance}
                      currency="YER"
                      size="md"
                      variant={c.balance > 0.005 ? "due" : c.balance < -0.005 ? "pos" : "neutral"}
                    />
                    {c.balance < -0.005 && <span className="text-[11px] text-[#34D399]">دائن</span>}
                    {c.creditLimit > 0 && (
                      <span className="font-num text-[10.5px] text-muted-foreground">
                        حد: {formatAmount(c.creditLimit, { decimals: 0, showSymbol: false })}
                      </span>
                    )}
                  </span>
                }
              >
                <div className="flex gap-1.5 pt-1">
                  <button
                    type="button"
                    aria-label={`واتساب ${c.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openWhatsApp(c.whatsapp || c.phone, `مرحباً ${c.name} 🌹`);
                    }}
                    className="flex size-8 items-center justify-center rounded-full bg-[#25D366]/15 text-[#25D366] active:scale-95"
                  >
                    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
                      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2m0 18.03c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 4.54 0 8.24 3.7 8.24 8.24s-3.7 8.24-8.24 8.24m4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.27z" />
                    </svg>
                  </button>
                  {c.balance > 0.005 && <StatusChip status="due" label="مدين" />}
                  {Math.abs(c.balance) <= 0.005 && <StatusChip status="paid" label="مسدد" />}
                </div>
              </ListRow>
            ))}
          </div>
        )}
      </div>

      <CustomerForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["parties", "customers"] })}
      />
    </div>
  );
}
