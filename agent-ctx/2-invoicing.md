# Task ID: 2 — Invoicing ⭐ (الفوترة — المسار الذهبي)

**Agent:** full-stack-developer (Invoicing)
**Status:** ✅ مكتمل ومُتحقق — lint صفر أخطاء + دورة حفظ ذرّية كاملة عبر curl وagent-browser بلا أخطاء كونسول + seed ناجح (الداشبورد تنبض).

> اقرأ أيضاً: `/home/z/my-project/worklog.md` قسم "Task ID: 2" (التفصيل الموثق) وقسم Task 1 (القواعد المعمارية).

## ما تم بناؤه (خلاصة)

1. **الحفظ الذرّي** `src/domain/invoice-save.ts` — `saveSaleInvoice(db, payload)` داخل `db.$transaction` واحدة: ترقيم سنوي PREFIX-YYYY-NNNNN (settings `invoice.prefixes`، لا إعادة استخدام) + إجماليات domain/invoice + منع مخزون سالب (عربية) + stock_movement('sale' سالبة بتكلفة اللحظة) + خصم stock_level + cost_total بالأساس + cash_tx receipt + عمولة مندوب (sales/both) + ربط عرض محوّل + حذف المعلّقة المستأنفة (replaceHeldId). **held = draft بلا أي أثر** (FR-02-03). لا إلغاء بعد الحفظ (FR-02-15). + `convertHeldInvoice` و`computeCustomerBalance` و`computeNextDocNo` و`DomainError`.
2. **عروض الأسعار** `src/domain/quotation.ts` — saveQuotation + convertQuotationToInvoice (يمر عبر saveSaleInvoice نفسه) + fetchQuotationDetail.
3. **DTO مشترك** `src/domain/dto.ts` — كل أشكال الردود (InvoiceDetailDto مع profit وpayments، ProductSearchItemDto مع أسعار كل العملات والرصيد بكل مخزن، …) + `fetchInvoiceDetail`.
4. **API**: POST/GET `/api/invoices` (sale فقط؛ purchase/returns = 501 حتى Task 3-a)، GET `/api/invoices/[id]`، GET `/api/invoices/next-number`، POST `/api/invoices/[id]/convert`، GET `/api/products/search` (اسم/باركود exact-first + ids= + categories)، POST/GET `/api/quotations` + `[id]` + `[id]/to-invoice`، GET `/api/parties/customers` (قراءة)، GET `/api/parties/reps` (قراءة — أنشأتها للـ POS، 3-b يبني CRUD).
5. **الشاشات** (src/screens/sales/): sales-pos ⭐ (رأس برقم editable وساعة حية + شريط إعدادات + معلّقات + بحث/باركود ببيب WebAudio + منتقي أصنف بفئات + بنود stepper + لوحة سفلية + نقدي/آجل/مختلط/تعليق/عرض سعر + لوحة نجاح برصيد العميل + سلة persist) وsales-invoices (فلاتر+فترات+بحث+صفحات) وsales-invoice-details (ربح سماوي + طباعة + واتساب + إتمام المعلّقة + مرتجع معطّل بتولتيب للمرحلة القادمة) وsales-quotations (قائمة + FAB → POS بوضع عرض + تحويل لفاتورة).
6. **الطباعة** `src/components/print/receipt-print.tsx` + print.css: إيصال 58/80مم + فاتورة A4 — `printInvoice(invoice, {paper, template, company})` عبر #print-root المخفي الذي يظهر وحده في @media print مع @page ديناميكي.
7. **واتساب** `src/lib/share.ts`: shareInvoiceWhatsApp + buildInvoiceShareText + normalizeYemeniPhone (967…).
8. **Seed** `scripts/seed-invoices.ts` (نُفِّذ): 55 فاتورة عبر الدومين الحقيقي (33/13/8/1) + 13 عمولة + 3 عروض (1 محوّل) — قابل لإعادة التشغيل ويعيد حساب المخزون من الحركات المتبقية.

## عقد API المختصر (للوكلاء اللاحقين)

- `POST /api/invoices` body: `{docType:'sale', issuedAt?, customerId?, salesRepId?, cashboxId?, warehouseId, currencyId, exchangeRate?, items:[{productId, qty, unitPrice, discountPercent?, taxPercent?, unitId?, unitFactor?}], invoiceDiscount?, taxRate?, payMode, paidAmount?, notesInternal?, notesPrinted?, quotationId?, replaceHeldId?}` → `{invoice, customerBalance}` | 400 `{error}`.
- `GET /api/invoices?docType&payStatus&status&customerId&from&to&q&page` → `{invoices[], total, page, pages}`.
- `GET /api/invoices/[id]` → `{invoice}` (تفاصيل كاملة + profit + payments).
- `POST /api/invoices/[id]/convert` `{payMode, paidAmount?, cashboxId?}` → `{invoice}`.
- `GET /api/products/search?q&categoryId&ids&limit` → `{products[], categories[]}`.
- `POST /api/quotations` / `GET /api/quotations?status&q&page` / `GET /api/quotations/[id]` / `POST /api/quotations/[id]/to-invoice {warehouseId, cashboxId?, payMode, paidAmount?, salesRepId?}`.

