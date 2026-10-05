"use client";

/**
 * البحث الشامل v2 — بحث موحّد في كل بيانات التطبيق:
 * أصناف / عملاء / موردون / كل المستندات (بيع، شراء، مرتجع بيع، مرتجع شراء) / عروض الأسعار.
 * حقل لاصق أعلى الشاشة (تركيز تلقائي + مسح ✕ + debounce 250ms + حد أدنى حرفان)
 * + 5 نداءات متوازية على الـ APIs القائمة + قسم نتائج لكل نوع بعدّاد لوني.
 * كل مستند يحمل رقاقة نوع ملوّنة (بيع سماوي / شراء كهرماني / مرتجعات حمراء)
 * والضغط يفتح الشاشة الصحيحة. عروض الأسعار تفتح قائمتها (تفاصيلها لوحة داخلية).
 * اختصار الفتح من أي شاشة: Ctrl+K (انظر app-shell) — تلميح kbd تحت حقل البحث.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, AlertTriangle, Phone, MapPin, Package, ReceiptText, FileText,
} from "lucide-react";
import { getJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useNav } from "@/lib/nav";
import type {
  ProductSearchResponse, InvoiceListResponse, QuotationListResponse, InvoiceListItemDto,
} from "@/domain/dto";
import type { CustomerDto, SupplierDto } from "@/domain/parties";
import {
  AppHeader, AppCard, ListRow, AmountText, EmptyState, SectionTitle, StatusChip, SearchBar,
} from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface CustomersResponse {
  customers: CustomerDto[];
}

interface SuppliersResponse {
  suppliers: SupplierDto[];
}

const MIN_CHARS = 2;
const DEBOUNCE_MS = 250;

/** كل أنواع المستندات في بحث واحد (docType مفصولة بفواصل — مدعوم في GET /api/invoices منذ 7-a) */
const ALL_DOC_TYPES = "sale,purchase,sale_return,purchase_return";

/** رقاقة نوع المستند — لون مميز لكل نوع ضمن هوية التطبيق */
const DOC_CHIPS: Record<string, { label: string; color: string }> = {
  sale: { label: "بيع", color: "#22D3EE" },
  purchase: { label: "شراء", color: "#FBBF24" },
  sale_return: { label: "مرتجع بيع", color: "#F87171" },
  purchase_return: { label: "مرتجع شراء", color: "#FB923C" },
};

/** قيمة مؤجّلة — تُحدَّث بعد توقّف الكتابة (نفس نمط شاشة البيع) */
function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** شارة عدّاد ملوّنة في رأس القسم */
function CountChip({ count, color }: { count: number; color: string }) {
  return (
    <span
      className={cn("font-num rounded-full px-2.5 py-0.5 text-[12px] font-bold leading-5")}
      style={{ backgroundColor: `${color}1A`, color }}
    >
      {formatAmount(count, { decimals: 0, showSymbol: false })}
    </span>
  );
}

/** رقاقة نوع المستند (بيع/شراء/مرتجع بيع/مرتجع شراء) بألوان الهوية */
function DocTypeChip({ docType }: { docType: string }) {
  const m = DOC_CHIPS[docType] ?? { label: docType, color: "#94A3B8" };
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4"
      style={{ backgroundColor: `${m.color}1A`, color: m.color, borderColor: `${m.color}30` }}
    >
      {m.label}
    </span>
  );
}

