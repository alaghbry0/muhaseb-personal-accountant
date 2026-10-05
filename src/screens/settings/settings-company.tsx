"use client";

/**
 * بيانات المنشأة (FR-13-01) — نموذج تعديل كامل: الاسم* والهاتف والواتساب والعنوان
 * والرقم الضريبي ونسبة الضريبة وبادئة الفواتير ونص التذييل + دائرة شعار بالأحرف الأولى
 * + العملة الأساسية للقراءة فقط (تُثبّت عند الإعداد — FR-08-01).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { toast } from "sonner";
import { getJson, patchJson } from "@/lib/api";
import { AppHeader, PrimaryButton } from "@/components/ds";
import { TextField, SettingsSection } from "@/components/settings/fields";
import type { CompanyDto } from "@/lib/types";
import type { BootstrapData } from "@/lib/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`;
}

export default function SettingsCompanyScreen() {
  const qc = useQueryClient();
  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });
  const { data, isLoading } = useQuery<{ company: CompanyDto }>({
    queryKey: ["settings", "company"],
    queryFn: () => getJson<{ company: CompanyDto }>("/api/settings/company"),
  });

  const [form, setForm] = useState({
    name: "",
    phone: "",
    whatsapp: "",
    address: "",
    taxNumber: "",
    taxRate: "0",
    invoicePrefix: "",
    footerText: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data?.company) return;
    const c = data.company;
    setForm({
      name: c.name ?? "",
      phone: c.phone ?? "",
      whatsapp: c.whatsapp ?? "",
      address: c.address ?? "",
      taxNumber: c.taxNumber ?? "",
      taxRate: String(c.taxRate ?? 0),
      invoicePrefix: c.invoicePrefix ?? "",
      footerText: c.footerText ?? "",
    });
  }, [data]);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.name.trim()) {
      toast.error("اسم المنشأة إلزامي");
      return;
    }
    setSaving(true);
    try {
      await patchJson("/api/settings/company", {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        whatsapp: form.whatsapp.trim() || null,
        address: form.address.trim() || null,
        taxNumber: form.taxNumber.trim() || null,
        taxRate: Number(form.taxRate) || 0,
        invoicePrefix: form.invoicePrefix.trim().toUpperCase() || null,
        footerText: form.footerText.trim() || null,
      });
      toast.success("تم حفظ بيانات المنشأة");
      qc.invalidateQueries({ queryKey: ["settings", "company"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch {
      /* توست من api.ts */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="بيانات المنشأة" />
      <div className="flex flex-1 flex-col gap-4 p-4 pb-8">
        {/* الشعار + الأحرف الأولى */}
        <div className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card p-4">
          <div className="relative">
            <span className="flex size-20 items-center justify-center rounded-full bg-gradient-cyan text-[26px] font-extrabold text-[#06202B]">
              {form.name ? initials(form.name) : "؟"}
            </span>
            <span
              className="absolute -bottom-1 -left-1 flex size-8 items-center justify-center rounded-full border-2 border-card bg-muted text-muted-foreground"
              aria-hidden
            >
              <Camera className="size-3.5" />
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[15px] font-extrabold text-foreground">
              {form.name || "اسم المنشأة"}
            </span>
            <p className="text-[12px] leading-5 text-muted-foreground">
              الشعار يُعرض بأحرف الاسم الأولى — رفع صورة شعار متاح في الإصدار القادم (تُطبع الفواتير بالاسم نصاً).
            </p>
          </div>
        </div>

        {isLoading ? (
          <p className="py-6 text-center text-[14px] text-muted-foreground">جارٍ التحميل…</p>
        ) : (
          <>
            <SettingsSection title="بيانات التواصل">
              <TextField label="اسم المنشأة" required value={form.name} onChange={set("name")} placeholder="مثال: متجر الأمانة للتجارة" />
              <TextField label="الهاتف" value={form.phone} onChange={set("phone")} type="tel" dir="ltr" placeholder="777123456" />
              <TextField label="الواتساب" value={form.whatsapp} onChange={set("whatsapp")} type="tel" dir="ltr" placeholder="777123456" hint="يُستخدم في أزرار المشاركة" />
              <TextField label="العنوان" value={form.address} onChange={set("address")} placeholder="صنعاء" />
            </SettingsSection>

            <SettingsSection title="الضريبة والفوترة">
              <TextField label="الرقم الضريبي" value={form.taxNumber} onChange={set("taxNumber")} dir="ltr" placeholder="اختياري" />
              <TextField label="نسبة الضريبة" value={form.taxRate} onChange={set("taxRate")} type="number" suffix="%" hint="تُقترح افتراضياً في فاتورة البيع (0 = بلا ضريبة)" />
              <TextField label="بادئة الفواتير" value={form.invoicePrefix} onChange={set("invoicePrefix")} dir="ltr" placeholder="INV" hint="بادئة احتياطية للترقيم — البادئات التفصيلية لكل نوع في «ترقيم المستندات»" />
              <TextField label="نص تذييل الفاتورة" value={form.footerText} onChange={set("footerText")} placeholder="شكراً لتعاملكم معنا" hint="يُطبع أسفل كل فاتورة وإيصال" />
            </SettingsSection>

            <SettingsSection title="العملة">
              <div className="flex min-h-12 items-center justify-between gap-3">
                <span className="text-[13.5px] text-muted-foreground">العملة الأساسية</span>
                <span className="flex items-center gap-2">
                  <span className="font-num text-[15px] font-bold text-foreground">
                    {boot?.baseCurrency?.name ?? "ريال يمني"}
                  </span>
                  <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                    ثابتة
                  </span>
                </span>
              </div>
              <p className="text-[12px] leading-5 text-muted-foreground">
                العملة الأساسية تُثبّت عند الإعداد الأول (FR-08-01) — كل التقارير والأرباح تُحسب بها، ويمكن إدارة العملات الأخرى وأسعار صرفها من «البيانات المرجعية».
              </p>
            </SettingsSection>

            <PrimaryButton block loading={saving} onClick={save}>
              حفظ بيانات المنشأة
            </PrimaryButton>
          </>
        )}
      </div>
    </div>
  );
}
