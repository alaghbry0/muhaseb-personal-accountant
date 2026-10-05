"use client";

/**
 * بطاقة المندوب — FR-06 (قراءة فقط في هذه المرحلة):
 * بيانات + إحصاءات (مبيعاته، عمولاته المستحقة/المدفوعة، عملاؤه حسب المناطق)
 * + سجل العمولات (فاتورة/تحصيل) + زر «صرف عمولة» معطّل (يُستكمل في شاشة حساب المندوب — Task 4-b).
 */
import { useQuery } from "@tanstack/react-query";
import { Handshake, Phone, Ban } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDate } from "@/lib/format";
import { useNav } from "@/lib/nav";
import {
  AppHeader, AppCard, AmountText, StatusChip, EmptyState, SectionTitle, StatTile, PrimaryButton,
} from "@/components/ds";

interface RepFileResponse {
  rep: {
    id: number
    name: string
    phone: string | null
    commissionType: "sales" | "collection" | "both"
    commissionPercent: number
    areas: string[]
    isArchived: boolean
  }
  stats: {
    salesTotalBase: number
    salesCount: number
    commissionDue: number
    commissionPaid: number
    customersCount: number
  }
  commissions: Array<{
    id: number
    refType: "invoice" | "collection"
    refId: number
    baseAmount: number
    percent: number
    amount: number
    status: "due" | "paid"
    createdAt: string
  }>
  customers: Array<{ id: number; name: string; phone: string | null; area: string | null }>
}

const TYPE_LABELS: Record<string, string> = {
  sales: "عمولة على المبيعات",
  collection: "عمولة على التحصيل",
  both: "عمولة على المبيعات والتحصيل",
}

export default function PartiesRepCardScreen({ repId }: { repId?: number }) {
  const { push } = useNav();
  const { data, isLoading } = useQuery<RepFileResponse>({
    queryKey: ["parties", "rep-file", repId],
    queryFn: () => getJson<RepFileResponse>(`/api/parties/reps/${repId}`),
    enabled: Boolean(repId),
  });

  if (isLoading || !data) {
    return (
      <div className="flex min-h-full flex-col">
        <AppHeader title="بطاقة المندوب" />
        <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الملف…</p>
      </div>
    );
  }

  const { rep, stats, commissions, customers } = data;

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title={rep.name} />

      <div className="flex-1 px-3 py-3">
        <div className="flex flex-col gap-3">
          <AppCard className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-[#34D399]/15 text-xl font-bold text-[#34D399]">
                {rep.name.trim().charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-[17px] font-bold">{rep.name}</h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
                  {rep.phone && (
                    <a href={`tel:${rep.phone}`} dir="ltr" className="flex items-center gap-1 font-num hover:text-primary">
                      <Phone className="size-3" aria-hidden />
                      {rep.phone}
                    </a>
                  )}
                  <StatusChip status="active" label={`${TYPE_LABELS[rep.commissionType]} (${rep.commissionPercent}%)`} />
                </div>
              </div>
            </div>
            {rep.areas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rep.areas.map((a) => (
                  <span key={a} className="rounded-full border border-border bg-muted/60 px-2.5 py-1 text-[12px] text-muted-foreground">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </AppCard>

          <div className="grid grid-cols-3 gap-2.5">
            <StatTile title="مبيعاته" amount={stats.salesTotalBase} currency="YER" variant="primary" hint={`${formatAmount(stats.salesCount, { decimals: 0, showSymbol: false })} فاتورة`} />
            <StatTile title="عمولات مستحقة" amount={stats.commissionDue} currency="YER" variant="due" />
            <StatTile title="عمولات مدفوعة" amount={stats.commissionPaid} currency="YER" variant="pos" />
          </div>

          <AppCard noPad>
            <div className="flex items-center justify-between gap-2 p-4 pb-2">
              <SectionTitle>سجل العمولات ({commissions.length})</SectionTitle>
              <PrimaryButton variant="outline" disabled className="gap-1.5 text-[12.5px]" onClick={() => {}}>
                <Ban className="size-3.5" aria-hidden />
                صرف العمولة
              </PrimaryButton>
            </div>
            <p className="px-4 pb-2 text-[11.5px] text-muted-foreground">
              يُصرف مستحق المندوب من شاشة «حساب المندوب» — تُستكمل في المرحلة القادمة (وحدة الموظفين)
            </p>
            {commissions.length === 0 ? (
              <EmptyState message="لا عمولات بعد" hint="تُولَّد تلقائياً مع فواتير البيع (نوع مبيعات) وتحصيل الأقساط (نوع تحصيل)" className="py-6" />
            ) : (
              <div className="scrollbar-slim max-h-96 overflow-y-auto">
                {commissions.map((c) => (
                  <div key={c.id} className="flex min-h-14 items-center gap-2 border-b border-border/40 px-4 last:border-0">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <StatusChip status={c.refType === "invoice" ? "completed" : "due"} label={c.refType === "invoice" ? "مبيعات" : "تحصيل"} />
                        <span className="font-num text-[12.5px] text-muted-foreground">
                          أساس {formatAmount(c.baseAmount, { decimals: 0, showSymbol: false })} × {c.percent}%
                        </span>
                      </span>
                      <span className="font-num block text-[12px] text-muted-foreground">{formatDate(c.createdAt)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <AmountText value={c.amount} currency="YER" size="sm" variant={c.status === "due" ? "due" : "pos"} />
                      <StatusChip status={c.status === "due" ? "pending" : "paid"} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </AppCard>

          <AppCard noPad>
            <div className="p-4 pb-1">
              <SectionTitle>عملاء مناطق المندوب ({customers.length})</SectionTitle>
            </div>
            {customers.length === 0 ? (
              <EmptyState icon={Handshake} message="لا عملاء في مناطق المندوب" className="py-6" />
            ) : (
              <div className="scrollbar-slim max-h-72 overflow-y-auto">
                {customers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => push("parties-customer-card", { customerId: c.id })}
                    className="flex min-h-12 w-full items-center gap-2 border-b border-border/40 px-4 text-start last:border-0 hover:bg-accent/30"
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px]">{c.name}</span>
                    {c.area && <span className="text-[12px] text-muted-foreground">{c.area}</span>}
                  </button>
                ))}
              </div>
            )}
          </AppCard>
        </div>
      </div>
    </div>
  );
}
