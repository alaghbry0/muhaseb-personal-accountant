"use client";

/**
 * سندات القبض والصرف — 05_الموردين/09-10 (مركز السندات):
 * بطاقتا إجراء كبيرتان (سند قبض من عميل / سند صرف لمورد) + آخر السندات
 * (شارة خضراء/حمراء، الطرف، المبلغ، التاريخ) مع إعادة الطباعة.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowUpFromLine, Printer, ReceiptText } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatDate, formatTime12 } from "@/lib/format";
import type { VoucherDto, VoucherKind } from "@/domain/parties";
import type { BootstrapData } from "@/lib/types";
import {
  AppHeader, AppCard, AmountText, EmptyState, StatusChip, PrimaryButton,
} from "@/components/ds";
import { VoucherForm } from "@/components/parties/voucher-form";
import { printVoucher } from "@/components/print/voucher-print";
import { cn } from "@/lib/utils";

export default function PartiesVoucherScreen() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [initialKind, setInitialKind] = useState<VoucherKind>("receipt");
  const [kindFilter, setKindFilter] = useState<"" | VoucherKind>("");

  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 30_000,
  });

  const url = useMemo(() => `/api/vouchers?limit=60${kindFilter ? `&kind=${kindFilter}` : ""}`, [kindFilter]);
  const { data, isLoading } = useQuery<{ vouchers: VoucherDto[] }>({
    queryKey: ["vouchers", url],
    queryFn: () => getJson<{ vouchers: VoucherDto[] }>(url),
  });

  const vouchers = data?.vouchers ?? [];
  const company = boot?.company;

  const openForm = (kind: VoucherKind) => {
    setInitialKind(kind);
    setFormOpen(true);
  };

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="سندات القبض والصرف" />

      <div className="flex-1 px-3 py-3">
        {/* بطاقتا الإجراء */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => openForm("receipt")}
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#34D399]/40 bg-[#34D399]/10 p-4 text-center active:scale-[0.97]"
          >
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[#34D399]/20">
              <ArrowDownToLine className="size-6 text-[#34D399]" aria-hidden />
            </span>
            <span className="text-[15.5px] font-bold text-[#34D399]">سند قبض</span>
            <span className="text-[12px] text-muted-foreground">تحصيل من عميل أو مسترد من مورد</span>
          </button>
          <button
            type="button"
            onClick={() => openForm("payment")}
            className="flex flex-col items-center gap-2 rounded-2xl border border-[#F87171]/40 bg-[#F87171]/10 p-4 text-center active:scale-[0.97]"
          >
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[#F87171]/20">
              <ArrowUpFromLine className="size-6 text-[#F87171]" aria-hidden />
            </span>
            <span className="text-[15.5px] font-bold text-[#F87171]">سند صرف</span>
            <span className="text-[12px] text-muted-foreground">سداد لمورد أو رد نقدي لعميل</span>
          </button>
        </div>

        {/* آخر السندات */}
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-bold">آخر السندات</h2>
          <div className="flex gap-1.5">
            {(
              [
                { id: "", label: "الكل" },
                { id: "receipt", label: "قبض" },
                { id: "payment", label: "صرف" },
              ] as const
            ).map((f) => (
              <button
                key={f.id || "all"}
                type="button"
                onClick={() => setKindFilter(f.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-bold transition-colors",
                  kindFilter === f.id
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل السندات…</p>
        ) : vouchers.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            message="لا سندات بعد"
            hint="سجّل أول سند قبض من عميل أو صرف لمورد"
            actionLabel="سند قبض جديد"
            onAction={() => openForm("receipt")}
          />
        ) : (
          <AppCard noPad>
            {vouchers.map((v) => (
              <div
                key={v.id}
                className="flex min-h-16 items-center gap-2.5 border-b border-border/40 px-3 py-2.5 last:border-0"
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    v.kind === "receipt" ? "bg-[#34D399]/15 text-[#34D399]" : "bg-[#F87171]/15 text-[#F87171]"
                  )}
                >
                  {v.kind === "receipt" ? (
                    <ArrowDownToLine className="size-5" aria-hidden />
                  ) : (
                    <ArrowUpFromLine className="size-5" aria-hidden />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14.5px] font-bold">{v.partyName}</span>
                    <StatusChip
                      status={v.kind === "receipt" ? "paid" : "rejected"}
                      label={v.kind === "receipt" ? "قبض" : "صرف"}
                    />
                  </div>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    <span className="font-num">{v.number}</span>
                    <span className="mx-1">•</span>
                    <span className="font-num">{formatDate(v.txDate)}</span>
                    <span className="mx-1">•</span>
                    <span className="font-num">{formatTime12(v.createdAt)}</span>
                    {v.refInvoiceNo && (
                      <>
                        <span className="mx-1">•</span>
                        <span className="font-num">{v.refInvoiceNo}</span>
                      </>
                    )}
                  </span>
                  {v.description && (
                    <span className="block truncate text-[11.5px] text-muted-foreground">{v.description}</span>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <AmountText
                    value={v.amount}
                    currency={v.currencyCode}
                    size="md"
                    variant={v.kind === "receipt" ? "pos" : "neg"}
                  />
                  <PrimaryButton
                    variant="ghost"
                    className="min-h-9 px-2 py-0 text-[12px] text-primary"
                    onClick={() => {
                      if (!company) return;
                      printVoucher(v, {
                        name: company.name,
                        phone: company.phone,
                        address: company.address,
                        footerText: company.footerText,
                      });
                    }}
                    aria-label={`طباعة ${v.number}`}
                  >
                    <Printer className="size-4" aria-hidden />
                    طباعة
                  </PrimaryButton>
                </div>
              </div>
            ))}
          </AppCard>
        )}
      </div>

      <VoucherForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initialKind={initialKind}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["vouchers"] });
          qc.invalidateQueries({ queryKey: ["parties"] });
        }}
      />
    </div>
  );
}