export default function GlobalSearchScreen() {
  const { push } = useNav();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), DEBOUNCE_MS);
  const active = debounced.length >= MIN_CHARS;

  const enc = encodeURIComponent(debounced);

  // ─── 5 نداءات متوازية على الـ APIs القائمة ───
  const productsQ = useQuery<ProductSearchResponse>({
    queryKey: ["global-search", "products", debounced],
    queryFn: () => getJson<ProductSearchResponse>(`/api/products/search?q=${enc}&limit=20`),
    enabled: active,
  });

  const customersQ = useQuery<CustomersResponse>({
    queryKey: ["global-search", "customers", debounced],
    queryFn: () => getJson<CustomersResponse>(`/api/parties/customers?q=${enc}&limit=20`),
    enabled: active,
  });

  const suppliersQ = useQuery<SuppliersResponse>({
    queryKey: ["global-search", "suppliers", debounced],
    queryFn: () => getJson<SuppliersResponse>(`/api/parties/suppliers?q=${enc}&limit=20`),
    enabled: active,
  });

  const invoicesQ = useQuery<InvoiceListResponse>({
    queryKey: ["global-search", "invoices", debounced],
    queryFn: () =>
      getJson<InvoiceListResponse>(`/api/invoices?q=${enc}&docType=${ALL_DOC_TYPES}&page=1`),
    enabled: active,
  });

  const quotationsQ = useQuery<QuotationListResponse>({
    queryKey: ["global-search", "quotations", debounced],
    queryFn: () => getJson<QuotationListResponse>(`/api/quotations?q=${enc}&page=1`),
    enabled: active,
  });

  const products = productsQ.data?.products ?? [];
  const customers = customersQ.data?.customers ?? [];
  const suppliers = suppliersQ.data?.suppliers ?? [];
  const invoices = invoicesQ.data?.invoices ?? [];
  const quotations = quotationsQ.data?.quotations ?? [];

  const searching =
    active &&
    (productsQ.isLoading || customersQ.isLoading || suppliersQ.isLoading ||
      invoicesQ.isLoading || quotationsQ.isLoading);
  const anyResults =
    products.length > 0 || customers.length > 0 || suppliers.length > 0 ||
    invoices.length > 0 || quotations.length > 0;

  /** فتح المستند في شاشته الصحيحة: البيع في تفاصيل المبيعات، والبقية في تفاصيل المشتريات */
  function openInvoice(inv: InvoiceListItemDto) {
    if (inv.docType === "sale") {
      push("sales-invoice-details", { invoiceId: inv.id });
    } else {
      // الشراء + مرتجع شراء + مرتجع بيع — كلها تُعرض في شاشة تفاصيل المشتريات
      push("purchases-details", { invoiceId: inv.id });
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="البحث الشامل">
        <div className="px-3 pb-3">
          <SearchBar
            value={q}
            onChange={setQ}
            autoFocus
            placeholder="ابحث في كل شيء — صنف، عميل، مورد، فاتورة، عرض سعر…"
          />
          {/* تلميح الاختصار — يُكتشف من أي شاشة عبر app-shell */}
          <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-[11px] text-muted-foreground">
            <kbd
              dir="ltr"
              className="font-num rounded-md border border-border bg-muted px-1.5 py-px text-[10px] leading-4 text-muted-foreground"
            >
              Ctrl + K
            </kbd>
            <span>يفتح البحث من أي شاشة</span>
          </p>
        </div>
      </AppHeader>

      <div className="flex-1 px-3 py-3">
        {/* ─── أقل من حرفين: تلميح ─── */}
        {!active ? (
          <EmptyState
            icon={Search}
            message="اكتب حرفين على الأقل"
            hint="البحث يشمل الأصناف والعملاء والموردين وكل المستندات (بيع/شراء/مرتجعات) وعروض الأسعار"
          />
        ) : searching && !anyResults ? (
          /* ─── هياكل تحميل لكل قسم ─── */
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : !anyResults ? (
          /* ─── لا نتائج ─── */
          <EmptyState
            icon={Search}
            message={`لا نتائج لـ"${debounced}"`}
            hint="جرّب كلمة أقصر أو تغيّر الإملاء — البحث يشمل الأصناف والعملاء والموردين وأرقام المستندات وعروض الأسعار"
          />
        ) : (
          <div className="flex flex-col gap-4">
            {/* ─── الأصناف ─── */}
            {(productsQ.isLoading || products.length > 0) && (
              <section aria-label="نتائج الأصناف">
                <SectionTitle
                  action={<CountChip count={products.length} color="#34D399" />}
                  className="mb-1.5"
                >
                  الأصناف
                </SectionTitle>
                <AppCard noPad className="overflow-hidden">
                  {productsQ.isLoading ? (
                    <div className="flex flex-col gap-2 p-3">
                      <Skeleton className="h-14 w-full rounded-lg" />
                      <Skeleton className="h-14 w-full rounded-lg" />
                    </div>
                  ) : (
                    products.map((p) => {
                      const priceCode = "YER" in p.prices ? "YER" : Object.keys(p.prices)[0];
                      const price = priceCode != null ? p.prices[priceCode] : undefined;
                      return (
                        <ListRow
                          key={p.id}
                          onClick={() => push("inventory-product-card", { productId: p.id })}
                          leading={
                            <span className="flex size-11 items-center justify-center rounded-xl bg-[#34D399]/15 text-[#34D399]">
                              <Package className="size-5" aria-hidden />
                            </span>
                          }
                          title={
                            <span className="flex items-center gap-2">
                              <span className="truncate">{p.name}</span>
                              {p.categoryName && (
                                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {p.categoryName}
                                </span>
                              )}
                              {p.isLowStock && (
                                <AlertTriangle
                                  className="size-4 shrink-0 text-[#FBBF24]"
                                  aria-label="تحت الحد الأدنى"
                                />
                              )}
                            </span>
                          }
                          subtitle={
                            <span className="font-num">
                              الرصيد: {formatAmount(p.totalStock, { decimals: 0, showSymbol: false })}
                              {p.unitName ? ` ${p.unitName}` : ""}
                            </span>
                          }
                          trailing={
                            price != null ? (
                              <AmountText value={price} currency={priceCode} size="md" variant="primary" />
                            ) : (
                              <span className="text-[13px] text-muted-foreground">بلا سعر</span>
                            )
                          }
                        />
                      );
                    })
                  )}
                </AppCard>
              </section>
            )}

            {/* ─── العملاء ─── */}
            {(customersQ.isLoading || customers.length > 0) && (
              <section aria-label="نتائج العملاء">
                <SectionTitle
                  action={<CountChip count={customers.length} color="#22D3EE" />}
                  className="mb-1.5"
                >
                  العملاء
                </SectionTitle>
                <AppCard noPad className="overflow-hidden">
                  {customersQ.isLoading ? (
                    <div className="flex flex-col gap-2 p-3">
                      <Skeleton className="h-14 w-full rounded-lg" />
                      <Skeleton className="h-14 w-full rounded-lg" />
                    </div>
                  ) : (
                    customers.map((c) => (
                      <ListRow
                        key={c.id}
                        onClick={() => push("parties-customer-card", { customerId: c.id })}
                        leading={
                          <span className="flex size-11 items-center justify-center rounded-full bg-[#22D3EE]/15 text-[15px] font-bold text-[#22D3EE]">
                            {c.name.trim().charAt(0)}
                          </span>
                        }
                        title={<span className="truncate">{c.name}</span>}
                        subtitle={
                          <span className="flex items-center gap-2">
                            {c.phone && (
                              <span dir="ltr" className="flex items-center gap-1 font-num">
                                <Phone className="size-3" aria-hidden />
                                {c.phone}
                              </span>
                            )}
                            {c.area && (
                              <span className="flex items-center gap-0.5">
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
                            {c.balance > 0.005 && <span className="text-[11px] text-[#FBBF24]">عليه</span>}
                            {c.balance < -0.005 && <span className="text-[11px] text-[#34D399]">له</span>}
                          </span>
                        }
                      />
                    ))
                  )}
                </AppCard>
              </section>
            )}

            {/* ─── الموردون ─── */}
            {(suppliersQ.isLoading || suppliers.length > 0) && (
              <section aria-label="نتائج الموردين">
                <SectionTitle
                  action={<CountChip count={suppliers.length} color="#FBBF24" />}
                  className="mb-1.5"
                >
                  الموردون
                </SectionTitle>
                <AppCard noPad className="overflow-hidden">
                  {suppliersQ.isLoading ? (
                    <div className="flex flex-col gap-2 p-3">
                      <Skeleton className="h-14 w-full rounded-lg" />
                      <Skeleton className="h-14 w-full rounded-lg" />
                    </div>
                  ) : (
                    suppliers.map((s) => (
                      <ListRow
                        key={s.id}
                        onClick={() => push("parties-supplier-card", { supplierId: s.id })}
                        leading={
                          <span className="flex size-11 items-center justify-center rounded-full bg-[#FBBF24]/15 text-[15px] font-bold text-[#FBBF24]">
                            {s.name.trim().charAt(0)}
                          </span>
                        }
                        title={<span className="truncate">{s.name}</span>}
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
                            {s.balance > 0.005 && (
                              <span className="text-[11px] text-muted-foreground">مستحق له</span>
                            )}
                            {s.balance < -0.005 && (
                              <span className="text-[11px] text-[#34D399]">مستحق عليه</span>
                            )}
                          </span>
                        }
                      />
                    ))
                  )}
                </AppCard>
              </section>
            )}

            {/* ─── المستندات والفواتير (بيع/شراء/مرتجعات) ─── */}
            {(invoicesQ.isLoading || invoices.length > 0) && (
              <section aria-label="نتائج المستندات والفواتير">
                <SectionTitle
                  action={<CountChip count={invoices.length} color="#F87171" />}
                  className="mb-1.5"
                >
                  المستندات والفواتير
                </SectionTitle>
                <AppCard noPad className="overflow-hidden">
                  {invoicesQ.isLoading ? (
                    <div className="flex flex-col gap-2 p-3">
                      <Skeleton className="h-14 w-full rounded-lg" />
                      <Skeleton className="h-14 w-full rounded-lg" />
                    </div>
                  ) : (
                    invoices.map((inv) => {
                      const chip = DOC_CHIPS[inv.docType] ?? { label: inv.docType, color: "#94A3B8" };
                      const partyName =
                        inv.supplierName ??
                        inv.customerName ??
                        (inv.docType.startsWith("purchase") ? "مورد نقدي" : "نقدي");
                      return (
                        <ListRow
                          key={inv.id}
                          onClick={() => openInvoice(inv)}
                          leading={
                            <span
                              className="flex size-11 items-center justify-center rounded-xl"
                              style={{ backgroundColor: `${chip.color}1A`, color: chip.color }}
                            >
                              <ReceiptText className="size-5" aria-hidden />
                            </span>
                          }
                          title={
                            <span className="flex items-center gap-1.5">
                              <span className="shrink-0 font-num">{inv.invoiceNo}</span>
                              <DocTypeChip docType={inv.docType} />
                              <StatusChip status={inv.payStatus} />
                              {inv.status === "held" && <StatusChip status="held" />}
                            </span>
                          }
                          subtitle={
                            <span>
                              {partyName}
                              <span className="mx-1.5 text-border">•</span>
                              <span className="font-num">
                                {formatAmount(inv.itemsCount, { decimals: 0, showSymbol: false })}
                              </span>{" "}
                              بنود
                            </span>
                          }
                          trailing={
                            <span className="flex flex-col items-end gap-0.5">
                              <AmountText value={inv.total} currency={inv.currencyCode} size="md" variant="neutral" />
                              {inv.dueAmount > 0 && (
                                <AmountText value={inv.dueAmount} currency={inv.currencyCode} size="sm" variant="due" />
                              )}
                            </span>
                          }
                        />
                      );
                    })
                  )}
                </AppCard>
              </section>
            )}

            {/* ─── عروض الأسعار ─── */}
            {(quotationsQ.isLoading || quotations.length > 0) && (
              <section aria-label="نتائج عروض الأسعار">
                <SectionTitle
                  action={<CountChip count={quotations.length} color="#A78BFA" />}
                  className="mb-1.5"
                >
                  عروض الأسعار
                </SectionTitle>
                <AppCard noPad className="overflow-hidden">
                  {quotationsQ.isLoading ? (
                    <div className="flex flex-col gap-2 p-3">
                      <Skeleton className="h-14 w-full rounded-lg" />
                      <Skeleton className="h-14 w-full rounded-lg" />
                    </div>
                  ) : (
                    quotations.map((qt) => (
                      <ListRow
                        key={qt.id}
                        onClick={() => push("sales-quotations")}
                        leading={
                          <span className="flex size-11 items-center justify-center rounded-xl bg-[#A78BFA]/15 text-[#A78BFA]">
                            <FileText className="size-5" aria-hidden />
                          </span>
                        }
                        title={
                          <span className="flex items-center gap-2">
                            <span className="font-num">{qt.quoteNo}</span>
                            <StatusChip status={qt.status} />
                          </span>
                        }
                        subtitle={
                          <span>
                            {qt.customerName ?? "بدون عميل"}
                            <span className="mx-1.5 text-border">•</span>
                            <span className="font-num">
                              {formatAmount(qt.itemsCount, { decimals: 0, showSymbol: false })}
                            </span>{" "}
                            بنود
                          </span>
                        }
                        trailing={
                          <AmountText value={qt.total} currency={qt.currencyCode} size="md" variant="neutral" />
                        }
                      />
                    ))
                  )}
                </AppCard>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
