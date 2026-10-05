"use client";

/**
 * فئات المصروفات — CRUD بسيط: إنشاء/تعديل/حذف (المستخدمة تُؤرشف).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tag, Archive } from "lucide-react";
import { toast } from "sonner";
import { getJson, postJson, patchJson } from "@/lib/api";
import { formatAmount, formatDate } from "@/lib/format";
import { AppHeader, EmptyState, ListRow, PrimaryButton } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";
import { cn } from "@/lib/utils";

interface CatsResponse {
  categories: Array<{ id: number; name: string; isArchived: boolean; txCount: number; totalBase: number; lastUsedAt: string | null }>;
}

export default function CashExpenseCategoriesScreen() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const { data } = useQuery<CatsResponse>({
    queryKey: ["expenses", "categories"],
    queryFn: () => getJson<CatsResponse>("/api/expenses/categories"),
  });

  const categories = (data?.categories ?? []).filter((c) => showArchived || !c.isArchived);

  const openNew = () => {
    setEditing(null);
    setName("");
    setFormOpen(true);
  };
  const openEdit = (c: { id: number; name: string }) => {
    setEditing(c);
    setName(c.name);
    setFormOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("أدخل اسم الفئة");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await patchJson(`/api/expenses/categories/${editing.id}`, { name: name.trim() });
        toast.success("تم تعديل الفئة");
      } else {
        await postJson("/api/expenses/categories", { name: name.trim() });
        toast.success("تمت إضافة الفئة");
      }
      setFormOpen(false);
      qc.invalidateQueries({ queryKey: ["expenses", "categories"] });
    } catch {
      /* توست من api.ts */
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: { id: number; name: string; txCount: number }) => {
    if (!confirm(`حذف الفئة «${c.name}»؟${c.txCount > 0 ? "\nلها حركات — ستُؤرشف بدلاً من الحذف." : ""}`)) return;
    try {
      const res = await fetch(`/api/expenses/categories/${c.id}`, { method: "DELETE" });
      const body = (await res.json()) as { archived?: boolean; deleted?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? "تعذر الحذف");
      toast.success(body.archived ? "الفئة مستخدمة — تمت أرشفتها" : "تم حذف الفئة");
      qc.invalidateQueries({ queryKey: ["expenses", "categories"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الحذف");
    }
  };

  return (
    <div className="flex min-h-full flex-col pb-8">
      <AppHeader
        title="فئات المصروفات"
        action={
          <button
            type="button"
            onClick={openNew}
            aria-label="فئة جديدة"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      >
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-[12.5px] font-bold transition-colors",
              showArchived ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
            )}
          >
            {showArchived ? "إخفاء المؤرشفة" : "إظهار المؤرشفة"}
          </button>
        </div>
      </AppHeader>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {categories.length === 0 ? (
          <EmptyState icon={Tag} message="لا فئات بعد" hint="أضف فئات مثل: إيجار، كهرباء، نقل…" />
        ) : (
          categories.map((c) => (
            <ListRow
              key={c.id}
              leading={
                <span
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl",
                    c.isArchived ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"
                  )}
                >
                  {c.isArchived ? <Archive className="size-5" aria-hidden /> : <Tag className="size-5" aria-hidden />}
                </span>
              }
              title={
                <span className="flex items-center gap-2">
                  <span className={cn("font-bold", c.isArchived && "text-muted-foreground line-through")}>{c.name}</span>
                  {c.isArchived && <span className="text-[11px] text-muted-foreground">مؤرشفة</span>}
                </span>
              }
              subtitle={
                c.txCount > 0
                  ? `${c.txCount} مصروف • إجمالي ${formatAmount(c.totalBase)}${c.lastUsedAt ? ` • آخر استخدام ${formatDate(c.lastUsedAt)}` : ""}`
                  : "لم تُستخدم بعد"
              }
              trailing={
                !c.isArchived ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      aria-label={`تعديل ${c.name}`}
                      className="flex size-10 items-center justify-center rounded-xl text-primary hover:bg-primary/10"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      aria-label={`حذف ${c.name}`}
                      className="flex size-10 items-center justify-center rounded-xl text-[#F87171] hover:bg-[#F87171]/10"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </span>
                ) : undefined
              }
            />
          ))
        )}
      </div>

      {/* نموذج إنشاء/تعديل */}
      <PosSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? "تعديل فئة" : "فئة جديدة"}
        description="اسم مميز للمصروفات مثل: إيجار، كهرباء، نقل وشحن"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="catname" className="text-[13px] font-bold text-foreground">
              اسم الفئة <span className="text-[#F87171]">*</span>
            </label>
            <input
              id="catname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: صيانة معدات"
              className="h-12 rounded-xl border border-border bg-background px-3.5 text-[15px] text-foreground outline-none focus:border-primary"
            />
          </div>
          <PrimaryButton onClick={save} loading={saving} block>
            {editing ? "حفظ التعديل" : "إضافة الفئة"}
          </PrimaryButton>
        </div>
      </PosSheet>
    </div>
  );
}
