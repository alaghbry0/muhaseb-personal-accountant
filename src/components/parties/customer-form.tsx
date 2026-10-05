"use client";

/**
 * نموذج عميل — إنشاء/تعديل (FR-03-01) + الأرشفة من بطاقة العميل.
 * الرصيد الافتتاحي بمفتاح مدين/دائن (موجب=مدين، سالب=دائن).
 */
import { useState } from "react";
import { toast } from "sonner";
import { postJson, patchJson } from "@/lib/api";
import { PartySheet } from "./party-sheet";
import { Field, TextInput, Segmented } from "./field";
import { PrimaryButton } from "@/components/ds";
import type { CustomerDto } from "@/domain/parties";

interface CustomerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** وضع التعديل — يُمرَّر العميل الحالي */
  initial?: CustomerDto | null;
  onSaved?: (customer: { id: number; name: string }) => void;
}

export function CustomerForm({ open, onOpenChange, initial, onSaved }: CustomerFormProps) {
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [area, setArea] = useState(initial?.area ?? "");
  const [creditLimit, setCreditLimit] = useState(initial ? String(initial.creditLimit) : "0");
  const [openingAbs, setOpeningAbs] = useState(
    initial ? String(Math.abs(initial.openingBalance)) : "0"
  );
  const [openingSide, setOpeningSide] = useState<"debit" | "credit">(
    (initial?.openingBalance ?? 0) < 0 ? "credit" : "debit"
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("اسم العميل إلزامي");
      return;
    }
    setSaving(true);
    try {
      const opening = Number(openingAbs || 0) * (openingSide === "credit" ? -1 : 1);
      if (isEdit && initial) {
        await patchJson(`/api/parties/customers/${initial.id}`, {
          name: name.trim(),
          phone,
          whatsapp,
          address,
          area,
          creditLimit: Number(creditLimit || 0),
          openingBalance: opening,
          notes,
        });
        toast.success("تم حفظ تعديلات العميل");
      } else {
        const res = await postJson<{ customer: { id: number; name: string } }>(
          "/api/parties/customers",
          {
            name: name.trim(),
            phone,
            whatsapp,
            address,
            area,
            creditLimit: Number(creditLimit || 0),
            openingBalance: opening,
            notes,
          }
        );
        toast.success(`تم تسجيل العميل «${res.customer.name}»`);
        onSaved?.(res.customer);
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
      title={isEdit ? "تعديل بيانات العميل" : "تسجيل عميل جديد"}
      description={isEdit ? initial?.name : "أدخل بيانات العميل — الاسم فقط إلزامي"}
      footer={
        <div className="flex gap-2">
          <PrimaryButton variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            إلغاء
          </PrimaryButton>
          <PrimaryButton className="flex-[2]" loading={saving} onClick={save}>
            {isEdit ? "حفظ التعديلات" : "حفظ بيانات العميل"}
          </PrimaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="الاسم بالكامل" required>
          <TextInput value={name} onChange={setName} placeholder="اسم العميل" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="رقم الهاتف">
            <TextInput value={phone} onChange={setPhone} placeholder="7xxxxxxxx" dir="ltr" inputMode="tel" />
          </Field>
          <Field label="رقم الواتساب">
            <TextInput value={whatsapp} onChange={setWhatsapp} placeholder="7xxxxxxxx" dir="ltr" inputMode="tel" />
          </Field>
        </div>
        <Field label="العنوان">
          <TextInput value={address} onChange={setAddress} placeholder="المدينة — الحي" />
        </Field>
        <Field label="المنطقة (لتجميع العملاء وإسنادهم للمناديب — FR-03-07)">
          <TextInput value={area} onChange={setArea} placeholder="مثال: شعوب" />
        </Field>
        <Field label="حد الائتمان المسموح (ر.ي)">
          <TextInput value={creditLimit} onChange={setCreditLimit} placeholder="0" dir="ltr" inputMode="decimal" />
        </Field>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="الرصيد الافتتاحي">
            <TextInput value={openingAbs} onChange={setOpeningAbs} placeholder="0" dir="ltr" inputMode="decimal" />
          </Field>
          <Segmented
            options={[
              { id: "debit", label: "مدين" },
              { id: "credit", label: "دائن" },
            ]}
            value={openingSide}
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