## كيف تستخدم الوكلاء اللاحقون ما بنيته

- **3-a (مشتريات/مرتجعات)**: وسّع `src/app/api/invoices/route.ts` (استبدل 501) وأضف دوال حفظ جديدة في invoice-save.ts **دون تغيير سلوك sale**. المرتجع يعيد الكمية بحركة sale_return موجبة + إعادة تكلفة السطر الأصلي (invoice_item.line_cost) + دفع من الصندوق (tx_type='payment') أو خصم من حساب العميل. زر «مرتجع بيع» في sales-invoice-details جاهز معطّلاً — فعّله. البادئات PUR/SRN/PRN في settings جاهزة، وcomputeNextDocNo تدعم أي نوع. **لا تنشئ مسار فواتير آخر — نفس POST /api/invoices.**
- **3-b (أطراف/أقساط)**: استخدم `computeCustomerBalance(db, id)` (المصدَّرة). سندات القبض الحرة = cashTx {txType:'receipt', customerId, refType:null} — القبض المرتبط بفاتورة (refType:'invoice') منعكس في invoice.dueAmount فلا يُعد مرتينا. استبدل /api/parties/customers وreps بـ CRUD كامل إن شئت (هي قوائم قراءة فقط أنشأتها للـ POS).
- **4-a/4-b (تقارير)**: المبيعات المكتملة = invoice {docType:'sale', status:'completed'}؛ الربح = totalBase − costTotal (كلاهما بالأساس). العمولات = commission {refType:'invoice', status:'due'|'paid'}. حركات الصندوق المرتبطة = cashTx {refType:'invoice', refId}.
- **5 (إعدادات)**: مفاتيح تؤثر في POS مباشرة: `print.paper` ('58'|'80')، `print.template` ('receipt'|'a4' — غير موجودة في الـ seed، الافتراضي receipt)، `invoice.prefixes` JSON. تعديلها في bootstrap cache يظهر خلال 30 ثانية.

## قرارات وانحرافات

- **line_cost بالعملة الأساسية** (وليس عملة الفاتورة) لأن cost_price بالأساس حسب سكيما الوكيل 1 — totalBase − costTotal = الربح الصحيح. (تعليمة المهمة «×exchangeRate» تنطبق فقط لو كانت التكلفة بعملة الفاتورة).
- حبة رقم الفاتورة في POS **قابلة للتحرير بصرياً لكن الخادم يعيّن الرقم الفعلي** عند الحفظ (سلامة العدّاد §5.4-1) — الرقم الحقيقي يظهر في لوحة النجاح.
- المعلّقة عند الاستئناف: تُنشأ فاتورة جديدة برقم جديد ويُحذف الأصل داخل نفس المعاملة (الفراغ بالترقيم مسموح).
- أصوات: WebAudio بلا ملفات assets.
- أنشأت `GET /api/parties/reps` (ملف جديد، قراءة فقط) لأن bootstrap لا يشمل المناديب — موثقة لـ 3-b.
- نمط React 19 lint: أي حالة محلية داخل لوحات تُهيأ عبر Body component يُركَّب عند الفتح فقط (لا setState في effects).

## أدلة التحقق

- curl: INV-2026-00057 نقدي (2 بند + خصم 650): subtotal 23,650 / total 23,000 / cost 20,450 / profit 2,550 / cash_tx ✓؛ أرز 55→53، سكر 143→140؛ 400 آجل بلا عميل؛ 400 كمية>رصيد؛ 501 شراء؛ مختلط 5000/9800 + رصيد عميل 96,337؛ held ثم convert (زيت 32→30 لحظة الإتمام فقط)؛ replaceHeldId يحذف الأصل؛ عرض→فاتورة INV-2026-00061؛ باركود 6281000010008 auto-add في الواجهة.
- agent-browser: دورة POS كاملة (منتقي/باركود/كمية/حفظ/نجاح/طباعة #print-root 72mm مخفي شاشةً/وضع عرض السعر/قائمة/تفاصيل/تحويل عرض/شريط المعلّقات) — صفر أخطاء كونسول.
- الداشبورد بعد كل شيء: todaySales 253,223 | todayProfit 34,453 | 12 فاتورة اليوم | cashNet 221,323 | last30Days ممتلئة.

## الملفات (كلها جديدة — لم تُمس ملفات الوكيل 1)

- src/domain/{invoice-save.ts, quotation.ts, dto.ts}
- src/app/api/invoices/{route.ts, next-number/route.ts, [id]/route.ts, [id]/convert/route.ts}
- src/app/api/products/search/route.ts
- src/app/api/quotations/{route.ts, [id]/route.ts, [id]/to-invoice/route.ts}
- src/app/api/parties/{customers/route.ts, reps/route.ts}
- src/screens/sales/{sales-pos.tsx, sales-invoices.tsx, sales-invoice-details.tsx, sales-quotations.tsx} + index.tsx (تسجيل)
- src/components/pos/{pos-store.ts, beep.ts, pos-sheet.tsx, item-picker.tsx, customer-picker.tsx, adjust-sheets.tsx, payment-sheet.tsx, success-sheet.tsx}
- src/components/print/{receipt-print.tsx, print.css}
- src/lib/share.ts
- scripts/seed-invoices.ts
