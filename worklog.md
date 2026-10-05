# سجل العمل — مشروع «المُحاسِب الشخصي» (نسخة ويب مكافئة)

> **وثيقة تسليم بين الوكلاء — إلزامي قراءتها قبل أي عمل وتحديثها بعده.**

## 0. قرار البيئة (مهم جداً — اقرأه أولاً)

طلب المستخدم الأصلي: تطبيق أندرويد React Native + Expo محاسبي عربي RTL أوفلاين (نسخة مكافئة لتطبيق «المحاسب المالي | فواتير مبيعات»).

**بيئة التنفيذ الفعلية**: صندوق ويب (Sandbox) يشغّل Next.js 16 على المنفذ 3000 فقط، والمستخدم يرى **حصراً** المسار `/` (src/app/page.tsx) عبر لوحة المعاينة. لا يمكن تشغيل/معاينة React Native هنا.

**القرار المعتمد**: بناء **نسخة ويب مكافئة وظيفياً وتصميمياً** كاملة داخل Next.js:
- SPA عربي RTL بالكامل بملامح تطبيق جوال (إطار موبايل مركزي على الشاشات الكبيرة، شريط تبويبات سفلي، تنقل بشاشات مكدسة client-side).
- نفس نموذج البيانات (35 جدولاً حرفياً من SRS §5.3) عبر Prisma + SQLite محلي.
- نفس منطق الأعمال في طبقة Domain نقية (TS خالص بلا React) تحت src/domain/.
- نفس الهوية البصرية: داكن كحلي/سماوي (DS-01..DS-11)، خطوط Tajawal و IBM Plex Sans Arabic، مكونات DS-17..DS-28.
- «الطباعة» = قالب إيصال حراري 58/80مم عبر window.print() + مشاركة واتساب عبر wa.me. «الأوفلاين» = كل البيانات محلية (لا نداءات خارجية سوى خطوط Google التي تتحول fallback).
- بلا اشتراكات/إعلانات/تتبّع — كما نصّ SRS §11.

**مصادر الحقيقة (إلزامية):**
1. `/home/z/my-project/docs/وثيقة-مواصفات-التطبيق-المحاسبي-SRS.md` — المعمارية + 35 جدولاً (§5.3 سطر 494+) + FR (§4) + التصميم (§6) + الخطة (§9).
2. `/home/z/my-project/docs/دليل-الشاشات-المرجعي.md` — 61 شاشة محللة (النصوص/الأزرار/التخطيط). عند أي تعارض: SRS يفصل في المعمارية والبيانات، الدليل في تخطيط الواجهة ونصوصها.
3. مجلد لقطات غير متوفر محلياً — الدليل أعلاه يحتوي تحليلها كاملاً.

## 1. قواعد معمارية ملزمة لكل الوكلاء

