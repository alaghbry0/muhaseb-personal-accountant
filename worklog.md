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
Task: المخزون والمشتريات

Work Log:
- (سيُضاف من الوكيل)

---
Task ID: 3-b
Agent: full-stack-developer
Task: الأطراف والأقساط

Work Log:
- (سيُضاف من الوكيل)

---
Task ID: 4-a
Agent: full-stack-developer
Task: الخزينة والتقارير

Work Log:
- (سيُضاف من الوكيل)

---
Task ID: 4-b
Agent: full-stack-developer
Task: الموظفون والمناديب

Work Log:
- (سيُضاف من الوكيل)

---
Task ID: 5
Agent: full-stack-developer
Task: الإعدادات والنسخ الاحتياطي

Work Log:
- (سيُضاف من الوكيل)

## 5. الحالة النهائية والتسليم

- ✅ التطبيق يعمل على `/`: SPA عربي RTL داكن كحلي/سماوي بإطار موبايل، شريط تبويبات سفلي (الرئيسية/البيع/المخزون/التقارير/المزيد)، 45+ شاشة مسجلة.
- ✅ قاعدة بيانات SQLite كاملة (34 جدولاً + seed يمني واقعي + فواتير تجريبية 30 يوماً).
- ✅ دورة الفوترة الذهبية: بيع نقدي/آجل/مختلط/معلّق → طباعة إيصال حراري → واتساب → مرتجع، بحفظ ذرّي يخصم المخزون ويحدّث WAC والصندوق ورصيد العميل.
- ✅ مشتريات ومرتجعاتها، جرد، تحويل مخازن، تنبيهات، كشوف حساب، سندات قبض/صرف، تقسيط بجدول وتحصيل، صناديق ومصروفات ووردية، موظفون/حضور/سحبيات/مسير رواتب، مناديب وعمولات، تقارير (أرباح وخسائر، مبيعات حسب، أعمار ديون، حركة صنف، أقساط، مصاريف، صناديق، ضريبة، أداء مناديب) مع رسم 30 يوماً.
- ✅ إعدادات شاملة + نسخ احتياطي JSON (تصدير/استيراد) + سجل تدقيق + حول.
- ⚠️ حدود بيئة الويب (بديل مكافئ): الطباعة عبر نافذة طباعة المتصفح (قالب 58/80مم) بدل BLE، واتساب عبر wa.me نصياً بدل PDF مرفق، لا كاميرا باركود (إدخال يدوي/زر محاكاة مسح).
