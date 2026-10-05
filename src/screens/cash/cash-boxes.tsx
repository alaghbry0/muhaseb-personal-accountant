"use client";

/**
 * الخزينة — 09_الصندوق (FR-04-01/06): كل الصناديق بأرصدتها الحية بعملاتها
 * + الإجمالي بالأساس + سجل حركات موحّد قابل للفلترة حسب النوع/الصندوق.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Wallet, ChevronLeft, Receipt } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount, formatDateDisplay } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { AmountText, EmptyState, ListRow, SectionTitle } from "@/components/ds";
import { TX_META, TxDetailsSheet } from "@/components/cash/tx-details-sheet";
import type { CashTxDto } from "@/domain/cash";
import { cn } from "@/lib/utils";

interface CashboxesResponse {
  cashboxes: Array<{
    id: number;
    name: string;
    currencyCode: string;
    isDefault: boolean;
    balance: number;
    balanceBase: number;
    lastTxDate: string | null;
    txCount: number;
  }>;
  totalBase: number;
}

interface TxResponse {
  txs: CashTxDto[];
  total: number;
  page: number;
  pages: number;
}

const FILTERS: Array<{ id: string; label: string }> = [
  { id: "", label: "كل الحركات" },
  { id: "receipt", label: "قبض" },
  { id: "payment", label: "صرف" },
  { id: "expense", label: "مصروف" },
  { id: "box_transfer", label: "تحويل" },
  { id: "employee_advance", label: "سحبيات" },
  { id: "bank_deposit", label: "إيداع بنكي" },
  { id: "bank_withdraw", label: "سحب بنكي" },
  { id: "salary_batch", label: "رواتب" },
];

export default function CashBoxesScreen() {
  const { push } = useNav();
  const [typeFilter, setTypeFilter] = useState("");
  const [boxFilter, setBoxFilter] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [selectedTx, setSelectedTx] = useState<CashTxDto | null>(null);

  const { data: boxesData, isLoading } = useQuery<CashboxesResponse>({
    queryKey: ["cashbox", "boxes"],
    queryFn: () => getJson<CashboxesResponse>("/api/cashbox"),
  });

  const txUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (typeFilter) p.set("type", typeFilter);
    if (boxFilter) p.set("cashboxId", String(boxFilter));
    p.set("page", String(page));
    p.set("limit", "20");
    return `/api/cashbox/tx?${p.toString()}`;
  }, [typeFilter, boxFilter, page]);

  const { data: txData, isLoading: txLoading } = useQuery<TxResponse>({
    queryKey: ["cashbox", "tx", txUrl],
    queryFn: () => getJson<TxResponse>(txUrl),
  });

  const boxes = boxesData?.cashboxes ?? [];
  const txs = txData?.txs ?? [];

  return (
    <div className="flex min-h-full flex-col pb-6">
      {/* ─── رأس + إجمالي النقدية ─── */}
      <div className="bg-gradient-cyan relative overflow-hidden p-4 pb-5 text-[#06202B]">
        <div className="pointer-events-none absolute -left-8 -top-10 size-36 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[18px] font-extrabold">الخزينة</span>
            <span className="flex items-center gap-1.5 text-[13px] font-medium opacity-80">
              <Wallet className="size-3.5" aria-hidden />
              إجمالي النقدية بالعملة الأساسية
            </span>
            <span dir="ltr" className="font-num text-[26px] font-extrabold leading-tight">
              {formatAmount(boxesData?.totalBase ?? 0, { currency: "YER" })}
            </span>
            <span className="text-[12px] font-medium opacity-70">
              {boxes.length} صندوق • {boxes.filter((b) => Math.abs(b.balance) > 0).length} برصيد
            </span>
          </div>
          <button
            type="button"
            onClick={() => push("cash-tx-new")}
            aria-label="حركة جديدة"
            className="flex items-center gap-1.5 rounded-xl bg-[#06202B] px-3.5 py-2.5 text-[13px] font-bold text-white active:scale-95"
          >
            <Plus className="size-4" aria-hidden />
            حركة جديدة
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-3">
        {/* ─── بطاقات الصناديق ─── */}
        {isLoading ? (
          <p className="py-6 text-center text-[13.5px] text-muted-foreground">جارٍ تحميل الصناديق…</p>
        ) : (
          boxes.map((b) => (
            <div key={b.id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-[0_2px_12px_rgba(0,0,0,0.25)]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "flex size-11 items-center justify-center rounded-xl",
                      b.balance >= 0 ? "bg-primary/15 text-primary" : "bg-[#F87171]/15 text-[#F87171]"
                    )}
                  >
                    <Wallet className="size-5" aria-hidden />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-[15px] font-bold text-foreground">{b.name}</span>
                    <span className="text-[12px] text-muted-foreground">
                      {b.currencyCode === "YER" ? "ريال يمني" : b.currencyCode === "SAR" ? "ريال سعودي" : b.currencyCode} •{" "}
                      {b.txCount} حركة{b.lastTxDate ? ` • آخر نشاط ${formatDateDisplay(b.lastTxDate)}` : " • لا نشاط"}
                    </span>
                  </div>
                </div>
                <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-num text-[11.5px] font-bold text-primary">
                  {b.currencyCode}
                </span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <AmountText
                  value={b.balance}
                  currency={b.currencyCode}
                  size="2xl"
                  variant={b.balance >= 0 ? "primary" : "neg"}
                />
                {b.currencyCode !== "YER" && (
                  <span dir="ltr" className="font-num text-[12px] text-muted-foreground">
                    ≈ {formatAmount(b.balanceBase, { currency: "YER" })}
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => push("cash-tx-new", { cashboxId: b.id })}
                  className="rounded-xl bg-primary/10 py-2.5 text-[12.5px] font-bold text-primary transition-colors hover:bg-primary/20 active:scale-95"
                >
                  حركة جديدة
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBoxFilter(boxFilter === b.id ? null : b.id);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-xl border py-2.5 text-[12.5px] font-bold transition-colors active:scale-95",
                    boxFilter === b.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card text-foreground hover:bg-accent/30"
                  )}
                >
                  كشف الحركات
                </button>
                <button
                  type="button"
                  onClick={() => push("cash-shift", { cashboxId: b.id })}
                  className="rounded-xl border border-border bg-card py-2.5 text-[12.5px] font-bold text-foreground transition-colors hover:bg-accent/30 active:scale-95"
                >
                  الوردية
                </button>
              </div>
            </div>
          ))
        )}

        {/* ─── سجل الحركات الموحّد ─── */}
        <SectionTitle>
          آخر الحركات {boxFilter ? <span className="text-[12px] font-normal text-muted-foreground">(مفلترة على صندوق)</span> : null}
        </SectionTitle>
        <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setTypeFilter(f.id);
                setPage(1);
              }}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-bold transition-colors",
                typeFilter === f.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border/70 text-muted-foreground hover:bg-accent/30"
              )}
            >
              {f.label}
            </button>
          ))}
          {boxFilter && (
            <button
              type="button"
              onClick={() => setBoxFilter(null)}
              className="ms-1 shrink-0 rounded-full border border-[#FBBF24]/50 bg-[#FBBF24]/10 px-3 py-1.5 text-[12.5px] font-bold text-[#FBBF24]"
            >
              ✕ {boxes.find((b) => b.id === boxFilter)?.name ?? "صندوق"}
            </button>
          )}
        </div>

        {txLoading ? (
          <p className="py-6 text-center text-[13.5px] text-muted-foreground">جارٍ تحميل الحركات…</p>
        ) : txs.length === 0 ? (
          <EmptyState
            icon={Wallet}
            message="لا توجد حركات"
            hint="سجّل أول حركة نقدية من زر «حركة جديدة»"
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {txs.map((t) => {
              const meta = TX_META[t.txType] ?? { icon: Receipt, color: "#94A3B8", label: t.txType };
              const Icon = meta.icon;
              const party =
                t.customerName ?? t.supplierName ?? t.employeeName ?? t.expenseCategoryName ?? null;
              return (
                <ListRow
                  key={t.id}
                  onClick={() => setSelectedTx(t)}
                  leading={
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                  }
                  title={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold">{t.txTypeLabel}</span>
                      {party && <span className="text-muted-foreground">— {party}</span>}
                      {t.txType === "box_transfer" && t.toCashboxName && (
                        <span className="text-[12px] text-muted-foreground">إلى {t.toCashboxName}</span>
                      )}
                    </span>
                  }
                  subtitle={
                    <span className="line-clamp-1">
                      {formatDateDisplay(t.txDate)} • {t.cashboxName}
                      {t.description ? ` • ${t.description}` : ""}
                    </span>
                  }
                  trailing={
                    <span className="flex flex-col items-end gap-0.5">
                      <AmountText
                        value={t.amount}
                        currency={t.currencyCode}
                        size="md"
                        variant={t.direction >= 0 ? "pos" : "neg"}
                        signed
                      />
                      <span className="font-num text-[11px] text-muted-foreground">{meta.label}</span>
                    </span>
                  }
                />
              );
            })}
            {(txData?.pages ?? 1) > page && (
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="mx-auto flex items-center gap-1 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-bold text-foreground hover:bg-accent/30"
              >
                تحميل المزيد
                <ChevronLeft className="size-4" aria-hidden />
              </button>
            )}
          </div>
        )}

      </div>

      {/* ─── ورقة تفاصيل/تعديل/حذف الحركة (FR-04-08) ─── */}
      <TxDetailsSheet tx={selectedTx} open={!!selectedTx} onOpenChange={(o) => !o && setSelectedTx(null)} />
    </div>
  );
}
