"use client";

/**
 * نموذج موظف — تسجيل/تعديل (FR-07-01): الاسم، الهاتف، الوظيفة، الراتب،
 * دورة الراتب (شهري/أسبوعي/يومي)، تاريخ التعيين. + الأرشفة/الاستعادة.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore } from "lucide-react";
import { postJson, patchJson } from "@/lib/api";
import { PartySheet } from "@/components/parties/party-sheet";
import { Field, TextInput, Segmented, DateInput } from "@/components/parties/field";
import { PrimaryButton } from "@/components/ds";

export interface EmployeeFormInitial {
  id: number;
  name: string;
  phone: string | null;
  role: string | null;
  salary: number;
  salaryCycle: "monthly" | "weekly" | "daily";
  hiredAt: string | null;
  isArchived: boolean;
}

interface EmployeeFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** وضع التعديل */
  initial?: EmployeeFormInitial | null;
  onSaved?: (employee: { id: number; name: string }) => void;
}

export function EmployeeForm({ open, onOpenChange, initial, onSaved }: EmployeeFormProps) {
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [salary, setSalary] = useState(initial ? String(initial.salary) : "");
  const [cycle, setCycle] = useState<"monthly" | "weekly" | "daily">(initial?.salaryCycle ?? "monthly");
  const [hiredAt, setHiredAt] = useState(initial?.hiredAt ?? "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      toast.error("اسم الموظف إلزامي");
      return;
    }
    const salaryNum = Number(salary || 0);
    if (!(salaryNum >= 0)) {
      toast.error("الراتب غير صحيح");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && initial) {
        const res = await patchJson<{ employee: { id: number; name: string } }>(
          `/api/employees/${initial.id}`,
          { name: name.trim(), phone, role, salary: salaryNum, salaryCycle: cycle, hiredAt: hiredAt || null }
        );
        toast.success("تم حفظ تعديلات الموظف");
        onSaved?.(res.employee);
      } else {
        const res = await postJson<{ employee: { id: number; name: string } }>("/api/employees", {
          name: name.trim(),
          phone,
          role,
          salary: salaryNum,
          salaryCycle: cycle,
          hiredAt: hiredAt || null,
        });
        toast.success(`تم تسجيل الموظف «${res.employee.name}»`);
        onSaved?.(res.employee);
      }
      onOpenChange(false);
    } catch {
      /* toast عبر api.ts */
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!initial) return;
    setArchiving(true);
    try {
      await patchJson(`/api/employees/${initial.id}`, { isArchived: !initial.isArchived });
      toast.success(initial.isArchived ? "تمت استعادة الموظف" : "تمت أرشفة الموظف");
      onOpenChange(false);
    } catch {
      /* toast عبر api.ts */
    } finally {
      setArchiving(false);
    }
  };

  return (
    <PartySheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "تعديل بيانات الموظف" : "تسجيل موظف جديد"}
      description={isEdit ? initial?.name : "الاسم إلزامي — الباقي اختياري"}
      footer={
        <div className="flex gap-2">
          {isEdit && (
            <PrimaryButton
              variant="outline"
              className="gap-1.5 border-[#F87171]/40 text-[#F87171]"
              loading={archiving}
              onClick={toggleArchive}
            >
              {initial?.isArchived ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}
              {initial?.isArchived ? "استعادة" : "أرشفة"}
            </PrimaryButton>
          )}
          <PrimaryButton variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            إلغاء
          </PrimaryButton>
          <PrimaryButton className="flex-[2]" loading={saving} onClick={save}>
            {isEdit ? "حفظ التعديلات" : "حفظ بيانات الموظف"}
          </PrimaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label="اسم الموظف" required>
          <TextInput value={name} onChange={setName} placeholder="مثال: محمد عبده الشميري" autoFocus={!isEdit} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="رقم الهاتف">
            <TextInput value={phone} onChange={setPhone} placeholder="7xxxxxxxx" dir="ltr" inputMode="tel" />
          </Field>
          <Field label="الوظيفة">
            <TextInput value={role} onChange={setRole} placeholder="بائع / كاشير / سائق…" />
          </Field>
        </div>
        <Field label="الراتب (حسب الدورة أدناه)">
          <TextInput value={salary} onChange={setSalary} placeholder="0" inputMode="decimal" dir="ltr" />
        </Field>
        <Field label="دورة الراتب">
          <Segmented
            options={[
              { id: "monthly", label: "شهري" },
              { id: "weekly", label: "أسبوعي" },
              { id: "daily", label: "يومي" },
            ]}
            value={cycle}
            onChange={setCycle}
          />
        </Field>
        <Field label="تاريخ التعيين">
          <DateInput value={hiredAt} onChange={setHiredAt} />
        </Field>
      </div>
    </PartySheet>
  );
}
