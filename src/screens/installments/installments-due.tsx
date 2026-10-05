"use client";

/**
 * الأقساط المستحقة — FR-05-02: تبديل النطاق (اليوم / هذا الأسبوع)
 * + قسم «متأخرة» أولاً (الأقدم أعلى، صفوف حمراء) + المستحق بالنطاق
 * + تحصيل سريع بلوحة معبأة + زر تذكير واتساب برسالة جاهزة (FR-05-03).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, AlarmClock, Phone } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatDateDisplay, formatAmount } from "@/lib/format";
import type { BootstrapData } from "@/lib/types";
import type { DueItem } from "@/domain/installments";
import {
  AppHeader, AppCard, AmountText, StatusChip, EmptyState, SectionTitle, PrimaryButton,
} from "@/components/ds";
import { CollectSheet } from "@/components/parties/collect-sheet";
import { buildInstallmentReminderText, remindViaWhatsApp } from "@/components/parties/whatsapp";
import { cn } from "@/lib/utils";

interface DueResponse {
  scope: "today" | "week"
  today: string
  from: string
  to: string
  due: DueItem[]
  late: DueItem[]
  counts: { due: number; late: number; dueTotal: number; lateTotal: number }
}

export default function InstallmentsDueScreen() {
  const qc = useQueryClient();
  const [scope, setScope] = useState<"today" | "week">("today");
  const [collecting, setCollecting] = useState<DueItem | null>(null);

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 30_000,
  });

  const { data, isLoading } = useQuery<DueResponse>({
    queryKey: ["installments", "due", scope],
    queryFn: () => getJson<DueResponse>(`/api/installments/due?scope=${scope}`),
  });

  const due = data?.due ?? [];
  const late = data?.late ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["installments"] });

  const remind = (item: DueItem) => {
    remindViaWhatsApp(
      item.customerWhatsapp || item.customerPhone,
      buildInstallmentReminderText({
        customerName: item.customerName,
        companyName: boot?.company?.name ?? "متجرنا",
        seq: item.seq,
        installmentsCount: item.installmentsCount,
        dueDate: item.dueDate,
        remaining: item.remaining,
        currencyCode: item.currencyCode,
      })
    );
  };

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="الأقساط المستحقة" />

      <div className="flex-1 px-3 py-3">
        {/* تبديل النطاق */}
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            onClick={() => setScope("today")}
            className={cn(
              "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border text-[14.5px] font-bold transition-colors",
              scope === "today"
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/30"
            )}
          >
            <CalendarDays className="size-4" aria-hidden />
            مستحق اليوم
            {data && <span className="rounded-full bg-primary/20 px-2 font-num text-[12px]">{data.counts.due}</span>}
          </button>
          <button
            type="button"
            onClick={() => setScope("week")}
            className={cn(
              "flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border text-[14.5px] font-bold transition-colors",
              scope === "week"
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:bg-accent/30"
            )}
          >
            <CalendarClock className="size-4" aria-hidden />
            هذا الأسبوع
            {data && <span className="rounded-full bg-primary/20 px-2 font-num text-[12px]">{data.counts.due}</span>}
          </button>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل الأقساط…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {/* ═══ المتأخرة أولاً ═══ */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle>
                  <span className="flex items-center gap-1.5 text-[#F87171]">
                    <AlarmClock className="size-4" aria-hidden />
                    متأخرة ({late.length})
                  </span>
                </SectionTitle>
                {late.length > 0 && (
                  <AmountText value={data!.counts.lateTotal} currency="YER" size="sm" variant="neg" />
                )}
              </div>
              {late.length === 0 ? (
                <p className="rounded-xl border border-border/60 bg-card p-3 text-center text-[13px] text-muted-foreground">
                  لا أقساط متأخرة 🎉
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {late.map((item) => (
                    <DueRow key={item.installmentId} item={item} onCollect={() => setCollecting(item)} onRemind={() => remind(item)} lateMode />
                  ))}
                </div>
              )}
            </div>

            {/* ═══ المستحق بالنطاق ═══ */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle>
                  {scope === "today" ? "مستحق اليوم" : "مستحق هذا الأسبوع"} ({due.length})
                </SectionTitle>
                {due.length > 0 && (
                  <AmountText value={data!.counts.dueTotal} currency="YER" size="sm" variant="due" />
                )}
              </div>
              {due.length === 0 ? (
                <p className="rounded-xl border border-border/60 bg-card p-3 text-center text-[13px] text-muted-foreground">
                  لا أقساط {scope === "today" ? "اليوم" : "هذا الأسبوع"} — راجع لاحقاً
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {due.map((item) => (
                    <DueRow key={item.installmentId} item={item} onCollect={() => setCollecting(item)} onRemind={() => remind(item)} />
                  ))}
                </div>
              )}
            </div>

            {late.length === 0 && due.length === 0 && (
              <EmptyState icon={CalendarClock} message="لا أقساط مستحقة حالياً" hint="ستظهر هنا الأقساط في يوم استحقاقها وما تأخر منها" />
            )}
          </div>
        )}
      </div>

      <CollectSheet
        key={collecting?.installmentId ?? "none"}
        open={Boolean(collecting)}
        onOpenChange={(o) => !o && setCollecting(null)}
        installment={
          collecting
            ? {
                id: collecting.installmentId,
                seq: collecting.seq,
                dueDate: collecting.dueDate,
                amount: collecting.amount,
                paidAmount: collecting.paidAmount,
                remaining: collecting.remaining,
                status: collecting.isLate ? "late" : "pending",
                isLate: collecting.isLate,
                paidAt: null,
                cashTxId: null,
              }
            : null
        }
        customerName={collecting?.customerName}
        currencyCode={collecting?.currencyCode}
        onCollected={() => refresh()}
      />
    </div>
  )
}

