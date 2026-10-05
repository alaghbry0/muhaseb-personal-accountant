"use client";

/**
 * إدارة المخازن — إضافة/تعديل/أرشفة + تعيين الافتراضي (FR-01-06).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Warehouse as WarehouseIcon, Pencil, Archive, ArchiveRestore, Star, X } from "lucide-react";
import { getJson, postJson, patchJson } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { AppHeader, ListRow, PrimaryButton, EmptyState, StatusChip } from "@/components/ds";
import { PosSheet } from "@/components/pos/pos-sheet";

interface WarehouseRow {
  id: number;
  name: string;
  location: string | null;
  isDefault: boolean;
  isArchived: boolean;
  productsCount: number;
  totalQty: number;
}

export default function InventoryWarehousesScreen() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [editing, setEditing] = useState<WarehouseRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery<{ warehouses: WarehouseRow[] }>({
    queryKey: ["warehouses"],
    queryFn: () => getJson<{ warehouses: WarehouseRow[] }>("/api/warehouses"),
  });
  const warehouses = data?.warehouses ?? [];

  async function addWarehouse() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await postJson("/api/warehouses", { name: trimmed, location: location.trim() || null, isDefault });
      toast.success(`تمت إضافة المخزن «${trimmed}»`);
      setName("");
      setLocation("");
      setIsDefault(false);
      setAddOpen(false);
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
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
      await patchJson(`/api/warehouses/${editing.id}`, {
        name: trimmed,
        location: editLocation.trim() || null,
      });
      toast.success("تم تعديل المخزن");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(w: WarehouseRow) {
    try {
      await patchJson(`/api/warehouses/${w.id}`, { isArchived: !w.isArchived });
      toast.success(w.isArchived ? `تمت استعادة «${w.name}»` : `تمت أرشفة «${w.name}»`);
      qc.invalidateQueries({ queryKey: ["warehouses"] });
    } catch {
      /* toast */
    }
  }

  async function makeDefault(w: WarehouseRow) {
    try {
      await patchJson(`/api/warehouses/${w.id}`, { isDefault: true });
      toast.success(`أصبح «${w.name}» المخزن الافتراضي`);
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch {
      /* toast */
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="المخازن"
        action={
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            aria-label="مخزن جديد"
            className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary hover:bg-primary/25 active:scale-95"
          >
            <Plus className="size-5" aria-hidden />
          </button>
        }
      />
      <div className="flex-1 px-3 py-2">
        {isLoading ? (
          <p className="py-10 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
        ) : warehouses.length === 0 ? (
          <EmptyState icon={WarehouseIcon} message="لا مخازن بعد" hint="أضف مخزناً لبدء تتبع الأرصدة" />
        ) : (
          <div className="flex flex-col">
            {warehouses.map((w) => (
              <ListRow
                key={w.id}
                leading={
                  <span className="relative flex size-11 items-center justify-center rounded-xl bg-[#FDBA74]/10 text-[#FDBA74]">
                    <WarehouseIcon className="size-5" aria-hidden />
                    {w.isDefault && (
                      <Star className="absolute -bottom-1 -end-1 size-4 fill-[#FBBF24] text-[#FBBF24]" aria-label="افتراضي" />
                    )}
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    <span className={w.isArchived ? "text-muted-foreground line-through" : ""}>{w.name}</span>
                    {w.isDefault && <StatusChip status="completed" label="افتراضي" />}
                    {w.isArchived && <StatusChip status="void" label="مؤرشف" />}
                  </span>
                }
                subtitle={
                  <span>
                    {w.location ?? "بلا موقع"}
                    <span className="mx-1.5 text-border">•</span>
                    <span className="font-num">
                      {formatAmount(w.productsCount, { decimals: 0, showSymbol: false })} صنف برصيد
                    </span>
                  </span>
                }
                trailing={
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(w);
                        setEditName(w.name);
                        setEditLocation(w.location ?? "");
                      }}
                      aria-label={`تعديل ${w.name}`}
                      className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                    {!w.isDefault && !w.isArchived && (
                      <button
                        type="button"
                        onClick={() => makeDefault(w)}
                        aria-label={`تعيين ${w.name} افتراضياً`}
                        className="flex size-10 items-center justify-center rounded-xl text-[#FBBF24]/80 hover:bg-[#FBBF24]/10 hover:text-[#FBBF24]"
                      >
                        <Star className="size-4" aria-hidden />
                      </button>
                    )}
                    {!w.isDefault && (
                      <button
                        type="button"
                        onClick={() => toggleArchive(w)}
                        aria-label={w.isArchived ? "استعادة" : "أرشفة"}
                        className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                      >
                        {w.isArchived ? (
                          <ArchiveRestore className="size-4" aria-hidden />
                        ) : (
                          <Archive className="size-4" aria-hidden />
                        )}
                      </button>
                    )}
                  </span>
                }
                chevron={false}
              />
            ))}
          </div>
        )}
      </div>

      {/* لوحة إضافة */}
      <PosSheet open={addOpen} onOpenChange={setAddOpen} title="مخزن جديد">
        <div className="flex flex-col gap-3 pb-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اسم المخزن (مثال: مخزن الفرع)"
            autoFocus
            className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="الموقع (اختياري)"
            className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />
          <label className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-3 py-3">
            <span className="text-[14px] font-medium text-foreground">تعيينه المخزن الافتراضي</span>
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="size-5 accent-[#22D3EE]"
              aria-label="المخزن الافتراضي"
            />
          </label>
          <PrimaryButton block variant="success" loading={busy} onClick={addWarehouse}>
            إضافة المخزن
          </PrimaryButton>
        </div>
      </PosSheet>

      {/* لوحة تعديل */}
      <PosSheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="تعديل المخزن">
        <div className="flex flex-col gap-3 pb-2">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            placeholder="اسم المخزن"
            className="h-12 w-full rounded-xl border border-border bg-muted/60 px-3 text-[15px] text-foreground placeholder:text-muted-foreground/70 outline-none focus:border-primary/70"
          />
          <input
            type="text"
            value={editLocation}
            onChange={(e) => setEditLocation(e.target.value)}
            placeholder="الموقع"
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
