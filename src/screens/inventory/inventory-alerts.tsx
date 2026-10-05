"use client";

/**
 * تنبيهات المخزون (FR-01-12) — أصناف تنفذ قريباً (تحت الحد الأدنى مرتبة بالعجز)
 * مع زر «شراء» يفتح فاتورة شراء محضورة بالصنف + قسم «أصناف راكدة» (بلا حركة 90 يوماً).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShoppingCart, Snowflake, PackageX } from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useNav } from "@/lib/nav";
import { AppHeader, ListRow, EmptyState, SectionTitle, AmountText } from "@/components/ds";
import { cn } from "@/lib/utils";

interface AlertsResponse {
  lowStock: Array<{
    id: number;
    name: string;
    barcode: string | null;
    unitName: string | null;
    totalQty: number;
    minStock: number;
    deficit: number;
    costPrice: number;
    stockByWarehouse: Array<{ warehouseId: number; name: string; qty: number }>;
  }>;
  deadStock: Array<{
    id: number;
    name: string;
    unitName: string | null;
    totalQty: number;
    stockValue: number;
  }>;
  cutoffDays: number;
}

export default function InventoryAlertsScreen() {
  const nav = useNav();
  const [tab, setTab] = useState<"low" | "dead">("low");

  const { data, isLoading } = useQuery<AlertsResponse>({
    queryKey: ["stock", "alerts"],
    queryFn: () => getJson<AlertsResponse>("/api/stock/alerts"),
  });

  const lowStock = data?.lowStock ?? [];
  const deadStock = data?.deadStock ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="أصناف تنفذ قريباً">
        <div className="flex gap-2 px-3 pb-3">
          <button
            type="button"
            onClick={() => setTab("low")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13.5px] font-bold transition-colors",
              tab === "low"
                ? "border-[#FBBF24]/50 bg-[#FBBF24]/10 text-[#FBBF24]"
                : "border-border text-muted-foreground hover:bg-accent/30"
            )}
          >
            <AlertTriangle className="size-4" aria-hidden /> تحت الحد الأدنى ({lowStock.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("dead")}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13.5px] font-bold transition-colors",
              tab === "dead"
                ? "border-[#22D3EE]/50 bg-[#22D3EE]/10 text-[#22D3EE]"
                : "border-border text-muted-foreground hover:bg-accent/30"
            )}
          >
            <Snowflake className="size-4" aria-hidden /> راكدة ({deadStock.length})
          </button>
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-2 pb-8">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
        ) : tab === "low" ? (
          lowStock.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              message="لا توجد أصناف ضمن هذه المعايير"
              hint="كل الأصناف فوق حدودها الدنيا — علامة ممتازة"
            />
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between rounded-xl bg-[#FBBF24]/10 px-3 py-2.5">
                <span className="text-[13px] font-bold text-[#FBBF24]">
                  {lowStock.length} صنفاً يحتاج إعادة شراء
                </span>
                <button
                  type="button"
                  onClick={() => nav.push("purchases-new")}
                  className="rounded-lg bg-[#FBBF24]/20 px-3 py-1.5 text-[12.5px] font-bold text-[#FBBF24] hover:bg-[#FBBF24]/30"
                >
                  فاتورة شراء
                </button>
              </div>
              <div className="flex flex-col">
                {lowStock.map((p) => (
                  <ListRow
                    key={p.id}
                    onClick={() => nav.push("inventory-product-card", { productId: p.id })}
                    leading={
                      <span className="flex size-11 items-center justify-center rounded-xl bg-[#F87171]/10 text-[#F87171]">
                        <PackageX className="size-5" aria-hidden />
                      </span>
                    }
                    title={<span className="text-[14.5px]">{p.name}</span>}
                    subtitle={
                      <span className="font-num">
                        الحد الأدنى: {formatAmount(p.minStock, { decimals: 0, showSymbol: false })}
                        {p.unitName ? ` ${p.unitName}` : ""} • العجز:{" "}
                        <span className="font-bold text-[#F87171]">
                          {formatAmount(p.deficit, { decimals: 0, showSymbol: false })}
                        </span>
                        {p.stockByWarehouse.length > 1 && (
                          <span className="text-muted-foreground">
                            {" "}({p.stockByWarehouse.map((w) => `${w.name}: ${formatAmount(w.qty, { decimals: 0, showSymbol: false })}`).join(" · ")})
                          </span>
                        )}
                      </span>
                    }
                    trailing={
                      <span className="flex items-center gap-2">
                        <span className="font-num rounded-md border border-[#F87171]/30 bg-[#F87171]/10 px-2 py-1 text-[13px] font-extrabold text-[#F87171]">
                          {formatAmount(p.totalQty, { decimals: 0, showSymbol: false })}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            nav.push("purchases-new", { preselectProductId: p.id });
                          }}
                          aria-label={`شراء ${p.name}`}
                          className="flex size-11 items-center justify-center rounded-xl bg-[#34D399]/15 text-[#34D399] hover:bg-[#34D399]/25 active:scale-95"
                        >
                          <ShoppingCart className="size-5" aria-hidden />
                        </button>
                      </span>
                    }
                  />
                ))}
              </div>
            </>
          )
        ) : deadStock.length === 0 ? (
          <EmptyState
            icon={Snowflake}
            message="لا أصناف راكدة"
            hint={`كل الأصناف ذات الأرصدة تحرّكت خلال ${data?.cutoffDays ?? 90} يوماً`}
          />
        ) : (
          <>
            <p className="mb-2 rounded-xl bg-[#22D3EE]/10 px-3 py-2.5 text-[13px] font-bold text-[#22D3EE]">
              {deadStock.length} صنفاً بلا حركة خلال {data?.cutoffDays ?? 90} يوماً — راجع عروض أسعارها
            </p>
            <div className="flex flex-col">
              {deadStock.map((p) => (
                <ListRow
                  key={p.id}
                  onClick={() => nav.push("inventory-product-card", { productId: p.id })}
                  leading={
                    <span className="flex size-11 items-center justify-center rounded-xl bg-[#22D3EE]/10 text-[#22D3EE]">
                      <Snowflake className="size-5" aria-hidden />
                    </span>
                  }
                  title={<span className="text-[14.5px]">{p.name}</span>}
                  subtitle={
                    <span className="font-num">
                      الرصيد: {formatAmount(p.totalQty, { decimals: 0, showSymbol: false })}
                      {p.unitName ? ` ${p.unitName}` : ""}
                    </span>
                  }
                  trailing={
                    <AmountText value={p.stockValue} currency="YER" size="sm" variant="neutral" />
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