function DueRow({
  item,
  onCollect,
  onRemind,
  lateMode = false,
}: {
  item: DueItem
  onCollect: () => void
  onRemind: () => void
  lateMode?: boolean
}) {
  return (
    <AppCard
      className={cn(
        "flex items-center gap-2.5 py-3",
        lateMode && "border-[#F87171]/40 bg-[#F87171]/[0.06]"
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold",
          lateMode ? "bg-[#F87171]/15 text-[#F87171]" : "bg-primary/15 text-primary"
        )}
      >
        {item.customerName.trim().charAt(0)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14.5px] font-bold">{item.customerName}</span>
          {lateMode ? (
            <StatusChip status="late" label={`متأخر ${item.daysLate} يوم`} />
          ) : (
            <StatusChip status="due" />
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-num text-[12px] text-muted-foreground">
          <span>
            قسط #{item.seq}/{item.installmentsCount}
          </span>
          <span>•</span>
          <span>استحقاق {formatDateDisplay(item.dueDate)}</span>
          {item.invoiceNo && (
            <>
              <span>•</span>
              <span>{item.invoiceNo}</span>
            </>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <AmountText value={item.remaining} currency={item.currencyCode} size="md" variant={lateMode ? "neg" : "due"} />
          {item.paidAmount > 0 && (
            <span className="font-num text-[11.5px] text-muted-foreground">
              (مدفوع {formatAmount(item.paidAmount, { currency: item.currencyCode })})
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <PrimaryButton variant="success" className="min-h-10 px-3 text-[12.5px]" onClick={onCollect}>
          تحصيل
        </PrimaryButton>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onRemind}
            aria-label={`تذكير واتساب ${item.customerName}`}
            className="flex size-10 flex-1 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366] active:scale-95"
          >
            <svg viewBox="0 0 24 24" className="size-4.5" fill="currentColor" aria-hidden>
              <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2m4.52 11.87c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.27z" />
            </svg>
          </button>
          {item.customerPhone && (
            <a
              href={`tel:${item.customerPhone}`}
              aria-label={`اتصال ${item.customerName}`}
              className="flex size-10 flex-1 items-center justify-center rounded-xl bg-primary/15 text-primary active:scale-95"
            >
              <Phone className="size-4" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </AppCard>
  )
}
