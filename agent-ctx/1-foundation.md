# Task ID: 1 — Foundation (التأسيس الكامل)

**Agent:** full-stack-developer (Foundation)
**Status:** ✅ مكتمل ومُتحقق (lint=0 أخطاء، كل الـ API تعمل، الصفحة تُعرض RTL بلا أخطاء كونسول)

## ما تم بناؤه

1. **قاعدة البيانات** — prisma/schema.prisma: 34 جدولاً حرفياً من SRS §5.3 (نفس أسماء الجداول snake_case عبر @@map، نماذج Prisma مفردة camelCase). NUMERIC→Float، تواريخ الأعمال String YYYY-MM-DD، createdAt/updatedAt DateTime. قيود فريدة وفهارس كما في DDL. تم push + generate.
2. **Seed يمني واقعي** — scripts/seed.ts (bun scripts/seed.ts): متجر الأمانة للتجارة، 3 عملات + 30 يوم أسعار (SAR 695→700، USD 2590→2620، اليوم 700/2620)، مخزنان، صندوقان، 6 فئات، 6 وحدات، 7 فئات مصاريف، 24 صنفاً بباركود 6281000XXXXX وأسعار YER/SAR/USD وأرصدة بالخزنين (5 أصناف تحت الحد الأدنى)، 12 عميلاً (4 بأرصدة مدينة)، 6 موردين، 3 مناديب، 5 موظفين، admin/PIN 1234، 6 صفوف إعدادات. **لا فواتير** (مهمة الوكيل 2 عبر طبقة Domain).
3. **الثيم والخطوط** — layout.tsx (html lang=ar dir=rtl class=dark، Tajawal + IBM Plex Sans Arabic عبر next/font/google — نجح التحميل)، globals.css بهوية DS-01..DS-11 (#0F172A/#1E293B/#334155/#22D3EE + gradient-cyan + success/danger/warning/pending) + أدوات .font-num/.amount-pos/.amount-neg/.amount-due/.scrollbar-slim/.pb-safe/@media print.
4. **المكتبات الأساسية** — src/lib/{format,nav,api,db,types,utils}.ts.
5. **طبقة Domain نقية** — src/domain/{money,numbering,invoice}.ts.
6. **نظام التصميم** — src/components/ds/ (14 مكوّناً DS-17..DS-28 + StubScreen/makeStub).
7. **هيكل SPA** — page.tsx (QueryClientProvider + AppShell)، app-shell.tsx (إطار 430px، شريط 5 تبويبات بزر بيع بارز، AnimatePreview 180ms واعٍ للاتجاه)، screens/registry.tsx (نهائي) + 11 وحدة index.tsx بـ 57 شاشة مسجلة (home وmore حقيقيتان والبقية stubs).
8. **API** — GET /api/bootstrap، GET /api/dashboard.

## أهم ما يحتاجه الوكيل 2 (الفوترة)

- **تسجيل شاشة**: أنشئ src/screens/sales/<screen>.tsx (default export) ثم استبدل الـ stub داخل src/screens/sales/index.tsx فقط. **لا تلمس registry.tsx أبداً**. الـ params تُمرر كـ props: `push('sales-invoice-details', { invoiceId: 5 })` → `<Screen invoiceId={5} />`.
- **دوال domain**:
  - money: `round2/3/4(n)`, `toBase(amount, rate)`, `fromBase(base, rate)`, `safeDivide(a,b,fallback)`, `allocate(amount, weights): number[]` (مجموع الأنصبة = المبلغ بالضبط), `weightedAverageCost(qtyOld, costOld, qtyNew, costNew)` (WAC لقاعدة §5.4-2).
  - numbering: `nextInvoiceNo(prefix, year, lastNo)` → `PREFIX-YYYY-NNNNN`، `parseSeq/parseYear`.
  - invoice: `calcLineTotal({qty, unitPrice, discountPercent?, discountAmount?, taxPercent?})` → `{gross, discount, net, tax, total}`، `calcInvoiceTotals(items, {invoiceDiscount?, taxRate?, paidAmount?})` → `{subtotal, discountAmount, base, taxAmount, total, paidAmount, dueAmount}` (paidAmount يُقص عند total)، `derivePayStatus(total, paid)` → cash/credit/mixed.
- **db**: `import { db } from '@/lib/db'` — نماذج مفردة (db.invoice, db.invoiceItem...) بجدداول snake_case. الحفظ الذرّي داخل `db.$transaction(async (tx) => ...)`.
- **إعدادات الطباعة/البادئات** موجودة في جدول settings (مفاتيح: invoice.prefixes JSON فيه INV/PUR/SRN/PRN/QTE، print.paper/print.copies/print.mode، display.currencyId/display.numbers).
- **bootstrap cache**: مخزّن بالذاكرة 30 ثانية داخل route.ts — إذا عدّلت company/settings وتريد فوراً، امنح مسار تعديل خاص أو اقبل تأخير 30 ثانية.
- **cashNet تعريفه**: receipt+bank_withdraw − (payment+expense+employee_advance+commission_payout+bank_deposit+salary_batch) ليوم اليوم؛ box_transfer/opening محايدة.
- **السالب ممنوع** في المخزون/الصندوق (قاعدة §5.4-4) — رصيد العميل فقط يجوز أن يكون مديناً.
- التنبيهات في الداشبورد تعتمد على فواتير اليوم — بعد seed فواتير العرض ستمتلئ تلقائياً.
- الطباعة: يوجد أساس @media print و.no-print في globals.css — وسّعه بقالب الإيصال الحراري.

## ملفات أُنشئت (كاملة)

- prisma/schema.prisma (34 جدولاً)
- scripts/seed.ts
- src/app/{layout.tsx, globals.css, page.tsx}
- src/app/api/{bootstrap,dashboard}/route.ts (+ src/app/api/route.ts «hello-world» الأصلي تُرك كما هو)
- src/lib/{format.ts, nav.ts, api.ts, types.ts} + تعديل db.ts (إزالة log:['query'])
- src/domain/{money.ts, numbering.ts, invoice.ts}
- src/components/{app-shell.tsx}
- src/components/ds/{app-card, amount-text, stat-tile, trend-badge, primary-button, search-bar, list-row, status-chip, empty-state, section-title, app-header, key-value-row, stub-screen, index}.tsx
- src/screens/registry.tsx
- src/screens/{home,more}/{index.tsx, home.tsx, more.tsx}
- src/screens/{sales,purchases,inventory,parties,installments,cash,employees,reports,settings}/index.tsx (stubs)

## قرارات وانحرافات موثقة

- created_by حقول Int? بلا FK (كما في DDL النصي)؛ audit_log.user_id فقط بFK إلى app_user.
- علاقة مزدوجة Invoice↔Quotation (quotationId في invoice وinvoiceId في quotation) بعلاقتين مسماتين.
- YER decimals=0 (عرض بدون كسور)، SAR/USD=2.
- الباركود المولد: `6281000` + تسلسل — شكل EAN-13 مقبول للعرض.
- فحص QA تم عبر agent-browser (بنية الداشبورد + التنقل بين التبويبات + push/pop + شاشة المزيد) — بلا أي أخطاء كونسول. ملاحظة: أثناء الاختبار الآلي قد يغطي nextjs-portal العناصر — يُحذف بـ eval.
