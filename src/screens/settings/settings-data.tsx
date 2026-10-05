"use client";

/**
 * البيانات المرجعية (FR-13-06): روابط لمديري الفئات/الوحدات/المخازن/فئات المصاريف
 * + العملات وأسعار الصرف (FR-08-03): قائمة العملات + سعر اليوم لكل عملة + تحديث
 * + سجل آخر 15 يوماً + إدارة الصناديق (إنشاء/افتراضي/أرشفة).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Layers, Ruler, Warehouse, Tags, Coins, Wallet, Plus, Archive, Star,
} from "lucide-react";
import { toast } from "sonner";
import { getJson, postJson, patchJson } from "@/lib/api";
import { AppHeader, AppCard, ListRow, StatusChip, EmptyState, PrimaryButton } from "@/components/ds";
import { useNav } from "@/lib/nav";
import { TextField, ToggleRow } from "@/components/settings/fields";
import { useFormatD } from "@/components/settings/numbers-context";
import { PosSheet } from "@/components/pos/pos-sheet";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// ═══════════ أنواع ═══════════

interface RateHistoryPoint {
  rateDate: string;
  rate: number;
}

interface CurrencyRow {
  id: number;
  code: string;
  name: string;
  isBase: boolean;
  decimals: number;
  isActive: boolean;
  todayRate: number | null;
  todayRateDate: string | null;
  isToday: boolean;
  history: RateHistoryPoint[];
}

interface CashboxRow {
  id: number;
  name: string;
  currencyId: number;
  currencyCode: string;
  currencyName: string;
  isDefault: boolean;
  isArchived: boolean;
}

interface QuickLink {
  title: string;
  subtitle: string;
  screen: string;
  icon: LucideIcon;
  color: string;
}

const QUICK_LINKS: QuickLink[] = [
  { title: "فئات الأصناف", subtitle: "تصنيف المخزون وشجرة الفئات", screen: "inventory-categories", icon: Layers, color: "#22D3EE" },
  { title: "وحدات القياس", subtitle: "قطعة/كرتون/كجم وما يعادلها", screen: "inventory-units", icon: Ruler, color: "#34D399" },
  { title: "المخازن", subtitle: "مخازن التخزين والافتراضي", screen: "inventory-warehouses", icon: Warehouse, color: "#FBBF24" },
  { title: "فئات المصاريف", subtitle: "تصنيف مصروفات التشغيل", screen: "cash-expense-categories", icon: Tags, color: "#F87171" },
];

export default function SettingsDataScreen() {
  const qc = useQueryClient();
  const fmt = useFormatD();
  const { push } = useNav();

  // ═══ العملات وأسعار الصرف ═══
  const ratesQ = useQuery<{ today: string; currencies: CurrencyRow[] }>({
    queryKey: ["settings", "exchange-rates"],
    queryFn: () => getJson<{ today: string; currencies: CurrencyRow[] }>("/api/exchange-rates?days=15"),
  });
  const [rateInputs, setRateInputs] = useState<Record<number, string>>({});
  const [savingRate, setSavingRate] = useState<number | null>(null);

  useEffect(() => {
    if (!ratesQ.data) return;
    const inputs: Record<number, string> = {};
    for (const c of ratesQ.data.currencies) {
      if (!c.isBase && c.todayRate != null) inputs[c.id] = String(c.todayRate);
    }
    setRateInputs(inputs);
  }, [ratesQ.data]);

  async function updateRate(currencyId: number, code: string) {
    const v = Number(rateInputs[currencyId]);
    if (!(v > 0)) {
      toast.error("أدخل سعراً أكبر من صفر");
      return;
    }
    setSavingRate(currencyId);
    try {
      await postJson("/api/exchange-rates", { currencyId, rate: v });
      toast.success(`تم تحديث سعر ${code} لليوم`);
      qc.invalidateQueries({ queryKey: ["settings", "exchange-rates"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch {
      /* توست */
    } finally {
      setSavingRate(null);
    }
  }

  async function toggleCurrency(c: CurrencyRow) {
    try {
      await patchJson("/api/exchange-rates", { currencyId: c.id, isActive: !c.isActive });
      toast.success(!c.isActive ? `تم تنشيط ${c.code}` : `تم إخفاء ${c.code} من الواجهات`);
      qc.invalidateQueries({ queryKey: ["settings", "exchange-rates"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch {
      /* توست */
    }
  }

  // ═══ الصناديق ═══
  const boxesQ = useQuery<{ cashboxes: CashboxRow[] }>({
    queryKey: ["settings", "cashboxes"],
    queryFn: () => getJson<{ cashboxes: CashboxRow[] }>("/api/settings/cashboxes"),
  });
  const [boxFormOpen, setBoxFormOpen] = useState(false);
  const [boxForm, setBoxForm] = useState({ name: "", currencyId: 0, isDefault: false });
  const [savingBox, setSavingBox] = useState(false);

  const currencies = ratesQ.data?.currencies ?? [];
  const activeCurrencies = currencies.filter((c) => c.isActive);

  useEffect(() => {
    if (boxForm.currencyId === 0 && activeCurrencies.length > 0) {
      setBoxForm((f) => ({ ...f, currencyId: activeCurrencies[0].id }));
    }
  }, [ratesQ.data]);

  async function saveBox() {
    if (!boxForm.name.trim()) {
      toast.error("أدخل اسم الصندوق");
      return;
    }
    if (!boxForm.currencyId) {
      toast.error("اختر عملة الصندوق");
      return;
    }
    setSavingBox(true);
    try {
      await postJson("/api/settings/cashboxes", {
        name: boxForm.name.trim(),
        currencyId: boxForm.currencyId,
        isDefault: boxForm.isDefault,
      });
      toast.success("تم إنشاء الصندوق");
      setBoxFormOpen(false);
      setBoxForm({ name: "", currencyId: activeCurrencies[0]?.id ?? 0, isDefault: false });
      qc.invalidateQueries({ queryKey: ["settings", "cashboxes"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch {
      /* توست */
    } finally {
      setSavingBox(false);
    }
  }

  async function patchBox(id: number, data: Record<string, unknown>, msg: string) {
    try {
      await patchJson("/api/settings/cashboxes", { id, ...data });
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["settings", "cashboxes"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch {
      /* توست */
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="البيانات المرجعية" />
      <div className="flex flex-1 flex-col gap-5 p-4 pb-8">
        {/* ═══ روابط المديرين ═══ */}
        <section className="flex flex-col gap-2" aria-label="بيانات أساسية">
          <h2 className="px-1 text-[13px] font-bold text-muted-foreground">البيانات الأساسية</h2>
          <AppCard noPad className="overflow-hidden">
            {QUICK_LINKS.map((l, i) => (
              <ListRow
                key={l.screen}
                title={l.title}
                subtitle={l.subtitle}
                divider={i < QUICK_LINKS.length - 1}
                chevron
                onClick={() => push(l.screen)}
                leading={
                  <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${l.color}1f` }}>
                    <l.icon className="size-5" style={{ color: l.color }} aria-hidden />
                  </span>
                }
              />
            ))}
          </AppCard>
        </section>

        {/* ═══ العملات وأسعار الصرف ═══ */}
        <section className="flex flex-col gap-2" aria-label="العملات وأسعار الصرف">
          <h2 className="flex items-center gap-1.5 px-1 text-[13px] font-bold text-muted-foreground">
            <Coins className="size-3.5" aria-hidden />
            العملات وأسعار الصرف
          </h2>
          {ratesQ.isLoading ? (
            <p className="py-4 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
          ) : (
            <div className="flex flex-col gap-3">
              {currencies.map((c) => (
                <AppCard noPad key={c.id} className="flex flex-col gap-3 p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-num rounded-lg bg-primary/10 px-2 py-0.5 text-[13px] font-bold text-primary">
                        {c.code}
                      </span>
                      <span className="text-[14.5px] font-bold text-foreground">{c.name}</span>
                      {c.isBase ? <StatusChip status="completed" label="أساسية" /> : null}
                      {!c.isActive ? <StatusChip status="held" label="مخفية" /> : null}
                    </div>
                    {!c.isBase ? (
                      <ToggleRow
                        label=""
                        checked={c.isActive}
                        onCheckedChange={() => toggleCurrency(c)}
                      />
                    ) : null}
                  </div>

                  {!c.isBase ? (
                    <>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="mb-1 block text-[12px] text-muted-foreground" htmlFor={`rate-${c.id}`}>
                            سعر اليوم (كم ريال يمني لكل {c.code})
                          </label>
                          <div className="flex h-11 items-center rounded-xl border border-border bg-muted/60 px-3 focus-within:border-primary/70">
                            <input
                              id={`rate-${c.id}`}
                              type="number"
                              inputMode="decimal"
                              dir="ltr"
                              value={rateInputs[c.id] ?? ""}
                              onChange={(e) => setRateInputs((r) => ({ ...r, [c.id]: e.target.value }))}
                              className="font-num h-full w-full bg-transparent text-[15px] font-bold text-foreground outline-none"
                              placeholder="0"
                            />
                          </div>
                        </div>
                        <PrimaryButton
                          loading={savingRate === c.id}
                          onClick={() => updateRate(c.id, c.code)}
                          className="mb-0.5 h-11"
                        >
                          تحديث سعر اليوم
                        </PrimaryButton>
                      </div>
                      <div className="flex items-center justify-between text-[11.5px] text-muted-foreground">
                        <span>
                          {c.isToday ? "سعر اليوم محدَّث" : `آخر سعر: ${c.todayRateDate ?? "—"}`}
                        </span>
                        <span dir="ltr" className="font-num">{c.code}/YER</span>
                      </div>
                      {/* سجل آخر 15 يوماً */}
                      {c.history.length > 0 ? (
                        <div className="overflow-hidden rounded-xl border border-border/60">
                          <div className="max-h-40 overflow-y-auto scrollbar-slim">
                            <table className="w-full text-[12px]">
                              <thead className="sticky top-0 bg-muted/80 text-muted-foreground">
                                <tr>
                                  <th className="px-2.5 py-1.5 text-right font-medium">التاريخ</th>
                                  <th className="px-2.5 py-1.5 text-left font-medium">السعر</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.history.map((h, i) => (
                                  <tr key={h.rateDate} className={i % 2 ? "bg-muted/20" : ""}>
                                    <td className="font-num px-2.5 py-1.5 text-right text-foreground" dir="ltr">
                                      {h.rateDate}
                                    </td>
                                    <td className="font-num px-2.5 py-1.5 text-left font-bold text-foreground" dir="ltr">
                                      {fmt(h.rate, { decimals: 2, showSymbol: false })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[12px] text-muted-foreground">لا يوجد سجل أسعار بعد.</p>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] text-muted-foreground">
                      العملة الأساسية للنظام — سعرها ثابت (1) وكل التقارير تُحسب بها.
                    </p>
                  )}
                </AppCard>
              ))}
            </div>
          )}
        </section>

        {/* ═══ الصناديق ═══ */}
        <section className="flex flex-col gap-2" aria-label="إدارة الصناديق">
          <h2 className="flex items-center justify-between px-1 text-[13px] font-bold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Wallet className="size-3.5" aria-hidden />
              الصناديق
            </span>
            <button
              type="button"
              onClick={() => setBoxFormOpen(true)}
              className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[12px] font-bold text-primary active:scale-95"
            >
              <Plus className="size-3.5" aria-hidden />
              صندوق جديد
            </button>
          </h2>
          <AppCard noPad className="overflow-hidden">
            {boxesQ.isLoading ? (
              <p className="py-4 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
            ) : (boxesQ.data?.cashboxes ?? []).length === 0 ? (
              <div className="p-4">
                <EmptyState icon={Wallet} message="لا صناديق" hint="أضف صندوقاً للبدء" />
              </div>
            ) : (
              (boxesQ.data?.cashboxes ?? []).map((b, i, arr) => (
                <ListRow
                  key={b.id}
                  divider={i < arr.length - 1}
                  title={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={cn(b.isArchived && "text-muted-foreground line-through")}>{b.name}</span>
                      {b.isDefault ? <StatusChip status="completed" label="افتراضي" /> : null}
                      {b.isArchived ? <StatusChip status="held" label="مؤرشف" /> : null}
                    </span>
                  }
                  subtitle={`عملة الصندوق: ${b.currencyName} (${b.currencyCode})`}
                  leading={
                    <span className="flex size-10 items-center justify-center rounded-xl bg-[#22D3EE]/15">
                      <Wallet className="size-5 text-[#22D3EE]" aria-hidden />
                    </span>
                  }
                  trailing={
                    <span className="flex items-center gap-1">
                      {!b.isDefault && !b.isArchived ? (
                        <button
                          type="button"
                          aria-label={`تعيين ${b.name} افتراضياً`}
                          onClick={() => patchBox(b.id, { isDefault: true }, "تم تعيين الصندوق الافتراضي")}
                          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/40"
                        >
                          <Star className="size-4" aria-hidden />
                        </button>
                      ) : null}
                      {!b.isArchived ? (
                        <button
                          type="button"
                          aria-label={`أرشفة ${b.name}`}
                          onClick={() => {
                            if (confirm(`أرشفة الصندوق «${b.name}»؟ يختفي من القوائم مع بقاء حركاته في السجل.`)) {
                              patchBox(b.id, { isArchived: true }, "تمت أرشفة الصندوق");
                            }
                          }}
                          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-[#F87171]/15 hover:text-[#F87171]"
                        >
                          <Archive className="size-4" aria-hidden />
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label={`استعادة ${b.name}`}
                          onClick={() => patchBox(b.id, { isArchived: false }, "تمت استعادة الصندوق")}
                          className="rounded-lg px-2 py-1 text-[11.5px] font-bold text-primary hover:bg-primary/10"
                        >
                          استعادة
                        </button>
                      )}
                    </span>
                  }
                />
              ))
            )}
          </AppCard>
          <p className="px-1 text-[11.5px] leading-5 text-muted-foreground">
            الصندوق ذو الحركات لا يُحذف — يُؤرشف. رصيد كل صندوق يظهر حياً في شاشة الخزينة.
          </p>
        </section>
      </div>

      {/* ═══ نموذج صندوق جديد ═══ */}
      <PosSheet
        open={boxFormOpen}
        onOpenChange={setBoxFormOpen}
        title="صندوق جديد"
        description="لكل صندوق عملة واحدة — حركاته تُسجَّل بها"
      >
        <div className="flex flex-col gap-3">
          <TextField
            label="اسم الصندوق"
            required
            value={boxForm.name}
            onChange={(v) => setBoxForm((f) => ({ ...f, name: v }))}
            placeholder="مثال: صندوق الدولار"
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13.5px] font-bold text-foreground">عملة الصندوق</span>
            <div className="flex flex-wrap gap-2">
              {activeCurrencies.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setBoxForm((f) => ({ ...f, currencyId: c.id }))}
                  aria-pressed={boxForm.currencyId === c.id}
                  className={cn(
                    "font-num rounded-xl border px-3.5 py-2 text-[13.5px] font-bold transition-colors",
                    boxForm.currencyId === c.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-muted/40 text-foreground"
                  )}
                >
                  {c.code} — {c.name}
                </button>
              ))}
            </div>
          </div>
          <ToggleRow
            label="تعيينه صندوقاً افتراضياً"
            hint="يُقترح أولاً في شاشات الدفع والتحصيل"
            checked={boxForm.isDefault}
            onCheckedChange={(v) => setBoxForm((f) => ({ ...f, isDefault: v }))}
          />
          <PrimaryButton block loading={savingBox} onClick={saveBox}>
            <Plus className="size-4" aria-hidden />
            إنشاء الصندوق
          </PrimaryButton>
        </div>
      </PosSheet>
    </div>
  );
}