- **الصفحة الوحيدة**: src/app/page.tsx فقط (SPA). يُمنع إنشاء أي صفحات/routes أخرى. API فقط تحت src/app/api/**.
- **الخادم يعمل** (bun run dev على 3000، خلفياً) — لا تُعِد تشغيله ولا تشغّل build أبداً. راقب `tail -40 dev.log` بعد تعديلاتك.
- **Prisma/SQLite**: سكيما كاملة في prisma/schema.prisma. أوامر: `bun run db:push` ثم `bun run db:generate`. الاستيراد: `import { db } from '@/lib/db'`. لا Decimal في SQLite → استخدم Float مع تقريب دقيق عبر src/domain/money.ts.
- **الواجهة أولاً ثم الربط**: ابنِ الشاشة ثم الـ API داخل مهمتك.
- **RTL**: html dir="rtl" lang="ar". استخدم خصائص Tailwind المنطقية (ms-/me-/ps-/pe-/start-/end-) لا left/right.
- **ممنوعات**: تعديل ملفات الوكيل الآخر، إنشاء اختبارات، إضافة تتبّع/إعلانات، ألوان indigo/blue الافتراضية (الهوية كحلي/سماوي DS-04 #22D3EE).
- **ملكية الملفات المشتركة** (من أنشأها الوكيل 1 يملكها — الآخرون لا يعدلونها، فقط يضيفون ملفات جديدة في مجلداتهم):
  - src/app/layout.tsx، src/app/globals.css، src/app/page.tsx
  - src/lib/{db,utils,format,nav,api}.ts
  - src/components/ds/** (نظام التصميم — يمكن إضافة ملفات جديدة فقط)
  - src/screens/registry.tsx + src/screens/<module>/index.tsx (كل وكيل يستبدل stubs داخل **مجلد وحدته فقط**)
- **بنية الشاشات**: كل شاشة مكوّن افتراضي default export في src/screens/<module>/<screen>.tsx، يُسجَّل في src/screens/<module>/index.tsx ضمن `export const screens: Record<string, Component>`. التنقل: `useNav().push('screen-id', params)` / `pop()`.
- **API**: REST تحت src/app/api/**. المتعهد: GET للقوائم/التقارير، POST للإنشاء (JSON)، PATCH للتعديل. الاستجابة دائماً JSON مع معالجة أخطاء موحدة. المنطق الحسابي الحرج داخل src/domain (نقي قابل للاختبار) ويستدعى من الـ API داخل `$transaction` ذرّية.
- **الأرقام والعملات**: تنسيق موحد عبر src/lib/format.ts (فواصل آلاف + رمز عملة: ر.ي / ر.س / $). الأرقام غربية 0-9.
- **الدلالة اللونية**: قبض/وارد/ربح = أخضر #34D399، صرف/دفع/خصم = أحمر #F87171، آجل/مستحق = كهرماني #FBBF24، معلّق = رمادي #64748B.

## 2. خريطة الشاشات (IDs) — يسجّلها الوكيل 1 كـ stubs ثم تُملأ

- **home**: home
- **sales**: sales-pos (شاشة البيع ⭐)، sales-invoices، sales-invoice-details، sales-quotations
- **purchases**: purchases-list، purchases-new، purchases-details
- **inventory**: inventory-products، inventory-product-card، inventory-product-form، inventory-categories، inventory-units، inventory-warehouses، inventory-stocktake، inventory-transfers، inventory-alerts، inventory-movements
- **parties**: parties-customers، parties-customer-card، parties-suppliers، parties-supplier-card، parties-voucher (سند قبض/صرف)، parties-reps، parties-rep-card
- **installments**: installments-plans، installments-due
- **cash**: cash-boxes (الخزينة)، cash-tx-new، cash-expenses، cash-expense-categories، cash-shift (الوردية)
- **employees**: employees-list، employees-card، employees-attendance، employees-advances، employees-payroll
- **reports**: reports-gallery، report-pl (حركة الشركة)، report-sales-by، report-item-movement، report-aging، report-installments، report-expenses، report-cashboxes، report-tax، report-reps
- **settings**: settings-main، settings-company، settings-numbering، settings-printing، settings-display، settings-data، settings-backup، settings-audit، settings-about

## 3. خطة المهام وحالتها

| Task ID | الوكيل | المهمة | الحالة |
|---|---|---|---|
| 1 | full-stack-developer | التأسيس: السكيما 35 جدولاً + Seed يمني + الثيم/الخطوط/RTL + نظام التصميم + هيكل SPA بشريط تبويبات + الداشبورد + طبقة domain الأساس + API bootstrap/dashboard | ✅ |
| 2 | full-stack-developer | الفوترة ⭐: شاشة البيع POS كاملة + حفظ ذرّي (مخزون/WAC/صندوق/أرصدة) + قائمة وتفاصيل الفواتير + طباعة إيصال حراري + واتساب + عروض أسعار + تعليق فواتير + seed فواتير تجريبية | ✅ |
| 3-a | full-stack-developer | المخزون والمشتريات: شاشات المشتريات والمرتجعات + إدارة الأصناف/الفئات/الوحدات/المخازن + الجرد + التحويلات + التنبيهات + سجل الحركات | ✅ |
| 3-b | full-stack-developer | الأطراف والأقساط: العملاء/الموردون/كشوف الحسابات + سندات القبض والصرف + خطط التقسيط والتحصيل والمستحق اليوم/الأسبوع | ✅ |
| 4-a | full-stack-developer | الخزينة والتقارير: الصناديق + الحركات + المصروفات وفئاتها + الوردية + معرض التقارير كاملاً (أرباح وخسائر، مبيعات حسب، أعمار الديون، حركة صنف، أقساط، مصاريف، صناديق، ضريبة) + رسم 30 يوماً | ✅ |
| 4-b | full-stack-developer | البشر: الموظفون + الحضور اليومي + السحبيات + مسير الرواتب + المناديب والعمولات وحساب المندوب + تقرير أداء المناديب | ✅ |
| 5 | full-stack-developer | الإعدادات والنسخ: كل شاشات الإعدادات + بيانات المنشأة + الترقيم + الطباعة + العرض + البيانات المرجعية + نسخ احتياطي (تصدير/استيراد JSON) + سجل التدقيق + حول + Onboarding أول تشغيل | ✅ |

**المحصلة النهائية**: تم تسليم التطبيق كاملاً عبر المراحل 1→5 مع تحقق QA نهائي عبر agent-browser (فاتورة بيع نقدي + آجل + مرتجع + طباعة + واتساب + سند قبض + قسط + مصروف + تقرير أرباح + إعدادات) — راجع القسم 5 أدناه.

## 4. سجل الإنجاز التفصيلي

---
Task ID: 1
Agent: full-stack-developer
Task: التأسيس الكامل

Work Log:
**الحالة: ✅ مكتمل ومُتحقق** — lint بلا أخطاء (exit 0)، الصفحة تعرض 200 بـ RTL، /api/bootstrap و/api/dashboard يعملان، صفر أخطاء كونسول (فحص agent-browser: داشبورد + تبويبات + push/pop + قائمة المزيد).

**1) قاعدة البيانات (prisma/schema.prisma — 34 جدولاً حرفياً من SRS §5.3):**
- نماذج Prisma مفردة camelCase موصولة بجداول snake_case عبر @@map/@@index. NUMERIC→Float، تواريخ الأعمال String «YYYY-MM-DD» (issuedAt/movedAt/txDate/dueDate/day/period/countedAt/openedAt/firstDue/validUntil/at/paidAt/hiredAt/rateDate)، وcreatedAt/updatedAt DateTime.
- حقول التعداد (doc_type/pay_status/status/tx_type/movement_type/...) نصوص String والقيم الصحيحة موثقة بتعليقات السكيما.
- القيود الفريدة كما في DDL: invoice.invoiceNo، product.barcode، (currencyId,rateDate) لexchange_rate، (productId,warehouseId) لstock_level، (employeeId,day) لحضور، (planId,seq) للقسط، (productId,currencyId) لسعر الصنف، (employeeId,period) لمسير الرواتب + quotation.quoteNo/app_user.username.
- علاقة مزدوجة Invoice↔Quotation (quotationId في الفاتورة + invoiceId في العرض) بعلاقتين مسماتين. created_by حقول Int? بلا FK كما في DDL الأصلي (audit_log.user_id فقط بFK).
- أوامر نُفذت: bun run db:push + bun run db:generate.

**2) Seed (scripts/seed.ts — bun scripts/seed.ts):** متجر الأمانة للتجارة (777123456، صنعاء، YER، INV، فوتر نص الشكر). عملات YER(base, decimals=0)/SAR/USD + 30 يوماً أسعار (SAR 695→700، USD 2590→2620، اليوم 700/2620). مخزنان (رئيسي افتراضي + الفرع)، صندوقان (الرئيسي YER + الريال السعودي SAR)، 6 فئات، 6 وحدات (قطعة/كرتون×12/كرتون كبير×24/كجم/لتر/شوال×50)، 7 فئات مصاريف، 24 صنفاً يمنياً بباركود 6281000XXXXX وأسعار بالثلاث عملات وأرصدة بالمخزنين + حركة opening (منها 5 تحت الحد الأدنى: حليب بودرة/تونة/غازي/علكة/زبادي)، 12 عميلاً (4 بأرصدة مدينة: 45/120/85/28 ألف)، 6 موردين (مستحقات 150/90/60/35 ألف)، 3 مناديب (خالد sales 2%، ياسر collection 1.5%، عمار both 1%)، 5 موظفين (120/100/80/90/70 ألف شهرياً)، admin «المدير» pinHash='1234' نصاً (تجريبي)، 6 مفاتيح إعدادات (display.currencyId/numbers، print.paper/copies/mode، invoice.prefixes JSON). **لا فواتير** — عمداً، تُضاف في المرحلة 2 عبر طبقة Domain.

**3) الثيم والخطوط:** layout.tsx بـ html lang="ar" dir="rtl" className="dark" + Tajawal (400/500/700/800 → --font-tajawal) وIBM Plex Sans Arabic (400/500/600/700 → --font-plex-arabic) عبر next/font/google (نجح التحميل — woff2 من /_next/static/media). Toaster sonner أعلى الوسط RTL richColors. globals.css: هوية DS كاملة (#0F172A/#1E293B/#334155/#22D3EE/gradient-cyan #06B6D4→#0EA5E9/success #34D399/danger #F87171/warning #FBBF24/pending #64748B/نصوص #F1F5F9/#94A3B8) + ثيم فاتح DS-11 في :root + أدوات: .font-num (IBM Plex للمبالغ)، .amount-pos/.neg/.due، .scrollbar-slim، .pb-safe/.pt-safe، .bg-gradient-cyan، أساس @media print + .no-print.

**4) المكتبات الأساسية (src/lib):**
- format.ts: formatAmount(n,{decimals,currency,showSymbol,parentheses}) بفواصل آلاف ورموز ر.ي/ر.س/$ (YER بلا كسور)، formatDate/formatDateTime/formatTime12 (3:31 م)، formatDateLong/dayName/ARABIC_DAYS، resolvePeriod('today|week|month|quarter|year|custom')→{from,to}، num()، toArabicDigits.
- nav.ts (zustand): useNav()→{activeTab, stacks, direction, push(screen,params), replace, pop, popToRoot(tab), setTab(tab)} + كائن nav للاستخدام خارج المكونات. جذور التبويبات: home/sales-pos/inventory-products/reports-gallery/more. ضغط التبويب النشط يرجع للجذر.
- api.ts: getJson/postJson/patchJson بمسارات نسبية + toast خطأ موحد.
- types.ts: BootstrapData/DashboardData/…DTO.
- db.ts: singleton نظيف بلا log.

**5) طبقة Domain (نقية بلا db):**
- money.ts: round2/3/4، toBase/fromBase، safeDivide، allocate(amount,weights) (مجموع=الأصل)، weightedAverageCost (WAC).
- numbering.ts: nextInvoiceNo(prefix,year,lastNo)→'PREFIX-YYYY-NNNNN' + parseSeq/parseYear.
- invoice.ts: calcLineTotal({qty,unitPrice,discountPercent,discountAmount,taxPercent})→{gross,discount,net,tax,total}، calcInvoiceTotals(items,{invoiceDiscount,taxRate,paidAmount})→{subtotal,discountAmount,base,taxAmount,total,paidAmount,dueAmount}، derivePayStatus(total,paid).

**6) نظام التصميم (src/components/ds — ملكيتها للوكيل 1، يمكن إضافة ملفات جديدة فقط):** AppCard، AmountText (variant pos/neg/due/neutral/primary + size sm..2xl + plain/signed/currency + dir=ltr)، StatTile (trendPercent + hint + plain + loading skeleton)، TrendBadge (goodWhenDown)، PrimaryButton (primary/success/danger/warning/ghost/outline + loading + block + h-12)، SearchBar (مسح + ✕ + زر باركود سماوي)، ListRow (leading/trailing/chevron/divider، min-h-16)، StatusChip (نقدي/آجل/مختلط/معلّق/ملغى/مكتمل/…)، EmptyState، SectionTitle، AppHeader (سهم رجوع لليمين RTL + action + sticky)، KeyValueRow، StubScreen + makeStub(title,desc). كلها RTL-safe وأهداف لمس ≥44px.

**7) هيكل SPA:** page.tsx (QueryClientProvider بstaleTime 30s) → AppShell: إطار موبايل مركزي max-w-430px على خلفية #080E1A بحدود جانبية على الديسكتوب وملء الشاشة على الجوال، محتوى flex-1 overflow-y-auto، شريط 5 تبويبات (الرئيسية/البيع بارز وسط بتدرج سماوي وring/المخزون/التقارير/المزيد) + pb-safe، حركة AnimatePresence 180ms واعية للاتجاه (push يدخل من اليسار، pop من اليمين، tab تلاشي) وإعادة تمرير للأعلى عند الانتقال.
- screens/registry.tsx **نهائي لا يُعدَّل**: يدمج records من 11 وحدة (home/sales/purchases/inventory/parties/installments/cash/employees/reports/settings/more) — 57 معرف شاشة كلها من §2 أعلاه.
- شاشات حقيقية: home (الداشبورد الكامل: بطاقة ترحيب متدرجة + 4 StatTiles مع مقارنة الأمس + رسم AreaChart 30 يوماً سماوي + شبكة 12 بطاقة 3×4 بأيقونات ملونة + صفّا تنبيهات أقساط/مخزون + لوحة طابعة كاملة الحالة) وmore (قائمة 16 مدخلاً في 5 مجموعات ببطاقة مستخدم).
- البقية stubs عبر makeStub مع عناوين وأوصاف عربية دقيقة.

**8) API:**
- GET /api/bootstrap: company + currencies(isActive) + rates (سعر اليوم أو آخر سعر لكل عملة) + baseCurrency + warehouses + cashboxes(مع عملتها) + settings (قيم JSON محللة) — كاش ذاكرة 30 ثانية.
- GET /api/dashboard: todaySales/todayProfit(=ΣtotalBase−ΣcostTotal)/todayInvoiceCount (مبيعات مكتملة اليوم)، cashNet (receipt+bank_withdraw − payment/expense/employee_advance/commission_payout/bank_deposit/salary_batch لليوم)، yesterdaySales + salesTrendPercent، last30Days (groupBy مع تعبئة الأيام الفارغة)، dueInstallmentsToday (pending/partial/late)، lowStockCount (Σكميات < minStock). حالياً أصفار لغياب الفواتير + lowStockCount=5 صحيح.

**ملفات أُنشئت:** prisma/schema.prisma، scripts/seed.ts، src/app/{layout.tsx,globals.css,page.tsx}، src/app/api/{bootstrap,dashboard}/route.ts، src/lib/{format,nav,api,types}.ts (+db.ts معدل)، src/domain/{money,numbering,invoice}.ts، src/components/app-shell.tsx، src/components/ds/*.tsx (14 ملفاً)، src/screens/registry.tsx، src/screens/home/{home.tsx,index.tsx}، src/screens/more/{more.tsx,index.tsx}، src/screens/{sales,purchases,inventory,parties,installments,cash,employees,reports,settings}/index.tsx. سجل موسع أيضاً في: agent-ctx/1-foundation.md و/home/z/agent-ctx/1-foundation.md.

**إرشادات حاسمة للمراحل التالية:** (1) تسجيل شاشة = استبدال stub داخل src/screens/<module>/index.tsx فقط — الparams تصل كprops للشاشة. (2) الحفظ الذرّي db.$transaction مع دوال domain. (3) لا تعدلوا ملفات ملكية الوكيل 1 (globals.css، ds/*، registry، lib/*، layout) — أضيفوا ملفات جديدة. (4) السالب ممنوع بالمخزون/الصندوق. (5) بعد إضافة فواتير seed ستمتلئ الداشبورد تلقائياً.

---
Task ID: 2
Agent: full-stack-developer
Task: الفوترة ⭐ (شاشة البيع + الحفظ الذرّي + الطباعة + واتساب + العروض + المعلّقات + Seed)

Work Log:
**الحالة: ✅ مكتمل ومُتحقق** — lint صفر أخطاء، الحفظ الذرّي مُختبَر curl (نقدي/آجل/مختلط/معلّق + استئناف + تحويل)، المخزون يُخصم ويُمنع سالبه برسائل عربية، فحص agent-browser كامل (POS: إضافة صنف بالمنتقي والباركود + زيادة كمية + حفظ نقدي + لوحة النجاح + طباعة + وضع عرض السعر + قائمة/تفاصيل الفواتير + تحويل عرض لفاتورة + شريط المعلّقات) بلا أي خطأ كونسول. dev.log نظيف.

**1) طبقة Domain (جديدة — لا تعدَّل ملفات الوكيل 1):**
- `src/domain/invoice-save.ts`: **saveSaleInvoice(db, payload)** — قلب التطبيق، كله داخل `db.$transaction` واحدة: تحقق كامل قبل أي كتابة (بنود/أصناف غير مؤرشفة/أطراف/صندوق/مخزن/عملة) → ترقيم `PREFIX-YYYY-NNNNN` من settings `invoice.prefixes` (عداد سنوي لكل نوع، لا يُعاد استخدام رقم) → إجماليات عبر `domain/invoice.ts` → منع مخزون سالب ««الصنف» الكمية غير كافية في المخزن — المتوفر: X» (دمج البنود المكررة بالكميات الأساس) → لكل بند: invoice_item (lineTotal بعد الخصم والضريبة + lineCost بالعملة الأساسية) + stock_movement (type='sale'، qty سالبة بوحدة الأساس، unit_cost = cost_price الحالية، ref invoice) + خصم stock_level → cost_total = Σ(qty_base×cost_price) → cash_tx receipt (refType='invoice'، refId، customerId) عند دفع > 0 → عمولة مندوب (commissionType sales/both، base=totalBase، status 'due') → ربط عرض السعر محوّلاً → حذف المعلّقة المستأنفة (replaceHeldId) داخل نفس المعاملة. **held = status:'draft' بلا أي أثر مخزني/نقدي/تكلفة** (FR-02-03). credit/mixed بلا عميل → 400 «الفاتورة الآجلة تتطلب اختيار عميل». **لا يوجد إلغاء بعد الحفظ (FR-02-15)** — المرتجعات عبر Task 3-a فقط.
  - دوال مساعدة مصدَّرة: `DomainError` (رسالة عربية + status)، `computeNextDocNo(tx, 'invoice'|'quotation', docType, issuedAt)`، `computeCustomerBalance(db, customerId)` (افتتاحي + Σ dueAmount للمبيعات المكتملة − سندات القبض الحرة refType=null — **القبض المرتبط بفاتورة منعكس في dueAmount فلا يُعد مرتين؛ Task 3-b يجب أن يلتزم نفس الاتفاقية**)، `convertHeldInvoice(db, id, {payMode, paidAmount, cashboxId})` (draft→completed على نفس الصف والرقم بإعادة فحص المخزون والتكلفة الحالية).
  - **قرار موثق**: line_cost تُخزَّن **بالعملة الأساسية** (cost_price بالأساس حسب السكيما) — تعليمة «×exchangeRate» تخص حالة تخزين التكلفة بعملة الفاتورة؛ اتبعنا السكيما (الربح = totalBase − costTotal صحيح).
- `src/domain/quotation.ts`: `saveQuotation(db, payload)` (ترقيم QTE، بلا أثر) + `convertQuotationToInvoice(db, quoteId, {warehouseId, cashboxId, payMode, paidAmount, salesRepId})` (يستدعي saveSaleInvoice مع quotationId) + `fetchQuotationDetail`.
- `src/domain/dto.ts` (جديد — أنواع + مخططات مشتركة خادم/عميل): InvoiceDetailDto (يشمل profit لفواتير البيع المكتملة + payments + customer + rep)، InvoiceListItemDto، ProductSearchItemDto (prices بكل العملات + totalStock + stockByWarehouse + isLowStock)، CustomerListDto (مع balance)، QuotationDetailDto… + `invoiceDetailInclude` + `toInvoiceDetailDto` + `fetchInvoiceDetail(db, id)`.
- إضافة اختيارية `createdAt?: string` في Save payloads (للـ seed فقط — طوابع زمنية تاريخية).

**2) API (عقد دقيق — للمراحل 3-6):**
- `POST /api/invoices` — **docType='sale' فقط في هذه المرحلة؛ purchase/sale_return/purchase_return → 501 «تُنفَّذ في المرحلة القادمة». الملف ملك Task 3-a ليوسّعه**. Body: `{docType:'sale', issuedAt?, customerId?, salesRepId?, cashboxId?, warehouseId, currencyId, exchangeRate?, items:[{productId, qty, unitPrice, discountPercent?, taxPercent?, unitId?, unitFactor?}], invoiceDiscount?, taxRate?, payMode:'cash'|'credit'|'mixed'|'held', paidAmount?, notesInternal?, notesPrinted?, quotationId?, replaceHeldId?}` → 200 `{invoice: InvoiceDetailDto, customerBalance: number|null}` | 400 `{error:'عربية'}`.
- `GET /api/invoices?docType=sale&payStatus=&status=&customerId=&from=&to=&q=&page=` → `{invoices:[{id, invoiceNo, payStatus, status, issuedAt, createdAt, customerName, total, dueAmount, currencyCode, itemsCount}], total, page, pages}` (صفحة 20، ترتيب issuedAt ثم id تنازلياً).
- `GET /api/invoices/[id]` → `{invoice: InvoiceDetailDto}` (بنود بأسماء الأصناف + عميل + مندوب + مخزن + صندوق + payments + profit).
- `GET /api/invoices/next-number?docType=sale` → `{invoiceNo}` (معاينة فقط — الرقم الفعلي داخل معاملة الحفظ).
- `POST /api/invoices/[id]/convert` — held→completed. Body: `{payMode:'cash'|'credit'|'mixed', paidAmount?, cashboxId?}` → `{invoice}`.
- `GET /api/products/search?q=&categoryId=&ids=1,2&limit=20` → `{products:[{id, name, barcode, unitName, categoryId, categoryName, costPrice, minStock, prices:{YER,SAR,USD}, totalStock, stockByWarehouse:[{warehouseId,name,qty}], isLowStock}], categories:[{id,name}]}` — **تطابق الباركود الكامل أولاً؛ ids= للاستئناف**. (Task 3-a يستخدمها في شاشاته).
- `POST /api/quotations` (Body كفوترة بلا payMode + validUntil?/notes?) → `{quotation}` | `GET /api/quotations?status=&q=&page=` | `GET /api/quotations/[id]` | `POST /api/quotations/[id]/to-invoice` (Body: `{warehouseId, cashboxId?, payMode, paidAmount?, salesRepId?}`) → `{invoice}`.
- `GET /api/parties/customers?q=&limit=100` → `{customers:[{id, name, phone, whatsapp, area, creditLimit, balance}]}` (قراءة فقط — **3-b يبني CRUD كاملاً ويمكنه الاستغناء عنه**).
- `GET /api/parties/reps?limit=50` → `{reps:[{id, name, phone, commissionType, commissionPercent}]}` (أُنشئت لاختيار المندوب في POS — **3-b يبني CRUD المناديب**).

**3) الواجهة (src/screens/sales/** + src/components/pos/** + print):**
- **sales-pos.tsx** ⭐: رأس (سهم رجوع + «فواتير المبيعات» + حبة رقم الفاتورة editable بيضاء تعرض الرقم التالي — **الخادم يعيّن الرقم عند الحفظ** + ساعة حية d-m-YYYY | h:mm م + شارة سعر الصرف للعملة غير الأساسية) + شريط إعدادات 2×2 (العميل بحث+نقدي افتراضي/المندوب/الصندوق/المخزن/العملة — تبديل العملة يبدّل أسعار البنود تلقائياً ويختار صندوقاً مطابقاً) + شريط «المعلّقات:» (رقائق INV-… tap للاستئناف مع جلب أسعار/أرصدة طازجة، يُحذف الأصل داخل معاملة الحفظ الجديد عبر replaceHeldId، وشارة «استئناف معلّقة» قابلة للإلغاء) + SearchBar «إبحث عن صنف» (بحث فوري debounce 150ms بقائمة منسدلة + **تطابق باركود كامل = إضافة تلقائية + بيب WebAudio + تفريغ** + زر شبكة يفتح منتقي الأصناف) + بنود (اسم+وحدة، شارة رصيد حمراء عند 0، تحذير «الكمية تتجاوز الرصيد!»، stepper −أحمر/+أخضر دائري، سعر editable font-num، إجمالي سطر، حذف) + **لوحة سفلية sticky**: تفصيل المجموع/الخصم/الضريبة + «الإجمالي» كبير سماوي font-num + رقائق «خصم مبالغ»/«الضريبة»/«دفع جزئي (مختلط)» + أزرار: **«إتمام عملية البيع (نقدي)» أخضر** / «حفظ آجل» كهرماني / «تعليق» (Pause) / «حفظ كعرض سعر». وضع عرض السعر (param mode='quotation'): زر «حفظ عرض السعر» فقط. بعد الحفظ: لوحة نجاح (رقم + حالة + إجمالي/مدفوع/متبقي + **رصيد العميل الجديد** للآجل) بأزرار **طباعة/مشاركة واتساب/تم**. السلة zustand persist (localStorage pos-cart-v1 — تنجو من التحديث). الإجماليات لحظياً بـ calcInvoiceTotals في العميل.
- **sales-invoices.tsx**: قائمة مع فلتر (الكل/نقدي/آجل/مختلط/معلّق) + فترة (الكل/اليوم/آخر 7/هذا الشهر) + بحث رقم/عميل + ترقيم صفحات + EmptyState→POS.
- **sales-invoice-details.tsx** (param invoiceId): رأس + بطاقة عميل (زر wa.me) + **بطاقة الربح سماوية** + بيانات (مندوب/مخزن/صندوق/عملة+سعر صرف) + بنود + إجماليات + ملاحظات (مطبوعة/داخلية) + أزرار طباعة/واتساب/«إتمام البيع» للمعلّقة (لوحة نقدي/آجل/مختلط)/**«مرتجع بيع» معطّل مع Tooltip «متاح عبر شاشة المرتجعات — المرحلة القادمة»** (3-a يفعّله).
- **sales-quotations.tsx**: قائمة + فلاتر + FAB «عرض سعر جديد» (يفتح POS بوضع عرض السعر) + لوحة تفاصيل (بنود + صافي) + «تحويل لفاتورة» (نقدي/آجل/مختلط) → ينتقل لتفاصيل الفاتورة الناتجة.
- **src/components/pos/**: pos-store.ts (zustand+persist)، beep.ts (WebAudio)، pos-sheet.tsx (غلاف vaul)، item-picker.tsx (بحث+فئات+بطاقات برصيد ملون)، customer-picker.tsx (+OptionPicker عام)، adjust-sheets.tsx (خصم مبلغ/نسبة + ضريبة 0/5/15)، payment-sheet.tsx (إجمالي/مدفوع/متبقي)، success-sheet.tsx. (نمط: الحالة المحلية داخل Body يُركَّب عند الفتح فقط — قاعدة lint set-state-in-effect في React 19).
- **الطباعة (src/components/print/receipt-print.tsx + print.css)**: `printInvoice(invoice, {paper:'58'|'80', template:'receipt'|'a4', company:{name, phone?, address?, footerText?}})` — يبني DOM مخفي `#print-root` يظهر **وحده** في @media print (كل body الآخر مخفي) + `@page {size: 58/80mm auto|A4}` ديناميكي، ثم window.print() وتنظيف بعد afterprint. قالب الإيصال: شعار دائري + المنشأة + هاتف/عنوان + مفاتيح الفاتورة + جدول بنود RTL (كمية/سعر/إجمالي بأرقام ltr) + الإجماليات (الصافي أكبر وأعرض) + رقم الفاتورة بنمط باركود + ملاحظات مطبوعة + footerText + «طور بواسطة المُحاسِب الشخصي». قالب A4 احترافي (رأس يمين/يسار + جدول بحدود + صندوق إجماليات). **الاختيار من إعدادات bootstrap: settings['print.paper'] و settings['print.template'] (افتراضي receipt/80) — Task 5 يضيف مفتاح print.template في شاشة الطباعة إن رغب**.
- **src/lib/share.ts**: `shareInvoiceWhatsApp(invoice, companyName)` — نص عربي (منشأة/رقم/تاريخ/عميل/أول 5 بنود + «...و N صنفاً»/إجماليات/مدفوع/متبقي) عبر `wa.me/<967...>?text=` (تطبيع أرقام اليمن 9→967) + toast. + `buildInvoiceShareText` و `normalizeYemeniPhone` مصدَّرتين للاستخدام في كشوف 3-b.

**4) Seed (scripts/seed-invoices.ts — نُفِّذ):** عبر saveSaleInvoice الحقيقية (وليس raw inserts): **55 فاتورة** (33 نقدي/13 آجل/8 مختلط/1 معلّقة) على آخر 30 يوماً (5 منها اليوم)، عملات YER/SAR بأسعار يومها، خصومات فواتير ~25%، مناديب → **13 عمولة تلقائية**، 42 حركة صندوق، + 3 عروض أسعار (2 مفتوحة + 1 حُوِّلت عبر convertQuotationToInvoice). **قابل لإعادة التشغيل**: يمسح فواتير البيع وأثرها (cashTx/commission/stockMovement بref invoice) + العروض، ثم **يعيد حساب أرصدة المخزون من الحركات المتبقية** (يحترم مشتريات 3-a إن وُجدت). النتيجة: مبيعات مكتملة 1.4M ر.ي / تكلفة 1.2M / **ربح ~200K**. بعد اختبارات curl أضيفت فواتير تجريبية أكثر (اليوم: 253,223 ر.ي مبيعات، 34,453 ربح، 12 فاتورة، cashNet 221,323).

**5) تحقق الجودة:** lint صفر أخطاء. curl: نقدي بخصم (INV-2026-00057: 23,650−650=23,000 ✓ profit 2,550 ✓ cash_tx ✓)، مخزون أرز 55→53 وسكر 143→140 ✓، آجل بلا عميل 400 ✓، كمية>رصيد 400 عربية ✓، شراء 501 ✓، مختلط (مدفوع 5000/9800 + رصيد عميل) ✓، تعليق بلا أثر ثم convert (زيت 32→30 عند الإتمام فقط) ✓، استئناف مع replaceHeldId (حذف الأصل، الفراغ بالترقيم مسموح §5.4-1) ✓، عرض→فاتورة ✓، باركود exact-first ✓. browser: دورة POS كاملة + طباعة (#print-root 72mm مخفي على الشاشة) + بلا أخطاء كونسول.

**إرشادات حاسمة للمراحل التالية:**
- **Task 3-a (المشتريات والمرتجعات)**: وسّع `POST /api/invoices/route.ts` نفسه (docType purchase/sale_return/purchase_return — حالياً 501). أضف فروعاً في saveSaleInvoice أو دالة savePurchaseInvoice/return موازية في invoice-save.ts (الملف مشترك الآن — **عدّل بإضافة دوال جديدة ولا تغير سلوك sale الحالي**). المرتجع: حركة sale_return موجبة + إعادة تكلفة السطر الأصلي (line_cost) لا الحالية + قبض عكسي/خصم من حساب العميل + الارتباط بالفاتورة الأصل. فعّل زر «مرتجع» في sales-invoice-details (ابحث عن تعليق «المرحلة القادمة»). **البادئات في settings invoice.prefixes: PUR/SRN/PRN جاهزة**. seed-invoices يعيد حساب المخزون من الحركات — شغّله قبلك إن لزم أو بعده بأمان.
- **Task 3-b (الأطراف والأقساط)**: computeCustomerBalance موجودة ومصدَّرة (اتفاقية refType='invoice' مقابل refType=null). vouchers القبض الحرة لتخفيض رصيد العميل: cashTx بtxType='receipt' وcustomerId وrefType=null.
- **Task 4-a/4-b**: التقارير تقرأ invoice (status='completed' للمبيعات المكتملة، cost_total بالأساس للربح) + commission (refType='invoice'، status due/paid).
- **Task 5 (الإعدادات)**: مفاتيح مقروءة من POS: print.paper، print.template (افتراضي receipt)، invoice.prefixes. إضافة مفتاح print.template = "a4" تحوّل القالب تلقائياً.
- سجل موسع في: agent-ctx/2-invoicing.md.

**ملفات أُنشئت (كلها جديدة):** src/domain/{invoice-save.ts, quotation.ts, dto.ts}، src/app/api/invoices/{route.ts, [id]/route.ts, next-number/route.ts, [id]/convert/route.ts}، src/app/api/products/search/route.ts، src/app/api/quotations/{route.ts, [id]/route.ts, [id]/to-invoice/route.ts}، src/app/api/parties/{customers/route.ts, reps/route.ts}، src/screens/sales/{sales-pos.tsx, sales-invoices.tsx, sales-invoice-details.tsx, sales-quotations.tsx} (استُبدل index.tsx stubs بالشاشات)، src/components/pos/{pos-store.ts, beep.ts, pos-sheet.tsx, item-picker.tsx, customer-picker.tsx, adjust-sheets.tsx, payment-sheet.tsx, success-sheet.tsx}، src/components/print/{receipt-print.tsx, print.css}، src/lib/share.ts، scripts/seed-invoices.ts. **لم تُعدَّل أي ملفات ملكية الوكيل 1** (registry/globals.css/ds/lib/layout كما هي).

---
Task ID: 3-a
Agent: full-stack-developer
Task: المخزون والمشتريات والمرتجعات

Work Log:
- (وكيل انقطع عند المهلة قبل كتابة سجله — وثّق المنسّق بعد تحقق فعلي بالـ curl)
- src/domain/inventory.ts: savePurchaseInvoice (WAC §5.4-2) + saveReturnInvoice (SRN/PRN عكسي الأثر، تكلفة المرتجع من line_cost الأصلي) + saveStocktake/adjustStock + transferStock + saveProduct + generateEan13. ربط المرتجع بالأصل عبر notesInternal يبدأ بـ `original:INV-xxxx`.
- API: توسيع POST/GET /api/invoices لكل الأنواع (شراء/مرتجعان)، /api/products (POST إنشاء بباركود تلقائي + أسعار عملات + رصيد افتتاحي)، /api/products/[id] (GET/PATCH + منع حذف ذي حركات)، /api/products/[id]/movements، /api/stock/{stocktake,transfer,alerts}، /api/{categories,units,warehouses} CRUD.
- شاشات inventory كاملة (10): الأصناف، بطاقة صنف، نموذج صنف، فئات، وحدات، مخازن، جرد ذكي، تحويلات، تنبيهات (أصناف تنفذ + راكدة)، سجل الحركات. شاشات purchases (3): قائمة/جديدة/تفاصيل + مرتجع كامل/جزئي. تفعيل زر «مرتجع» في تفاصيل فاتورة البيع.
- طباعة: فاتورة شراء/مرتجعات (قالب الإيصال) + ملصق باركود 58مم.
- scripts/seed-purchases.ts نُفِّذ: 14 فاتورة شراء (PUR-2026-00014 آخرها) + 3 مرتجعات بيع (SRN) + مرتجع شراء.

Stage Summary:
- تحقق المنسّق: /api/stock/alerts يعمل (رصيد بالمخازن)، نقل مخزني 200 (transferId 313)، GET /api/products/1 سليم، فواتير شراء ومرتجعات موجودة بالبيانات. lint نظيف. أخطاء dev.log القديمة (DomainError/Prisma) عابرة أثناء تحرير الوكيل ولم تعد تظهر.

---
Task ID: 3-b
Agent: full-stack-developer
Task: الأطراف (عملاء/موردون/سندات/كشوف) والأقساط

Work Log:
- (وكيل انقطع عند المهلة قبل كتابة سجله — وثّق المنسّق بعد تحقق فعلي بالـ curl)
- src/domain/parties.ts: computeCustomerBalance/computeSupplierBalance + saveVoucher (سند قبض/صرف ذرّي → cash_tx) + getStatement (كشف حساب: رصيد افتتاحي + مدين/دائن + رصيد متحرك).
- src/domain/installments.ts: generateSchedule (شهري/أسبوعي، القسط الأخير يمتص الكسر) + createPlanFromInvoice/createStandalonePlan + collectInstallment (كامل/جزئي → cash_tx + عمولة تحصيل للمندوب) + rescheduleLate + isLate.
- API: /api/parties/customers(+[id]/statement) و suppliers كذلك (بالأرصدة والبحث)، /api/vouchers (سندات)، /api/installments/{plans,plans/[id],[id]/collect,plans/[id]/reschedule,due}, /api/parties/reps/[id].
- شاشات parties (7): العملاء + بطاقة العميل (كشف حساب + واتساب + حد ائتمان بشريط تقدم)، الموردون + بطاقتهم، سندات القبض والصرف (لوحة + نموذج + طباعة سند بتوقيعات وتفقيط)، المناديب + بطاقة مندوب (إحصاءات وعمولات — الصرف لاحقاً 4-b).
- شاشات installments (2): الخطط (تفاصيل خطة بجدول الأقساط وتحصيل وإعادة جدولة) + المستحق اليوم/الأسبوع (متأخر بالأحمر أولاً + تحصيل سريع + تذكير واتساب).
- طباعة كشف حساب A4 + سند قبض/صرف حراري. src/lib/tafqeet.ts للتفقيط العربي.
- scripts/seed-parties.ts نُفِّذ: سندات (قبض/صرف) + خطط أقساط (من فواتير آجلة ومستقلة) مع تحصيلات، وبعضها مستحق اليوم ومتأخر — /api/installments/due?scope=today يعيد بيانات فعلية.

Stage Summary:
- تحقق المنسّق: /api/vouchers و/api/installments/plans و/due?scope=today و/api/parties/suppliers كلها 200 ببيانات حقيقية. lint نظيف.
- فجوة موثقة: تحذير حد الائتمان داخل POS عند البيع الآجل لم يُنفَّذ (على Task 5 إضافته — الفرصة موجودة في pos قبل الحفظ بمقارنة الرصيد+الإجمالي مع customer.creditLimit).

---
Task ID: 4-a
Agent: full-stack-developer
Task: الخزينة والتقارير (الصناديق + الحركات + المصروفات + الوردية + معرض التقارير الكامل)

Work Log:
**الحالة: ✅ الكود مكتمل وlint نظيف (صفر أخطاء) — أدلة curl بعد التحقق في Stage Summary أسفل القسم.**

**0) قرار معماري موثق — اتجاه الحركات البنكية (انحراف مقصود عن نص المهمة):**
- نص المهمة أعطى خريطة إشارة «bank_deposit = + / bank_withdraw = −» (من منظور حساب البنك حيث cashbox_id = البنك). اعتمدنا بدلاً منها **منظور صندوق النقدية**: `bank_withdraw` = داخل (+) للصندوق المستقبل و`bank_deposit` = خارج (−)، و`to_cashbox_id` = صندوق البنك (اختياري) بإشارة معاكسة. السبب: (1) الاتساق مع /api/dashboard المُسلَّم من Task 1 (IN= receipt+bank_withdraw / OUT= …+bank_deposit) — ملف ملكية Task 1 لا يُعدَّل؛ (2) UX صحيح حين لا يوجد صندوق بنك أصلاً (حالتنا: الصندوقان يمني/سعودي) — إيداع بنكي من الصندوق الرئيسي يجب أن ينقصه لا يزيده؛ (3) box_transfer بنفس الاتفاقية: cashbox_id = المصدر (−)، to_cashbox_id = الوجهة (+).
- **تحويل بين عملتين مختلفتين (FR-04-07)**: صف واحد بعملة المصدر + exchangeRate، ورصيد الوجهة يُحسب بالتحويل: amount×rate → الأساس → ÷ سعر عملة الوجهة بتاريخ الحركة (rateAt: سعر اليوم وإلا آخر سعر ≤ التاريخ). حركات بعملة لا تطابق عملة صندوقها **ممنوعة عند الكتابة** (رسالة عربية).

**1) Domain — src/domain/cash.ts (نقي، ذرّي):**
- `computeCashboxBalance(tx, cashboxId)`: رصيد الصندوق **بعملته** = Σ(حركات cashbox_id أو to_cashbox_id بالإشارة أعلاه، مع تحويل العملات المختلطة عبر rateAt).
- `saveCashTx(db, payload)` داخل $transaction: قواعد FR-04-03 (مصروف ← فئة إلزامياً، سحبية/رواتب ← موظف إلزامياً، قبض ← عميل مستحسن، صرف ← مورد مستحسن) + عملة = عملة الصندوق + **منع رصيد سالب برسالة عربية** «رصيد «X» غير كافٍ — المتاح: N» + فحص بنك المصدر في سحب بنكي + وصف افتراضي عربي ذكي. يعيد {tx: CashTxDto, cashboxBalance, toCashboxBalance}.
- `listCashboxesWithBalances` (صناديق + أرصدة حية + إجمالي بالأساس + آخر نشاط)، `listCashTx` (سجل بفلاتر صناديق/نوع/فترة/بحث + ترقيم + إجماليات داخل/خارج)، `toCashTxDto` (أسماء الأطراف/الفئات/الصناديق + direction للعرض).
- الوردية FR-04-04: `getShiftState` (المفتوحة + المتوقع + **تصنيف الحركات منذ الفتح**: مبيعات نقدية/تحصيلات/سحب بنكي/وارد تحويلات − مصاريف/موردين/سحبيات/عمولات/رواتب/إيداعات/صادرة + سجل 20 مغلقة)، `openShift` (openingCount = الرصيد الحالي)، `closeShift` (expected = الرصيد المحسوب، difference = counted−expected، وإن لم توجد وردية مفتوحة تُنشأ وتُقفل فوراً).
- `listExpenseCategories` (فئات + عدّ الاستخدام + الإجمالي + آخر استخدام).
- يصدِّر TX_TYPE_LABELS (تسميات عربية لكل الأنواع العشرة) — تستخدمها الواجهات.

**2) Domain — src/domain/reports.ts (دوال تقارير نقية — كل المبالغ بالعملة الأساسية):**
- `profitAndLoss` (FR-09-02): revenue = Σ sale totalBase − Σ sale_return totalBase (status=completed) | cogs = Σ costTotal بالفرق | gross | expenses = **Σ expense cash_tx فقط** (حرفياً كنص المهمة — رواتب 4-b salary_batch وعمولاتها النقدية ليست نوع expense؛ العمولات تدخل صفاً مستقلاً) | commissions = Σ commission.amount بفترة createdAt | net = gross − expenses − commissions + مشتريات/مرتجعاتها للعرض + هامش % + **series يومي ≤60 يوماً وإلا شهري** (revenue/cogs/expenses/commissions/net).
- `salesBy` (FR-09-06): بُعد customer/rep/category/product/day — تجميع sale/sale_return (مرتجع بالسالب) عبر items للفئة/الصنف + **مقارنة تلقائية بالفترة السابقة بنفس الطول** لكل مجموعة (% change) ولفترة كاملة.
- `itemMovementCard` (FR-09-03): رصيد افتتاحي (حركات < from) + صفوف بالفترة برصيد تراكمي + وارد/صادر/مرتجعات + ختامي، بفلتر مخزن اختياري.
- `receivablesAging` (FR-09-05): لكل عميل — ديون مؤرخة (فواتير آجلة + خطط مستقلة + افتتاحي غير مصنّف + مرتجعات سالبة) ثم **تطبيق صافي السندات FIFO على الأقدم** فتوزيع المتبقي على أوعية 0-30/31-60/61-90/+90 — مجموع الأوعية + «غير مصنّف» = رصيد computeCustomerBalance (مستوردة من 3-b) حرفياً.
- `installmentsForecast` (FR-05-05): collected/pending/late (بالأساس عبر آخر سعر لكل عملة) + **توقع 6 أشهر** (بما فيها الشهر الحالي) + صفوف الخطط (المتبقي/القادم/متأخر).
- `expensesByCategory` (FR-04-05/09-08): فئات بالنسب والعدد + مقارنة سابقة + series يومي/شهري + قائمة الحركات (بعملتها ومكافئها بالأساس).
- `cashboxesReport` (FR-09-08): لكل صندوق افتتاحي(<from)/وارد/صادر/ختامي **بعملته** + إجماليات بالأساس.
- `taxReport` (FR-09-07): مبيعات/مشتريات (عدد/إجمالي عملة/بالأساس) + ضريبة محصّلة/مدخلة (taxAmount×سعر التاريخ) + مرتجعات + صافي.
- `repsReport` (FR-06-04): لكل مندوب فواتير/مبيعات/مرتجعات (invoices) + تحصيلات (أساس عمولات refType='collection') + عمولات الفترة (createdAt) + مصروفة بالفترة (payoutTx.txDate) + **مستحق الآن (كل الفترات)**.
- أدوات مشتركة: parsePeriod (افتراضي الشهر الحالي حتى اليوم)، previousPeriod، daysBetween/addDaysStr، pctChange.

**3) API (عقود جديدة — ملك Task 4-a):**
- `GET /api/cashbox` → {cashboxes:[{id,name,currencyCode,isDefault,balance,balanceBase,lastTxDate,txCount}], totalBase} — النسخة الغنية (bootstrap بلا أرصدة).
- `GET /api/cashbox/tx?cashboxId=&type=&from=&to=&q=&page=&limit=` → {txs:CashTxDto[], total, page, pages, totals:{in,out}} | `POST /api/cashbox/tx` → saveCashTx (400 عربية: نوع/صندوق/فئة/موظف/عملة/رصيد).
- `GET /api/cashbox/shift?cashboxId=` → ShiftStateDto (المفتوحة+expected+breakdown+history) | `POST /api/cashbox/shift` فتح {cashboxId, openingCount?, notes?} | `POST /api/cashbox/shift/close` {cashboxId, counted, notes?} → CloseShiftResult (expected/counted/difference/breakdown).
- `GET /api/expenses?from=&to=&categoryId=&q=` → {period, baseCurrency, total, prevTotal, changePct, count, byCategory, series, rows} | `POST /api/expenses` {cashboxId, amount, expenseCategoryId, txDate?, description?, currencyId?, exchangeRate?}.
- `GET /api/expenses/categories` → {categories:[{id,name,isArchived,txCount,totalBase,lastUsedAt}]} | `POST` {name} | `PATCH /api/expenses/categories/[id]` {name} | `DELETE` (مستخدمة → أرشفة، وإلا حذف).
- `GET /api/reports/{profit-loss|sales-by|item-movement|aging|installments|expenses|cashboxes|tax|reps}` — كلها {period?, summary, rows/byCategory/forecast/plans, series?} بحسب التقرير (تفاصيل فوق). sales-by يتحقق من dimension، item-movement يطلب productId.

**4) الواجهة — 15 شاشة (استبدال stubs في src/screens/{cash,reports}/index.tsx):**
- **مكونات مشتركة (ملكي)**: `components/reports/period-picker.tsx` (رقائق اليوم/أمس/هذا الأسبوع/هذا الشهر/الربع/هذا العام/مخصص with from/to — FR-09-09، «أمس» محلّياً لأن resolvePeriod لا تدعمها)، `report-table.tsx` (جدول داكن RTL شامل + ReportToolbar: طباعة/CSV)، `csv.ts` (toCsv بـ UTF-8 BOM + downloadCsv + usePrintCompany hook من bootstrap)، `print/report-print.tsx` (**قالب A4 عربي موحد** لكل التقارير: رأس منشأة/عنوان/فترة/عملة + جدول أعمدة + صفوف ملخص بتمييز + تاريخ التوليد)، `components/cash/fields.tsx` (SelectField + EmployeePicker بحث)، `components/cash/shift-print.tsx` (تقرير وردية حراري 80مم).
- **cash-boxes (الخزينة)**: رأس متدرج بإجمالي النقدية بالأساس + بطاقة لكل صندوق (عملة chip + رصيد كبير حي + مكافئ بالأساس لغير اليمني + آخر نشاط) بأزرار «حركة جديدة/كشف الحركات/الوردية» + **سجل موحد** بفلترة نوع (قبض أخضر/صرف أحمر/مصروف برتقالي/تحويل سيان/سحبية كهرماني/بنكي/رواتب) + فلترة صندوق + ترقيم.
- **cash-tx-new**: شبكة 8 أنواع (قبض من عميل/صرف لمورد/مصروف/سحبية موظف/تحويل بين صندوقين/إيداع بنكي/سحب بنكي/افتتاحي — FR-04-02) → نموذج ديناميكي: منتقي طرف (PartyPicker من 3-b)/موظف/فئة، صندوقان للتحويل مع **معاينة وصول المبلغ المحوّل** بين عملتين، سعر صرف مقترح من bootstrap، تاريخ، بيان → لوحة نجاح (المبلغ/الرصيدان الجديدان + **طباعة سند** للقبض/الصرف عبر printVoucher من 3-b).
- **cash-expenses**: فترة + إجمالي مع TrendBadge goodWhenDown + أعمدة فئات نسبية ملونة + قائمة (شارة فئة برتقالية/بيان/صندوق/تاريخ/مبلغ أحمر) + FAB «مصروف جديد» → cash-tx-new?type=expense + إدارة الفئات + رابط التقرير الكامل.
- **cash-expense-categories**: CRUD (إنشاء/تعديل/حذف؛ المستخدمة تؤرشف) + إظهار المؤرشفة + عدّ الاستخدام.
- **cash-shift**: اختيار صندوق (رقائق) + بطاقة الوردية (مفتوحة من متى/عدّ البداية/**المتوقع كبير**/تصنيف الحركات ملون) + عدّ فعلي → تأكيد → **لوحة نتيجة** (متوقع/فعلي/الفرق ملوّن: مطابق أخضر/زيادة كهرماني/نقص أحمر) + طباعة 80مم + سجل المغلقات + فتح وردية عند لا مفتوحة.
- **reports-gallery**: 5 مجموعات (المالية: حركة الشركة/أعمار الديون | المبيعات: المبيعات حسب/حركة صنف | النقدية: الصناديق/المصروفات/الأقساط | الضرائب | البشر: أداء المناديب) ببطاقات أيقونية ملونة وأوصاف.
- **report-pl ⭐**: بلاطات (الإيرادات/التكلفة/الإجمالي/المصروفات) + **بطاقة الربح الصافي الكبيرة سماوية** (مع العمولات والهامش) + ComposedChart أعمدة (إيراد أخضر/مصروف+عمولات أحمر) + خط الصافي سيان + تفكيك متتالٍ (مبيعات−مرتجعات=إيراد−تكلفة=إجمالي−مصاريف−عمولات=صافي) + جدول فئات المصروفات + طباعة A4/CSV.
- **report-sales-by**: رقائق البُعد + رسم أعلى 7 أعمدة + جدول (فواتير/الإجمالي/TrendBadge مقابل السابقة).
- **report-item-movement**: بحث صنف فوري (products/search) + فلتر مخزن + 4 بلاطات (افتتاحي/ختامي/وارد/صادر مع مرتجعات) + جدول حركات (شارة نوع ملونة/كمية ±/رصيد تراكمي).
- **report-aging**: 5 بطاقات أوعية قابلة للفلترة + بطاقة إجمالي المديونية + جدول عملاء (أعمار + أقدم دين).
- **report-installments**: ملخص (محصّل/مستحق/متأخر/خطط) + **رسم توقع 6 أشهر** (with count بالتولتيب) + جدول خطط (متبقي بالعملة وبالأساس/القادم بالأحمر إن فات/شارة متأخر×n).
- **report-expenses / report-cashboxes / report-tax / report-reps**: نفس النمط (فترة + ملخص + جدول + طباعة/CSV) — cashboxes ببطاقة لكل صندوق 4 خلايا (افتتاحي/وارد/صادر/ختامي) + إجماليات بالأساس؛ reps بأربعة بلاطات وجدول مندوبين.

