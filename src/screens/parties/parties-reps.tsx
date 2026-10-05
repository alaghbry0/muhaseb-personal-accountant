"use client";

/**
 * المناديب — FR-06-01: قائمة (الاسم + نوع العمولة + النسبة + المناطق + مستحق)
 * → بطاقة المندوب. + إنشاء/تعديل مندوب (FAB «مندوب جديد» + زر تعديل في كل صف)
 * عبر POST/PATCH /api/reps (جاهزة من 4-b) — أُضيفت في Task 5 (فجوة موثقة).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Handshake, MapPin, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { getJson, postJson, patchJson } from "@/lib/api";
import { useNav } from "@/lib/nav";
import { AppHeader, ListRow, AmountText, EmptyState, StatusChip, PrimaryButton } from "@/components/ds";
import { TextField, ToggleRow } from "@/components/settings/fields";
import { PosSheet } from "@/components/pos/pos-sheet";
import { cn } from "@/lib/utils";

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

const TYPE_OPTIONS: Array<{ id: "sales" | "collection" | "both"; label: string; hint: string }> = [
  { id: "sales", label: "على المبيعات", hint: "عمولة من فواتير البيع" },
  { id: "collection", label: "على التحصيل", hint: "عمولة من تحصيل الأقساط" },
  { id: "both", label: "الاثنين", hint: "بيع + تحصيل" },
]

type RepForm = {
  id: number | null
  name: string
  phone: string
  commissionType: "sales" | "collection" | "both"
  commissionPercent: string
  areas: string
  active: boolean
}

const EMPTY_FORM: RepForm = {
  id: null,
  name: "",
  phone: "",
  commissionType: "sales",
  commissionPercent: "2",
  areas: "",
  active: true,
}

export default function PartiesRepsScreen() {
  const { push } = useNav();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ reps: RepListItem[] }>({
    queryKey: ["parties", "reps"],
    queryFn: () => getJson<{ reps: RepListItem[] }>("/api/parties/reps"),
  });

  const reps = data?.reps ?? [];

  // ─── نموذج الإنشاء/التعديل ───
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<RepForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };
  const openEdit = (r: RepListItem) => {
    setForm({
      id: r.id,
      name: r.name,
      phone: r.phone ?? "",
      commissionType: r.commissionType,
      commissionPercent: String(r.commissionPercent),
      areas: r.areas ?? "",
      active: true,
    });
    setFormOpen(true);
  };

  async function save() {
    if (!form.name.trim()) {
      toast.error("اسم المندوب إلزامي");
      return;
    }
    const percent = Number(form.commissionPercent);
    if (!(percent >= 0 && percent <= 100)) {
      toast.error("نسبة العمولة يجب أن تكون بين 0 و 100");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      commissionType: form.commissionType,
      commissionPercent: percent,
      areas: form.areas.trim() || null,
    };
    try {
      if (form.id == null) {
        await postJson("/api/reps", payload);
        toast.success("تمت إضافة المندوب");
      } else {
        await patchJson(`/api/reps/${form.id}`, payload);
        toast.success("تم تعديل بيانات المندوب");
      }
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ["parties", "reps"] });
      qc.invalidateQueries({ queryKey: ["pos-reps"] });
    } catch {
      /* توست من api.ts */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-col">
      <AppHeader title="المناديب" />
      <div className="flex-1 px-3 py-2 pb-24">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ تحميل المناديب…</p>
        ) : reps.length === 0 ? (
          <EmptyState icon={Handshake} message="لا مناديب بعد" hint="أضف مندوبك الأول من زر «مندوب جديد»" />
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
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`تعديل ${r.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(r);
                      }}
                      className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-primary/15 hover:text-primary"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    {r.commissionDue > 0.005 ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <AmountText value={r.commissionDue} currency="YER" size="sm" variant="due" />
                        <span className="text-[10.5px] text-muted-foreground">مستحقة</span>
                      </span>
                    ) : null}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* FAB مندوب جديد */}
      <button
        type="button"
        onClick={openNew}
        aria-label="مندوب جديد"
        className="absolute bottom-6 left-5 z-20 flex size-14 items-center justify-center rounded-full bg-gradient-cyan text-[#06202B] shadow-[0_6px_20px_rgba(34,211,238,0.45)] transition-transform active:scale-95"
      >
        <Plus className="size-6" aria-hidden />
      </button>

      {/* نموذج إنشاء/تعديل */}
      <PosSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        title={form.id == null ? "مندوب جديد" : `تعديل: ${form.name}`}
        description={form.id == null ? "مندوب بيع/تحصيل بنسبة عمولة" : "تعديل البيانات ونسبة العمولة"}
      >
        <div className="flex flex-col gap-3">
          <TextField
            label="اسم المندوب"
            required
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            placeholder="مثال: خالد سالم"
          />
          <TextField
            label="الهاتف"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            type="tel"
            dir="ltr"
            placeholder="77xxxxxxx"
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-[13.5px] font-bold text-foreground">نوع العمولة</span>
            <div className="flex flex-col gap-1.5">
              {TYPE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, commissionType: o.id }))}
                  aria-pressed={form.commissionType === o.id}
                  className={cn(
                    "flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3.5 text-right transition-colors",
                    form.commissionType === o.id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-muted/40 text-foreground"
                  )}
                >
                  <span className="text-[14px] font-bold">{o.label}</span>
                  <span className="text-[11.5px] text-muted-foreground">{o.hint}</span>
                </button>
              ))}
            </div>
          </div>
          <TextField
            label="نسبة العمولة"
            value={form.commissionPercent}
            onChange={(v) => setForm((f) => ({ ...f, commissionPercent: v }))}
            type="number"
            suffix="%"
            hint="من 0 إلى 100 — تُحسب تلقائياً على مستحق المندوب"
          />
          <TextField
            label="المناطق"
            value={form.areas}
            onChange={(v) => setForm((f) => ({ ...f, areas: v }))}
            placeholder="مثال: شمال المدينة — الأحياء الغربية"
            hint="اختياري — للتعريف بنطاق عمل المندوب"
          />
          <PrimaryButton block loading={saving} onClick={save}>
            {form.id == null ? (
              <>
                <Plus className="size-4" aria-hidden /> إضافة المندوب
              </>
            ) : (
              "حفظ التعديلات"
            )}
          </PrimaryButton>
        </div>
      </PosSheet>
    </div>
  );
}
