"use client";

/**
 * السحبيات (FR-07-03): نموذج صرف سحبية (موظف/مبلغ/صندوق/تاريخ/بيان)
 * + رصيد غير مخصوم لكل موظف + سجل السحبيات.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HandCoins, Plus } from "lucide-react";
import { getJson } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { formatAmount } from "@/lib/format";
import {
  AppHeader, AppCard, AmountText, EmptyState, StatusChip,
} from "@/components/ds";
import { AdvanceForm } from "@/components/employees/advance-form";
import { cn } from "@/lib/utils";

interface AdvancesResponse {
  advances: Array<{
    id: number;
    txDate: string;
    employeeId: number;
    employeeName: string;
    amount: number;
    currencyCode: string;
    exchangeRate: number;
    amountBase: number;
    description: string | null;
    cashboxName: string;
  }>;
  balances: Array<{ employeeId: number; name: string; unpaidBase: number }>;
}

export default function EmployeesAdvancesScreen() {
  const { push } = useNav();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [employeeFilter, setEmployeeFilter] = useState<number | null>(null);

  const { data, isLoading } = useQuery<AdvancesResponse>({
    queryKey: ["advances", "list"],
    queryFn: () => getJson<AdvancesResponse>("/api/advances?limit=100"),
  });

  const advances = useMemo(
    () => (data?.advances ?? []).filter((a) => !employeeFilter || a.employeeId === employeeFilter),
    [data, employeeFilter]
  );
  const balances = data?.balances ?? [];
  const totalUnpaid = balances.reduce((s, b) => s + b.unpaidBase, 0);

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="السحبيات"
        action={
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            aria-label="سحبية جديدة"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="flex flex-col gap-2 px-3 pb-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-3.5">
              <span className="text-[12.5px] text-muted-foreground">سحبيات غير مخصومة (إجمالي)</span>
              <AmountText value={totalUnpaid} currency="YER" size="lg" variant="due" />
            </div>
            <div className="flex flex-col gap-1 rounded-2xl border border-border/60 bg-card p-3.5">
              <span className="text-[12.5px] text-muted-foreground">عدد السحبيات</span>
              <AmountText value={data?.advances.length ?? 0} size="lg" plain />
            </div>
          </div>
          <div className="scrollbar-slim flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setEmployeeFilter(null)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                employeeFilter === null
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent/30"
              )}
            >
              كل الموظفين
            </button>
            {balances.map((b) => (
              <button
                key={b.employeeId}
                type="button"
                onClick={() => setEmployeeFilter(b.employeeId)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-bold transition-colors",
                  employeeFilter === b.employeeId
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent/30"
                )}
              >
                {b.name}
                {b.unpaidBase > 0.005 && (
                  <span className="font-num rounded-full bg-[#FBBF24]/15 px-1.5 text-[11px] text-[#FBBF24]">
                    {formatAmount(b.unpaidBase, { currency: "YER", showSymbol: false })}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل السحبيات…</p>
        ) : advances.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            message="لا سحبيات"
            hint="صرف سلفة لموظف تُخصم تلقائياً من مسير راتبه الشهري"
            className="py-12"
          />
        ) : (
          <div className="flex flex-col">
            {advances.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => push("employees-card", { employeeId: a.employeeId })}
                className="flex min-h-16 w-full items-center gap-3 border-b border-border/60 px-1 py-3 text-start transition-colors hover:bg-accent/30"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#F87171]/12 text-[15px] font-bold text-[#F87171]">
                  {a.employeeName.trim().charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[15px] font-medium">{a.employeeName}</span>
                    <StatusChip status="pending" label={a.cashboxName} />
                  </span>
                  <span className="block truncate text-[12.5px] text-muted-foreground">
                    {a.description || "سحبية من الراتب"}
                  </span>
                  <span className="font-num block text-[12px] text-muted-foreground">{a.txDate}</span>
                </span>
                <span className="flex flex-col items-end">
                  <AmountText
                    value={a.amount}
                    currency={a.currencyCode}
                    size="md"
                    variant="neg"
                  />
                  {a.currencyCode !== "YER" && (
                    <span className="font-num text-[11px] text-muted-foreground">
                      ≈ {formatAmount(a.amountBase, { currency: "YER", showSymbol: false })} ر.ي
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {balances.some((b) => b.unpaidBase > 0.005) && (
          <AppCard className="mt-3">
            <p className="text-[12.5px] font-bold text-muted-foreground">أرصدة تُخصم من مسير الشهر الحالي</p>
            <div className="mt-2 flex flex-col gap-1.5">
              {balances
                .filter((b) => b.unpaidBase > 0.005)
                .map((b) => (
                  <div key={b.employeeId} className="flex items-center justify-between text-[13.5px]">
                    <span>{b.name}</span>
                    <AmountText value={b.unpaidBase} currency="YER" size="sm" variant="due" />
                  </div>
                ))}
            </div>
          </AppCard>
        )}
      </div>

      <AdvanceForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["advances", "list"] })}
      />
    </div>
  );
}