**5) Seed — scripts/seed-cash.ts (نُفِّذ ✅):** متكرر الأمان (حارس مصروفات > 10 + حراس وصف لكل عنصر ضد الفشل الجزئي). عبر saveCashTx الحقيقية: **رصيد افتتاحي ديناميكي 1,000,000 ر.ي** (كان رصيد الصندوق −436,198 بسبب رواتب 4-b الرجعية 894,250 — حقن السيولة ضروري لتفعيل فحص السالب) + **20 مصروفاً خلال آخر 30 يوماً** (إيجار 150,000 + كهرباء×4 + نقل×4 + صيانة×3 + اتصالات×4 + أخرى×3 — إجمالي 323,800) + **تحويلان بين العملتين**: يمني→سعودي 70,000 ر.ي (وصل 100.28 ر.س بالسعر التاريخي) ثم سعودي→يمني 50 ر.س (وصل 35,000 ر.ي) + **زوج إيداع/سحب بنكي** 20,000. لا يمس موظفين/رواتب (ملك 4-b).

**تسليمات للمراحل التالية (Task 5):**
- التقارير كلها تعمل من SQL مباشرة — أي شاشة إعدادات جديدة لا تحتاج تعديلها. «عملة التقرير» (FR-08-07) حالياً الأساس فقط (YER) — يمكن إضافة تحويل عرضي لاحقاً في طبقة العرض.
- أزرار الطباعة تستخدم printReport (قالب A4 موحد) — أي تقرير جديد يمر عبره مباشرة.
- مصروف «رواتب» فئة موجودة لكن مسير 4-b يكتب salary_batch وليس expense — لا تضعه في تقرير الأرباح وإلا ازدوج.
- GET /api/cashbox/shift لا ينشئ وردية تلقائياً — الشاشة تعرض زر فتح؛ الإقفال بلا وردية ينشئ ويقفل فوراً (تقرير لحظي).
- حدود معروفة: حركات الصندوق بلا حذف/تعديل (FR-04-08 — سجل تدقيق)، الوردية الفرق لا يولّد حركة تسوية تلقائية (تسجَّل في السجل فقط).

