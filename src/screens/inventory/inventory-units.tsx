"use client";

/**
 * إدارة وحدات القياس — مع تحويل الوحدات (1 كرتون = 24 قطعة) (FR-01-05).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Ruler, Pencil, Archive, ArchiveRestore, X } from "lucide-react";
import { getJson, postJson, patchJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { AppHeader, ListRow, PrimaryButton, EmptyState, StatusChip } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";

interface UnitRow {
  id: number;
  name: string;
  baseUnitId: number | null;
  baseUnitName: string | null;
  factor: number;
  isArchived: boolean;
  productsCount: number;
}

export default function InventoryUnitsScreen() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseUnitId, setBaseUnitId] = useState<number | null>(null);
  const [factor, setFactor] = useState("");
  const [editing, setEditing] = useState<UnitRow | null>(null);
  const [editFactor, setEditFactor] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<{ units: UnitRow[] }>({
    queryKey: ["units"],
    queryFn: () => getJson<{ units: UnitRow[] }>("/api/units"),
  });
  const units = data?.units ?? [];
  const active = units.filter((u) => !u.isArchived);

  async function addUnit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (baseUnitId && !(Number(factor) > 0)) {
      toast.error("أدخل معامل التحويل (أكبر من صفر)");
      return;
    }
    setBusy(true);
    try {
      await postJson("/api/units", {
        name: trimmed,
        baseUnitId: baseUnitId ?? null,
        factor: baseUnitId ? Number(factor) : 1,
      });
      toast.success(`تمت إضافة الوحدة «${trimmed}»`);
      setName("");
      setBaseUnitId(null);
      setFactor("");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["units"] });
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function saveFactor() {
    if (!editing) return;
    if (!(Number(editFactor) > 0)) {
      toast.error("معامل التحويل يجب أن يكون أكبر من صفر");
      return;
    }
    setBusy(true);
    try {
      await patchJson(`/api/units/${editing.id}`, { factor: Number(editFactor) });
      toast.success("تم تحديث معامل التحويل");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["units"] });
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(u: UnitRow) {
    try {
      await patchJson(`/api/units/${u.id}`, { isArchived: !u.isArchived });
      toast.success(u.isArchived ? `تمت استعادة «${u.name}»` : `تمت أرشفة «${u.name}»`);
      qc.invalidateQueries({ queryKey: ["units"] });
    } catch {
      /* toast */
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="وحدات القياس"
        action={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="وحدة جديدة"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      />
      <div className="flex-1 px-3 py-2">
        <p className="mb-2 rounded-xl bg-muted/40 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
          تحويل الوحدات: وحدة مركّبة = معامل × الوحدة الأساس (كرتون ×24 قطعة) — يُستخدم المعامل عند
          البيع والشراء بالوحدات المركّبة
        </p>
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
        ) : units.length === 0 ? (
          <EmptyState icon={Ruler} message="لا وحدات بعد" hint="أضف وحدة قياس (قطعة، كرتون، كيلو…)" />
        ) : (
          <div className="flex flex-col">
            {units.map((u) => (
              <ListRow
                key={u.id}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[#A78BFA]/10 text-[#A78BFA]">
                    <Ruler className="size-5" aria-hidden />
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className={u.isArchived ? "text-muted-foreground line-through" : ""}>{u.name}</span>
                    {u.isArchived && <StatusChip status="void" label="مؤرشفة" />}
                  </span>
                }
                subtitle={
                  <span className="font-num">
                    {u.baseUnitName
                      ? `×${formatAmount(u.factor, { decimals: 0, showSymbol: false })} ${u.baseUnitName}`
                      : "وحدة أساس"}
                    {" • "}
                    {formatAmount(u.productsCount, { decimals: 0, showSymbol: false })} صنفاً
                  </span>
                }
                trailing={
                  <span className="flex items-center gap-1">
                    {u.baseUnitId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(u);
                          setEditFactor(String(u.factor));
                        }}
                        aria-label={`معامل ${u.name}`}
                        className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleArchive(u)}
                      aria-label={u.isArchived ? "استعادة" : "أرشفة"}
                      className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    >
                      {u.isArchived ? (
                        <ArchiveRestore className="size-4" aria-hidden />
                      ) : (
                        <Archive className="size-4" aria-hidden />
                      )}
                    </button>
                  </span>
                }
                chevron={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* لوحة إضافة */}
      <PosSheet open={addOpen} onOpenChange={setAddOpen} title="وحدة قياس جديدة">
        <div className="flex flex-col gap-3 pb-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم الوحدة (مثال: كرتون كبير)"
            autoFocus
            className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />
          <div>
            <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="u-base">
              الوحدة الأساس (اختياري — للوحدات المركّبة)
            </label>
            <select
              id="u-base"
              value={baseUnitId ?? ""}
              onChange={(e) => setBaseUnitId(e.target.value ? Number(e.target.value) : null)}
              className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[14px] text-foreground outline-none focus:border-primary/70"
            >
              <option value="">وحدة أساس مستقلة</option>
              {active.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          {baseUnitId && (
            <div>
              <label className="mb-1 block text-[13px] font-medium text-muted-foreground" htmlFor="u-factor">
                معامل التحويل (كم وحدة أساس في هذه الوحدة؟)
              </label>
              <input
                id="u-factor"
                type="number"
                inputMode="decimal"
                dir="ltr"
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
                placeholder="24"
                className="font-num h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:font-normal placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
              />
            </div>
          )}
          <PrimaryButton block variant="success" loading={busy} onClick={addUnit}>
            إضافة الوحدة
          </PrimaryButton>
        </div>
      </PosSheet>

      {/* لوحة تعديل المعامل */}
      <PosSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={`معامل «${editing?.name ?? ""}»`}>
        <div className="flex flex-col gap-3 pb-2">
          <p className="text-[13px] text-muted-foreground">
            كم وحدة أساس ({editing?.baseUnitName}) في الوحدة «{editing?.name}»؟
          </p>
          <input
            type="number"
            inputMode="decimal"
            dir="ltr"
            value={editFactor}
            onChange={(e) => setEditFactor(e.target.value)}
            className="font-num h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[16px] font-bold text-foreground outline-none focus:border-primary/70"
          />
          <PrimaryButton block variant="success" loading={busy} onClick={saveFactor}>
            حفظ
          </PrimaryButton>
          <PrimaryButton block variant="ghost" onClick={() => setEditing(null)}>
            <X className="size-4" aria-hidden /> إلغاء
          </PrimaryButton>
        </div>
      </PosSheet>
    </div>
  );
}
