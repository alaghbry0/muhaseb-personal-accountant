"use client";

/**
 * إعدادات الطباعة (FR-13-03): قالب الفاتورة (إيصال 58مم / 80مم / فاتورة A4)
 * ببطاقات معاينة مصغّرة + نسخ الطباعة (1-3) + خيارات العناصر (باركود/QR/توقيع/ملاحظات/تكلفة)
 * + زرا «اختبار طباعة» (عبر بنية الطباعة القائمة) و«حفظ».
 * يقرأ/يكتب settings: print.paper / print.template / print.copies / print.options.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Check, Minus, Plus, ReceiptText, FileText } from "lucide-react";
import { toast } from "sonner";
import { getJson, patchJson } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { AppHeader, AppCard, PrimaryButton } from "@/components/ds";
import { ToggleRow, SettingsSection } from "@/components/settings/fields";
import { printInvoice } from "@/components/print/receipt-print";
import { cn } from "@/lib/utils";
import type { InvoiceDetailDto } from "@/domain/dto";
import type { BootstrapData } from "@/lib/types";

type Template = "receipt" | "a4";
type Paper = "58" | "80";

interface PrintOptions {
  barcode: boolean;
  qr: boolean;
  signature: boolean;
  notes: boolean;
  cost: boolean;
}

const DEFAULT_OPTIONS: PrintOptions = {
  barcode: true,
  qr: true,
  signature: false,
  notes: true,
  cost: false,
};

interface TemplateCard {
  id: string; // 'receipt-58' | 'receipt-80' | 'a4'
  template: Template;
  paper: Paper;
  title: string;
  desc: string;
}

const TEMPLATES: TemplateCard[] = [
  { id: "receipt-58", template: "receipt", paper: "58", title: "إيصال حراري 58مم", desc: "شريط ضيق — طابعات الجيب الصغيرة" },
  { id: "receipt-80", template: "receipt", paper: "80", title: "إيصال حراري 80مم", desc: "الشريط القياسي — الأكثر استخداماً" },
  { id: "a4", template: "a4", paper: "80", title: "فاتورة A4", desc: "قالب رسمي بجدول وتوقيع" },
];

/** معاينة مصغّرة تتفاعل مع الخيارات */
function MiniPreview({
  card,
  options,
  selected,
  onSelect,
}: {
  card: TemplateCard;
  options: PrintOptions;
  selected: boolean;
  onSelect: () => void;
}) {
  const isA4 = card.template === "a4";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={card.title}
      aria-pressed={selected}
      className={cn(
        "flex flex-1 flex-col gap-2 rounded-2xl border p-3 text-right transition-all active:scale-[0.98]",
        selected
          ? "border-primary bg-primary/10 shadow-[0_0_0_1px_var(--color-primary)]"
          : "border-border/60 bg-card hover:border-primary/40"
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1.5 text-[13px] font-bold text-foreground">
          {isA4 ? <FileText className="size-4 text-primary" aria-hidden /> : <ReceiptText className="size-4 text-primary" aria-hidden />}
          {card.title}
        </span>
        {selected ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[#06202B]">
            <Check className="size-3.5" aria-hidden />
          </span>
        ) : null}
      </div>

      {/* الورقة المصغّرة */}
      <div className="flex justify-center py-1">
        <div
          dir="ltr"
          className={cn(
            "flex flex-col gap-1 rounded-sm border border-border bg-[#F1F5F9] p-1.5 text-[#334155]",
            isA4 ? "aspect-[3/4] w-full max-w-24" : card.paper === "58" ? "aspect-[1/2] w-10" : "aspect-[1/2] w-14"
          )}
        >
          <div className="mx-auto h-1 w-3/5 rounded-full bg-[#94A3B8]" aria-hidden />
          <div className="mx-auto h-0.5 w-2/5 rounded-full bg-slate-300" aria-hidden />
          <div className="my-0.5 h-px w-full bg-dashed bg-[#CBD5E1]" aria-hidden />
          <div className="flex flex-col gap-0.5" aria-hidden>
            <div className="h-0.5 w-full rounded bg-[#CBD5E1]" />
            <div className="h-0.5 w-full rounded bg-[#CBD5E1]" />
            <div className="h-0.5 w-4/5 rounded bg-[#CBD5E1]" />
          </div>
          <div className="my-0.5 h-px w-full bg-[#CBD5E1]" aria-hidden />
          {options.cost ? (
            <div className="h-0.5 w-2/5 self-end rounded bg-[#F87171]/70" aria-hidden />
          ) : null}
          {options.barcode ? (
            <div className="flex h-2 items-end justify-center gap-px" aria-hidden>
              <span className="h-2 w-0.5 bg-[#334155]" />
              <span className="h-1.5 w-px bg-[#334155]" />
              <span className="h-2 w-px bg-[#334155]" />
              <span className="h-1.5 w-0.5 bg-[#334155]" />
              <span className="h-2 w-px bg-[#334155]" />
              <span className="h-1.5 w-px bg-[#334155]" />
            </div>
          ) : null}
          {options.qr ? (
            <div className="size-2.5 self-center rounded-[2px] border border-[#334155] bg-[#334155]/20" aria-hidden />
          ) : null}
          {options.notes ? (
            <div className="h-0.5 w-full rounded bg-slate-300" aria-hidden />
          ) : null}
          {options.signature ? (
            <div className="h-0.5 w-3/5 self-center rounded border-b border-dashed border-[#94A3B8]" aria-hidden />
          ) : null}
        </div>
      </div>
      <span className="text-[11px] leading-4 text-muted-foreground">{card.desc}</span>
    </button>
  );
}

export default function SettingsPrintingScreen() {
  const qc = useQueryClient();
  const { data: boot } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60_000,
  });

  const settings = boot?.settings ?? {};
  const [template, setTemplate] = useState<Template>("receipt");
  const [paper, setPaper] = useState<Paper>("80");
  const [copies, setCopies] = useState(1);
  const [options, setOptions] = useState<PrintOptions>(DEFAULT_OPTIONS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!boot) return;
    setTemplate((settings["print.template"] as Template) ?? "receipt");
    setPaper((settings["print.paper"] as Paper) ?? "80");
    setCopies(Number(settings["print.copies"] ?? 1) || 1);
    const o = settings["print.options"] as Partial<PrintOptions> | undefined;
    if (o && typeof o === "object") {
      setOptions({ ...DEFAULT_OPTIONS, ...o });
    }
  }, [boot]);

  const selectedId = template === "a4" ? "a4" : `receipt-${paper}`;

  const sampleInvoice: InvoiceDetailDto = useMemo(
    () => ({
      id: 0,
      invoiceNo: "INV-TEST-00001",
      docType: "sale",
      payStatus: "cash",
      status: "completed",
      issuedAt: formatDate(new Date()),
      createdAt: new Date().toISOString(),
      customer: null,
      supplier: null,
      salesRepName: null,
      warehouseName: "المخزن الرئيسي",
      cashboxName: "الصندوق الرئيسي",
      currencyCode: boot?.baseCurrency?.code ?? "YER",
      exchangeRate: 1,
      subtotal: 5000,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      total: 5000,
      totalBase: 5000,
      paidAmount: 5000,
      dueAmount: 0,
      costTotal: options.cost ? 4200 : 0,
      profit: options.cost ? 800 : null,
      notesInternal: null,
      notesPrinted: options.notes ? "هذه فاتورة تجريبية لاختبار الطباعة — شكراً لتعاملكم معنا" : null,
      quotationId: null,
      items: [
        { id: 1, productId: 1, productName: "أرز بسمتي 5كجم", barcode: "6281000000015", unitName: "كيس", qty: 2, unitPrice: 1500, discountPercent: 0, taxPercent: 0, lineTotal: 3000, lineCost: 2500 },
        { id: 2, productId: 2, productName: "سكر ناعم 1كجم", barcode: "6281000000022", unitName: "قطعة", qty: 4, unitPrice: 500, discountPercent: 0, taxPercent: 0, lineTotal: 2000, lineCost: 1700 },
      ],
      payments: [
        { id: 1, txType: "receipt", amount: 5000, txDate: formatDate(new Date()), cashboxName: "الصندوق الرئيسي" },
      ],
    }),
    [boot, options.cost, options.notes]
  );

  function testPrint() {
    const company = boot?.company;
    printInvoice(sampleInvoice, {
      paper: template === "a4" ? "80" : paper,
      template,
      company: {
        name: company?.name ?? "متجر الأمانة للتجارة",
        phone: company?.phone ?? null,
        address: company?.address ?? null,
        footerText: company?.footerText ?? null,
      },
    });
  }

  async function save() {
    setSaving(true);
    try {
      await patchJson("/api/settings", {
        updates: {
          "print.template": template,
          "print.paper": template === "a4" ? paper : paper,
          "print.copies": copies,
          "print.options": options,
        },
      });
      toast.success("تم حفظ إعدادات الطباعة");
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    } catch {
      /* توست من api.ts */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader title="إعدادات الطباعة" />
      <div className="flex flex-1 flex-col gap-4 p-4 pb-8">
        <SettingsSection title="قالب الفاتورة">
          <div className="flex gap-2.5">
            {TEMPLATES.map((c) => (
              <MiniPreview
                key={c.id}
                card={c}
                options={options}
                selected={selectedId === c.id}
                onSelect={() => {
                  setTemplate(c.template);
                  if (c.template === "receipt") setPaper(c.paper);
                }}
              />
            ))}
          </div>
        </SettingsSection>

        <SettingsSection title="نسخ الطباعة">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[14.5px] font-bold text-foreground">عدد النسخ عند الحفظ</span>
              <span className="text-[12px] text-muted-foreground">من 1 إلى 3 نسخ لكل عملية طباعة</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="إنقاص النسخ"
                onClick={() => setCopies((c) => Math.max(1, c - 1))}
                className="flex size-11 items-center justify-center rounded-xl border border-border text-foreground hover:bg-accent/40 active:scale-95"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="font-num w-8 text-center text-[20px] font-extrabold text-primary">{copies}</span>
              <button
                type="button"
                aria-label="زيادة النسخ"
                onClick={() => setCopies((c) => Math.min(3, c + 1))}
                className="flex size-11 items-center justify-center rounded-xl border border-border text-foreground hover:bg-accent/40 active:scale-95"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="خيارات الطباعة">
          <ToggleRow
            label="إظهار الباركود"
            hint="شريط باركود برقم الفاتورة أسفل الإيصال"
            checked={options.barcode}
            onCheckedChange={(v) => setOptions((o) => ({ ...o, barcode: v }))}
          />
          <ToggleRow
            label="إظهار QR"
            hint="رمز استجابة سريعة لمشاركة الفاتورة"
            checked={options.qr}
            onCheckedChange={(v) => setOptions((o) => ({ ...o, qr: v }))}
          />
          <ToggleRow
            label="إظهار توقيع المستلم"
            hint="سطر توقيع أسفل الفاتورة (قالب A4)"
            checked={options.signature}
            onCheckedChange={(v) => setOptions((o) => ({ ...o, signature: v }))}
          />
          <ToggleRow
            label="إظهار الملاحظات"
            hint="طباعة نص الملاحظات المخصصة على الفاتورة"
            checked={options.notes}
            onCheckedChange={(v) => setOptions((o) => ({ ...o, notes: v }))}
          />
          <ToggleRow
            label="إظهار التكلفة/الربح (للمالك)"
            hint="طباعة تكلفة وربح كل بند — مخصصة لنسخة المالك فقط"
            checked={options.cost}
            onCheckedChange={(v) => setOptions((o) => ({ ...o, cost: v }))}
          />
          <p className="text-[11.5px] leading-5 text-muted-foreground">
            الخيارات تُحفظ مع النسخة، وتُطبَّق على المعاينة أعلاه وعلى قالب A4 المخصص — الإيصال الحراري الحالي يتبع حجم الورق والقالب المختارين.
          </p>
        </SettingsSection>

        <div className="flex gap-2.5">
          <PrimaryButton variant="outline" className="flex-1" onClick={testPrint}>
            <Printer className="size-4" aria-hidden />
            اختبار طباعة
          </PrimaryButton>
          <PrimaryButton className="flex-1" loading={saving} onClick={save}>
            حفظ
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