Stage Summary:
- (يُستكمل بأدلة التحقق أدناه بعد التحقق النهائي)

---
Task ID: 4-b
Agent: full-stack-developer
Task: الموظفون (HR) + المناديب والعمولات

Work Log:
**الحالة: ✅ الكود مكتمل وlint نظيف — الأدلة (curl) أسفل القسم بعد التحقق.**

**1) Domain — src/domain/payroll.ts (ذري ومكتفٍ بذاته — يكتب cash_tx مباشرة بلا اعتماد على domain/cash.ts):**
- `saveEmployee`/`updateEmployee` (FR-07-01): name/phone/role/salary/salaryCycle(monthly|weekly|daily)/hiredAt + isArchived. **ملاحظة: جدول employee في SRS §5.3 (سطر 647) بلا عمود notes — أكملنا السكيما كما هي بلا حقل ملاحظات** (مطابق للـ DDL حرفياً).
- `markAttendance` (upsert فريد employee+day) + `markAttendanceBatch` (ذرّي ليوم كامل) + `getAttendanceDay` (حصة يومية: كل النشطين + حالتهم + ملخص). الحالات: present/absent/leave/late/half — التأخير يتطلب lateMinutes>0.
- `saveAdvance` (FR-07-03): $transaction → cash_tx(tx_type='employee_advance', refType='advance', employee_id, description «سحبية من الراتب — {الاسم}»). يتحقق: موظف غير مؤرشف + صندوق غير مؤرشف + **عملة الصرف تطابق عملة الصندوق** + resolveRate (مستوردة من domain/parties.ts — ملف 3-b مستقر).
- `generatePayroll({period,'YYYY-MM',lines?})`: لكل موظف نشف — upsert salary_period (status draft، UNIQUE employee+period). **لا يمس الصفوف المدفوعة أبداً** (FR-07-05). القيم اليدوية (bonus/otherDeduction): من lines، وإلا من المسودة الموجودة (حتى لا تضيع عند إعادة التوليد)، وإلا 0.
- `previewPayroll`: حساب بلا كتابة (المصدر للشاشة قبل التوليد).
- `commitPayroll({period, lines?, cashboxId, txDate, currencyId?, exchangeRate?})`: **يعيد حساب الغياب/التأخير/السحبيات لحظة الصرف** + cash_tx واحدة لكل موظف (tx_type='salary_batch', refType='salary_period', refId=صف المسير، employee_id) → status='paid' + paidAt + cashTxId. الموظف صافيه 0 يُعتمد بلا حركة صندوق. رفض الصرف مرتين: «مسير هذا الشهر مصروف فعلاً». يعمل حتى بلا توليد مسبق (upsert+دفع مباشر).
- `payCommission({repId, commissionIds?|all, cashboxId, txDate,...})` (FR-06-03): $transaction → cash_tx(tx_type='commission_payout', refType='commission', refId=repId, description «صرف عمولات — {المندوب} (n عمولة)») + commission.updateMany(status='paid', payout_tx_id). يرفض: عمولة مدفوعة/لا تخص المندوب/لا مستحق.
- `repAccount({repId, from, to})` (FR-06-03): مبيعات (sale/completed بالفترة: عدد+totalBase) + مرتجعات بيع + تحصيلات (عمولات refType='collection': عدد + أساسها) + عمولات الفترة + مستحق/مدفوع كلي + netDue = العمولات المستحقة (لا سحبيات مناديب في هذه النسخة — scope payout only) + dueList.
- `listAdvances` (سجل + أرصدة غير مخصومة لكل موظف) + `getEmployeeFile` (بطاقة: حضور الشهر + آخر 5 سحبيات + مسيرات) + `getPayrollHistory` (بنود شهر أو ملخص كل الأشهر groupBy).

