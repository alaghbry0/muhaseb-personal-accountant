"use client";

/**
 * إدارة الفئات — قائمة + إضافة + تعديل اسم + أرشفة/استعادة (FR-01-05).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Tags, Pencil, Archive, ArchiveRestore, X } from "lucide-react";
import { getJson, postJson, patchJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { AppHeader, ListRow, PrimaryButton, EmptyState, StatusChip } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";

interface CategoryRow {
  id: number;
  name: string;
  parentName: string | null;
  sortOrder: number;
  isArchived: boolean;
  productsCount: number;
}

export default function InventoryCategoriesScreen() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<CategoryRow | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<{ categories: CategoryRow[] }>({
    queryKey: ["categories"],
    queryFn: () => getJson<{ categories: CategoryRow[] }>("/api/categories"),
  });

  const categories = data?.categories ?? [];

  async function addCategory() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await postJson("/api/categories", { name: trimmed });
      toast.success(`تمت إضافة الفئة «${trimmed}»`);
      setName("");
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["categories"] });
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    const trimmed = editName.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await patchJson(`/api/categories/${editing.id}`, { name: trimmed });
      toast.success("تم تعديل الفئة");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["categories"] });
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(c: CategoryRow) {
    try {
      await patchJson(`/api/categories/${c.id}`, { isArchived: !c.isArchived });
      toast.success(c.isArchived ? `تمت استعادة «${c.name}»` : `تمت أرشفة «${c.name}»`);
      qc.invalidateQueries({ queryKey: ["categories"] });
    } catch {
      /* toast */
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="التصنيفات"
        action={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="فئة جديدة"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      />
      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
        ) : categories.length === 0 ? (
          <EmptyState icon={Tags} message="لا فئات بعد" hint="أضف فئة لتصنيف أصنافك" />
        ) : (
          <div className="flex flex-col">
            {categories.map((c) => (
              <ListRow
                key={c.id}
                leading={
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[#F472B6]/10 text-[#F472B6]">
                    <Tags className="size-5" aria-hidden />
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className={c.isArchived ? "text-muted-foreground line-through" : ""}>{c.name}</span>
                    {c.isArchived && <StatusChip status="void" label="مؤرشفة" />}
                  </span>
                }
                subtitle={
                  <span className="font-num">
                    {formatAmount(c.productsCount, { decimals: 0, showSymbol: false })} صنفاً
                    {c.parentName ? ` • تابعة لـ ${c.parentName}` : ""}
                  </span>
                }
                trailing={
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(c);
                        setEditName(c.name);
                      }}
                      aria-label={`تعديل ${c.name}`}
                      className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleArchive(c)}
                      aria-label={c.isArchived ? "استعادة" : "أرشفة"}
                      className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    >
                      {c.isArchived ? (
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
      <PosSheet open={addOpen} onOpenChange={setAddOpen} title="فئة جديدة">
        <div className="flex flex-col gap-3 pb-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم الفئة (مثال: مواد غذائية)"
            autoFocus
            className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />
          <PrimaryButton block variant="success" loading={busy} onClick={addCategory}>
            إضافة الفئة
          </PrimaryButton>
        </div>
      </PosSheet>

      {/* لوحة تعديل */}
      <PosSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="تعديل الفئة">
        <div className="flex flex-col gap-3 pb-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="اسم الفئة"
            className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />
          <PrimaryButton block variant="success" loading={busy} onClick={saveEdit}>
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
