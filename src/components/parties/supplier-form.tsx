"use client";

/**
 * نموذج مورد — إنشاء/تعديل (FR-03-03) بنفس بنية العميل (رصيد افتتاحي دائن افتراضياً).
 */
import { useState } from "react";
import { toast } from "sonner";
import { postJson, patchJson } from "@/lib/api";
import { PartySheet } from "./party-sheet";
import { Field, TextInput, Segmented } from "./field";
import { PrimaryButton } from "@/components/ds";
import type { SupplierDto } from "@/domain/parties";

interface SupplierFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: SupplierDto | null;
  onSaved?: (supplier: { id: number; name: string }) => void;
}

export function SupplierForm({ open, onOpenChange, initial, onSaved }: SupplierFormProps) {
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [openingAbs, setOpeningAbs] = useState(
    initial ? String(Math.abs(initial.openingBalance)) : "0"
  );
  const [openingSide, setOpeningSide] = useState<"debit" | "credit">(
    (initial?.openingBalance ?? 1) < 0 ? "credit" : "debit"
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("اسم المورد إلزامي");
      return;
    }
    setSaving(true);
    try {
      const opening = Number(openingAbs || 0) * (openingSide === "credit" ? -1 : 1);
      if (isEdit && initial) {
        await patchJson(`/api/parties/suppliers/${initial.id}`, {
          name: name.trim(),
          phone,
          address,
          openingBalance: opening,
          notes,
        });
        toast.success("تم حفظ تعديلات المورد");
      } else {
        const res = await postJson<{ supplier: { id: number; name: string } }>(
          "/api/parties/suppliers",
          { name: name.trim(), phone, address, openingBalance: opening, notes }
        );
        toast.success(`تم تسجيل المورد «${res.supplier.name}»`);
        onSaved?.(res.supplier);
      }
      onOpenChange(false);
    } catch {
      /* toast عبر api.ts */
    } finally {
      setSaving(false);
    }
  };

  return (
    <PartySheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "تعديل بيانات المورد" : "تسجيل مورد جديد"}
      description={isEdit ? initial?.name : "أدخل بيانات المورد — الاسم فقط إلزامي"}
      footer={
        <div className="flex gap-2">
          <PrimaryButton variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            إلغاء
          </PrimaryButton>
          <PrimaryButton className="flex-[2]" loading={saving} onClick={save}>
            {isEdit ? "حفظ التعديلات" : "حفظ بيانات المورد"}
          </PrimaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="الاسم بالكامل" required>
          <TextInput value={name} onChange={setName} placeholder="اسم المورد" autoFocus />
        </Field>
        <Field label="رقم الهاتف">
          <TextInput value={phone} onChange={setPhone} placeholder="7xxxxxxxx" dir="ltr" inputMode="tel" />
        </Field>
        <Field label="العنوان">
          <TextInput value={address} onChange={setAddress} placeholder="المدينة — الحي" />
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="الرصيد الافتتاحي (مستحق له)">
            <TextInput value={openingAbs} onChange={setOpeningAbs} placeholder="0" dir="ltr" inputMode="decimal" />
          </Field>
          <Segmented
            options={[
              { id: "credit", label: "له" },
              { id: "debit", label: "عليه" },
            ]}
            value={openingSide === "credit" ? "credit" : "debit"}
            onChange={setOpeningSide}
            className="w-36 pb-0.5"
          />
        </div>
        <Field label="ملاحظات">
          <TextInput value={notes} onChange={setNotes} placeholder="ملاحظات إضافية…" />
        </Field>
      </div>
    </PartySheet>
  );
}