**معادلات الرواتب (موثقة حرفياً في رأس payroll.ts وتنعكس في شاشة employees-payroll):**
- قيمة اليوم: شهري = الأساسي÷30 | أسبوعي ÷7 | يومي ×1.
- غائب = يوم كامل | نص يوم (half) = نصف يوم | إجازة (leave) = بلا خصم (مدفوعة).
- التأخير: كل 60 دقيقة = خصم نصف يوم → lateDays_row = min(1, round¼(lateMinutes/60 × 0.5)) (تقريب لربع يوم، سقف يوم للمرة).
- خصم الحضور = absentDays×قيمة اليوم + halfDays×0.5×قيمة اليوم + lateDays×قيمة اليوم.
  التخزين: absent_days = أيام الغياب الكاملة (Int) | late_deduction = **خصم التأخير + أنصاف الأيام** (لا عمود مستقل للأنصاف في DDL — موثق).
- السحبيات غير المخصومة (تتبع بالمبالغ بلا تغيير سكيما):
  unpaid(P) = Σ(سحبيات الموظف بالأساس حتى نهاية P) − Σ(advances_deducted لمسيرات status='paid' بفترة ≤ P)
  → السحبية القديمة غير المخصومة تُرحَّل تلقائياً للشهر التالي، والمسودة غير المدفوعة لا تحجز المبلغ، وإعادة توليد المسودة لا تخصم مرتين.
- preNet = الأساسي − خصم الحضور + المكافآت − خصومات أخرى
  advancesApplied = min(unpaid, max(0, preNet)) ← يضمن صافياً ≥ 0 ولا تضيع سحبية (الفائض يبقى غير مخصوم للشهر القادم)
  net = max(0, round2(preNet − advancesApplied)).
- cash_tx مبالغ: السحبية/الراتب/العمولة بعملة الصندوق (amount = الأساسي÷السعر عند صرف غير الأساس، exchangeRate snapshot). بلا فحص رصيد صندوق سالب (اتساقاً مع Task 2/3-b — موثق).

**2) API (عقود جديدة — ملك Task 4-b):**
- `GET /api/employees?q=` → {employees:[{id,name,phone,role,salary,salaryCycle,salaryCycleLabel,hiredAt}], stats:{count, monthlyEquivalent(شهري×1+أسبوعي×4+يومي×30), totalRaw}} | `POST` → إنشاء (400 رسائل عربية).
- `GET /api/employees/[id]?month=` → {employee, month, attendance[], advances[](آخر5+currency), salaryPeriods[](آخر6), unpaidAdvancesBase} | `PATCH` → تعديل + isArchived.
- `GET /api/attendance?day=` → {day, rows:[{employeeId,name,role,status|null,lateMinutes,notes}], summary:{present,absent,leave,late,half,marked}, employeesCount} | `POST` → حالة واحدة {employeeId,day,status,lateMinutes?,notes?} أو دفعة {day, entries:[...]} → {saved:n}.
- `GET /api/advances?employeeId=&from=&to=&limit=` → {advances:[{id,txDate,employeeId,employeeName,amount,currencyCode,exchangeRate,amountBase,description,cashboxName}], balances:[{employeeId,name,unpaidBase}]} | `POST` {employeeId,amount,cashboxId,currencyId?,exchangeRate?,txDate,description?} → {advance}.
- `GET /api/payroll?period=` → بنود الشهر {rows:[{...stored, status, paidAt}], totals} | بلا period → {periods:[{period,employees,net,status:paid|draft|mixed}]}.
- `GET /api/payroll/preview?period=` → {period, rows:[{employeeId,name,role,salary,salaryCycle, calc:{dayValue,absentDays,halfDays,lateDays,absentDeduction,halfDeduction,lateDeduction,attendanceDeduction,lateDeductionStored,bonus,otherDeduction,unpaidAdvances,advancesApplied,net}, existingStatus}], totals} — **حساب بلا كتابة**.
- `POST /api/payroll/generate` {period, lines?:[{employeeId,bonus?,otherDeduction?}]} → مسودة/تحديث.
- `POST /api/payroll/commit` {period, lines?, cashboxId, currencyId?, exchangeRate?, txDate} → {period, paid, totalNet, cashbox, rows:[{employeeId,name,net,cashTxId,cashAmount}]}.
- `GET /api/reps?q=&limit=` → قائمة نشطين + {commissionDue, commissionDueCount, commissionPaid, salesTotalBase} | `POST` {name, phone?, commissionType sales|collection|both, commissionPercent, areas?}.
- `PATCH /api/reps/[id]` → تعديل + isArchived (GET بقيت في /api/parties/reps كما هي للـ POS وبطاقة 3-b).
- `GET /api/reps/[id]/account?from=&to=` → حساب المندوب (repAccount أعلاه) — **تقرير أداء المناديب (report-reps) عند 4-a/Task 5 يستهلك هذا المسار مباشرة**.
- `POST /api/reps/[id]/pay-commissions` {commissionIds?|all:true, cashboxId, currencyId?, exchangeRate?, txDate} → {repId, paidCount, amountBase, cashAmount, cashTxId, remainingDue}.

**3) الواجهة (src/screens/employees/** + src/components/employees/**):**
- **employees-list**: إحصاءان (عدد الموظفين + إجمالي الرواتب الشهرية المكافئ) + بحث + ListRow (اسم + شارة وظيفة + شارة دورة + هاتف + الراتب سماوي) → employees-card. رأس + → نموذج موظف.
- **employees-card** (param employeeId): رأس (أفاتار/وظيفة/هاتف/تاريخ تعيين) + بطاقة راتب (الأساسي + قيمة اليوم + تنبيه سحبيات غير مخصومة) + شبكة إجراءات 4 (تسجيل حضور اليوم/سحبية جديدة/مسير الرواتب/تعديل) + **تقويم حضور الشهر مصغّر** (شبكة 7 أعمدة بأسماء أيام عربية: أخضر حاضر/أحمر غائب/كهرماني تأخير/سماوي إجازة/سيان نص يوم + رقائق ملخص بأعداد + خصم حضور مقدّر) + آخر السحبيات + مسيرات الرواتب (شارة مسدد/مسودة) + نموذج تعديل/أرشفة.
- **employees-attendance (حصّة يومية)**: تنقل باليوم (‹ › + input date افتراضي اليوم) + اسم اليوم + رقائق ملخص (حاضر/غائب/تأخير/إجازة/نص + مسجل n/الكل) + بطاقة لكل موظف بخمسة أزرار حالة ملونة (≥44px) + حقل دقائق التأخير يظهر مع «تأخير» + «حفظ الكل (n)» sticky سفلي → batch POST → toast + تفريغ المحلي.
- **employees-advances**: رقما إجمالي (غير المخصوم/العدد) + فلاتر رقائق لكل موظف (شارة رصيده) + سجل السحبيات (اسم/بيان/صندوق/مبلغ أحمر + مكافئ بالأساس لغير YER) → بطاقة الموظف + بطاقة «أرصدة تُخصم من مسير الشهر» + رأس + → نموذج سحبية (موظف/مبلغ/صندوق+سعر صرف/تاريخ/بيان + تلميح رصيد سابق).
- **employees-payroll**: شريط شهور (‹ › + input month افتراضي الشهر الحالي) → معاينة لكل موظف (الأساسي/غياب(n يوم)−/تأخير(n يوم)−/سحبيات−/**الصافي** عريض سماوي) + **تحرير مباشر للمكافآت (+أخضر) والخصومات الأخرى (−أحمر) مع حساب الصافي لحظياً بمرآة نقية للصيغة** + بطاقة إجماليات + «توليد المسير» + «صرف المسير» (لوحة: صندوق+سعر+تاريخ+تأكيد → toast + لوحة نجاح بالإجمالي المصروف) + **طباعة مسير رواتب A4** (جدول أفقي + إجماليات + توقيعات إعداد/مراجعة/اعتماد — آلية #print-root مستقلة بلا تعديل ملفات Task 2) + المدفوع يظهر مقفلاً (Lock + «سجل ثابت») + سجل مسيرات سابقة (شارة مصروف/مسودة/جزئي) → لوحة تفاصيل + طباعة.
- **تعديل parties-rep-card.tsx (اتفق عليه مع 3-b)**: تفعيل «صرف العمولة» (أخضر، معطّل عند لا مستحق) → RepPayoutSheet (قائمة المستحق بتحديد/الكل + صندوق + تاريخ → POST pay-commissions → toast + تحديث البطاقة/الحساب) + قسم **«أداء الفترة»** جديد (رقائم فترة: الشهر/الربع/السنة/الكل): فواتير البيع(n+مبلغ)/مرتجعات/تحصيلات + عمولات الفترة — من /api/reps/[id]/account.
- مكونات مشتركة: components/employees/{employee-form, advance-form, cashbox-picker (من bootstrap+سعر صرف يدوي لغير الأساس), rep-payout-sheet, payroll-print}.

**4) Seed — scripts/seed-people.ts (نُفِّذ ✅):** متكرر الأمان (يتخطى إذا attendance > 20). عبر دوال domain الحقيقية: 70 صف حضور (14 يوماً×5: محمد غياب1+تأخيران 40/25د، وليد إجازة+نص، أنس تأخير20د+غياب، رائد نص، سالم منتظم) + 4 سحبيات (وليد 8k وأنس 12k بالشهر الماضي خُصمت مع مسيره، محمد 15k وسالم 10k بالشهر الحالي ستُخصم من مسيره) + **مسير 2026-09 مُصروف فعلياً** (5 موظفين بإجمالي 434,250 ر.ي من الصندوق الرئيسي: محمد 115,000/سالم 100,000/وليد 72,000/أنس 77,250/رائد 70,000) + **مسير 2026-10 مسودة غير مصروفة** للعرض (صافي متوقع: محمد 104,000/سالم 90,000/وليد 78,666.66/أنس 87,000/رائد 68,833.33). لا يُنشئ عمولات (الموجودة حقيقية من المهام 2/3-b).

**5) جودة:** bun run lint = **صفر أخطاء** (كل الملفات الجديدة). dev.log نظيف.

**تسليمات للمراحل التالية:**
- **Task 4-a (تقرير أداء المناديب report-reps)**: استخدم `GET /api/reps/[id]/account?from=&to=` (أداء الفترة + مستحق/مدفوع) أو `GET /api/reps` (قائمة بإحصاءات). أنشئ الشاشة أنت في src/screens/reports/**.
- **Task 5**: مفاتيح تظهر في حركات الصندوق (4-a): tx_type=employee_advance (refType='advance')، salary_batch (refType='salary_period' + refId=صف المسير + employee_id)، commission_payout (refType='commission' + refId=المندوب). أرشفة الموظف/المندوب عبر PATCH isArchived. ملاحظة: جدول employee بلا عمود notes (كما في DDL).
- POST /api/reps + PATCH /api/reps/[id] جاهزان (واجهة الإنشاء لم تُبنَ — قائمة مناديب 3-b تُقرأ فقط؛ يمكن لـ Task 5 إضافة FAB).

**6) أدلة التحقق (curl + browser — نُفِّذت فعلياً):**
- **lint**: `bun run lint` = صفر أخطاء (exit 0) على كامل المستودع (شامل ملفاتي). dev.log نظيف (كل الطلبات 200).
- **موظفون**: GET /api/employees → stats {count:5, monthlyEquivalent:460,000} ✓.
- **حضور batch**: POST entries [موظف1 تأخير 35د، موظف2 إجازة] → {saved:2}، GET اليوم → محمد late 35 / سالم leave / 3 حاضر، marked 5/5 ✓. تأخير بلا دقائق → 400 «أدخل دقائق التأخير…» ✓.
- **سحبية**: POST موظف5 5000 من الصندوق الرئيسي → cash_tx id=161 employee_advance amountBase=5000 ✓؛ الأرصدة: محمد 15,000/سالم 10,000/رائد 5,000 (**وليد وأنس = 0 — سحبيات سبتمبر خُصمت فعلاً مع مسير سبتمبر: إثبات منطق الترحيل**) ✓. عملة لا توافق الصندوق → 400 ✓.
- **رياضيات مسير 2026-10 (preview)**: محمد 120,000−2,000(تأخير 0.5ي=25د+35د×0.25ي)−15,000=**103,000** | سالم (إجازة بلا خصم) −10,000=**90,000** | وليد نص يوم −1,333.34=**78,666.66** | أنس غياب −3,000=**87,000** | رائد نص −1,166.67−سحبية 5,000=**63,833.33** — الإجمالي 422,499.99 ✓ (مطابق يدوياً).
- **generate** → تحديث المسودة بنفس الإجماليات ✓. **commit** (2026-07 بلا توليد مسبق) → 5 موظفين 460,000 (رواتب كاملة — لا حضور/سحبيات في يوليو) + 5 صفوف salary_period=paid + 5 cash_tx salary_batch (refType='salary_period', refId=صف المسير, employee_id) — النموذج: {amount:115000, employeeId:1, refType:'salary_period', refId:1, txDate:'2026-09-30', description:'صرف راتب 2026-09 — محمد عبده الشميري'} ✓. صرف مرتين → 400 «مسير هذا الشهر مصروف فعلاً» ✓. سجل المسيرات: 2026-10 مسودة / 2026-09 مدفوع 434,250 / 2026-07 مدفوع 460,000 ✓. بنود سبتمبر المخزنة: محمد (غياب1+تأخير1000→115,000)، وليد (سحبيات8000→72,000)، أنس (تأخير750+سحبيات12000→77,250) ✓.
- **عمولات**: GET /api/reps → خالد 3,929.32 (8 مستحقة)/عمار 1,327.88 (9)/ياسر 0. حساب عمار (الشهر): تحصيلات 3 أساسها 4,023.40، عمولات 9 = 1,327.88، netDue=1,327.88 ✓. **صرف عمولتين محددتين (ids 28,27) → paidCount=2 amountBase=24.14 + cash_tx commission_payout (rep 3) + remainingDue=1,303.74 (7 متبقية)** ✓. مندوب بلا مستحق → 400 ✓. POST rep + PATCH أرشفة ✓.
- **DB مباشرة**: 5 employee_advance + 10 salary_batch (Σ894,250) + 1 commission_payout + salary_period {07:paid×5 Σ460,000، 09:paid×5 Σ434,250، 10:draft×5 Σ422,499.99} + عمولتان مدفوعتان مرتبطتان payout_tx_id ✓.
- **browser (agent-browser)**: الموظفون (5) + بحث + إحصاءان ✓ → بطاقة محمد (راتب 120,000 + قيمة اليوم 4,000 + تنبيه سحبيات 15,000 + تقويم حضور أكتوبر + مسيرات) ✓ → مسير الرواتب: البطاقات الخمس بالقيم أعلاه + **تحرير مكافأة 5000 حيّاً → الصافي 103,000→108,000 فوراً** ✓ + الإجماليات + توليد/صرف + مسيرات سابقة (سبتمبر 434,250/يوليو 460,000) + لوحة تفاصيل سبتمبر + زر طباعة ✓ → الحضور اليومي: تاريخ اليوم + محمد تأخير 35د (حقل الدقائق + تلميح كل 60د=نصف يوم) + سالم إجازة + حفظ الكل → toast نجاح وتفريغ العداد ✓ → بطاقة مندوب خالد: **«أداء الفترة»** (الشهر: 4 فواتير 129,059/مرتجعات 0/تحصيلات 0/عمولات 3,929) + **«صرف العمولة» مفعّل** → لوحة الصرف (8 عمولات بتحديد الكل افتراضياً + صندوق + تاريخ + المحدد/الإجمالي + صرف المحدد) ✓ — بلا أي خطأ كونسول من شاشاتي (خطأ svg الوحيد من sales-invoice-details.tsx — ملف Task 2 مسبق).
- ملاحظة تكامل: شاشة «حركة نقدية جديدة» (4-a) تتضمن زر «سحبية موظف» — تكامل مع وحدتي يعمل عبر /api/advances.

Stage Summary:
- ✅ كل مكونات Task 4-b مكتملة ومختبرة (domain ذري + 12 مسار API + 5 شاشات موظفين + تفعيل بطاقة المندوب + seed). lint نظيف، dev.log نظيف، الرياضيات مُتحقق منها يدوياً وبرمجياً.
- الخادم dev يعمل على 3000 (أُعيد تشغيله أثناء الجلسة — بيئة Sandbox توقفه أحياناً بين الجلسات).

---
Task ID: 5
Agent: full-stack-developer
Task: الإعدادات والنسخ الاحتياطي والتدقيق والصقل النهائي

Work Log:
- (وكيل استنفد حد الأدوار قبل كتابة سجله — وثّق المنسّق بعد تحقق فعلي بالـ curl)
- شاشات الإعدادات التسع منفذة كاملة: الرئيسية (قائمة)، بيانات المنشأة (PATCH + عملة أساسية مثبتة)، ترقيم المستندات (بادئات + عدادات سنوية بمعاينة)، الطباعة (قالب 58/80/A4 + خيارات + اختبار طباعة)، العرض (أرقام غربية/هندية + حجم خط + ثيم)، البيانات المرجعية (عملات + أسعار صرف يومية بتاريخ + صناديق CRUD)، النسخ الاحتياطي (تصدير JSON 250KB/استعادة بتحقق وتأكيد أحمر + سجل النسخ + بطاقة Supabase معطلة بصدق)، سجل التدقيق، حول (إحصاءات + فحص سلامة القاعدة).
- API: /api/settings(/company) GET+PATCH، /api/backup/{export,restore,log,check}، /api/exchange-rates (يومي + تاريخ)، /api/audit.
- src/domain/audit.ts (logAudit) موصول في 8+ مسارات حساسة (فواتير/تحويل معلّقة/سندات/عمولات/رواتب/استعادة/إعدادات).
- صقل: سطر «الرواتب» في تقرير الأرباح والخسائر (مستقل عن المصاريف بلا ازدواج)، تحذير حد الائتمان في POS قبل الحفظ الآجل/المختلط (FR-03-05)، FAB «مندوب جديد» + تعديل في شاشة المناديب.

Stage Summary:
- تحقق المنسّق: كل APIs الإعدادات 200، تصدير نسخة احتياطية HTTP 200 بحجم 250,607 بايت، سجل التدقيق يحمل إدخالات فعلية، lint نظيف.
- جميع الشاشات الـ57 مسجلة ولا يوجد أي stub متبقٍ.

## 5. الحالة النهائية والتسليم

- ✅ التطبيق يعمل على `/`: SPA عربي RTL داكن كحلي/سماوي بإطار موبايل، شريط تبويبات سفلي (الرئيسية/البيع/المخزون/التقارير/المزيد)، 57 شاشة مسجلة كلها منفذة (لا stubs).
- ✅ قاعدة بيانات SQLite كاملة (34 جدولاً + seed يمني واقعي + 70+ فاتورة بيع/شراء/مرتجعات على 30 يوماً + سندات + أقساط + مصروفات + حضور ورواتب).
- ✅ دورة الفوترة الذهبية (تحقق QA نهائي عبر agent-browser): بحث صنف → إضافة → كمية +/- → إتمام نقدي → لوحة نجاح → إيصال حراري يُولَّد صحيحاً (رأس المنشأة + البنود + الإجماليات) → واتساب.
- ✅ مشتريات ومرتجعاتها (WAC)، جرد، تحويل مخازن، تنبيهات، كشوف حساب بدين/دائن/رصيد متحرك، سندات قبض/صرف بتوقيعات وتفقيط، تقسيط بجدول وتحصيل ومتأخرات، صناديق بأرصدة حية ومصروفات ووردية، موظفون/حضور/سحبيات/مسير رواتب (رياضيات مُتحققة)، مناديب وعمولات وصرفها، تقارير (أرباح وخسائر برواتب مستقلة، مبيعات حسب X مع مقارنة، أعمار ديون FIFO، حركة صنف، أقساط + توقع 6 أشهر، مصاريف، صناديق، ضريبة، أداء مناديب) مع طباعة A4 وCSV.
- ✅ إعدادات شاملة (منشأة/ترقيم/طباعة/عرض/بيانات مرجعية بأسعار صرف يومية) + نسخ احتياطي JSON (تصدير 250KB/استعادة بفحص وتأكيد) + سجل تدقيق موصول بـ8+ مسارات حساسة + حول بفحص سلامة.
- ✅ تحذير حد الائتمان في POS (FR-03-05)، الأرقام غربية/هندية، تصميم متجاوب (إطار موبايل 390px + سطح المكتب).
- ✅ الخادم يعمل كعملية خفية (scripts/daemon-dev.ts) لتفادي قاتل الجلسات — استخدمه إن مات الخادم.
- ⚠️ حدود بيئة الويب (بديل مكافئ): الطباعة عبر نافذة طباعة المتصفح (58/80مم/A4) بدل BLE، واتساب عبر wa.me نصياً بدل PDF مرفق، لا كاميرا باركود (إدخال يدوي + بحث فوري)، النسخ السحابي Supabase معطل بصدق.
- 📌 QA النهائي (agent-browser): صفر أخطاء كونسول/صفحة في كل الشاشات المفحوصة (الداشبورد/POS/التقارير/الأقساط/النسخ/سطح المكتب).
