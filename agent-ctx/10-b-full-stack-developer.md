# Task 10-b — full-stack-developer — تفاصيل الورديات المقفلة + رصيد الصندوق بعد الحركة

## المهمة
سجل الورديات المقفلة (cash-shift) كان صفوفاً مختصرة بلا نقر؛ جدول Shift لا يخزّن التصنيف. وورقة تفاصيل الحركة (tx-details-sheet) بلا رصيد الصندوق بعد الحركة. المطلوب: ورقة تفاصيل وردية مقفلة (تصنيف كامل معاد الحساب + إعادة طباعة 80مم) + رصيد بعد الحركة.

## الملكية (التزام صارم)
**مملوكي**: src/domain/cash.ts، src/app/api/cashbox/shift/**، src/app/api/cashbox/tx/[id]/route.ts، src/components/cash/**، src/screens/cash/cash-shift.tsx.
**لم ألمس**: label-print.tsx / inventory-product-card.tsx / qr.ts (وكيل موازٍ)، lib/format.ts، lib/barcode.ts، app-shell، الشاشات غير النقدية، lib/api.ts (استُهلك getJson الموجود فقط).

## ما نُفّذ
1. **Domain**:
   - `shiftBreakdown(tx, cashboxId, from, to?)` — to يضيف `txDate: { lte }`. الحد الموثق: دقة يومية.
   - `getShiftDetails(db, shiftId): ShiftDetailsResult` = CloseShiftResult & { openingCount, notes } — 404/400 (مفتوحة)، تصنيف من يوم openedAt إلى يوم closedAt، reconciled/reconcileTxId من وجود tx refType='shift_reconcile' refId=shiftId.
   - `getCashTxWithBalance(db, id)` — تراكمي مقطوع عند الحركة شاملةً (نفس txContributionOn/تحويل rateAt)، اللاحقة = txDate أكبر أو (نفس اليوم وid أكبر)، على الجانبين.
2. **API**: جديد GET /api/cashbox/shift/[id] (Next16 Promise params)؛ GET tx/[id] صار يعيد { tx, balanceAfter } (توافق رجعي: tx كما هو).
3. **UI**: 
   - `shift-details-sheet.tsx` (جديد): رأس + شارة نتيجة + لوحة فرق ملونة + KeyValueRows (فتح/إقفال formatDateTimeDisplay/عدّ بداية/متوقع/فعلي/فرق signed/ملاحظات) + التصنيف الكامل (11 صفاً بلا فلترة + صافي) + زر طباعة. useQuery enabled عند الفتح، skeleton/EmptyState.
   - `cash-shift.tsx`: صفوف السجل onClick تفتح الورقة؛ استخراج `shiftBreakdownRows` مشترك مع البطاقة الحية (فلترة الأصفار بالحية فقط).
   - `tx-details-sheet.tsx`: سطر «رصيد الصندوق بعدها» (useQuery عند فتح الورقة، مفتاح بادئته cashbox → ينعش مع التعديل/الحذف).
   - `shift-print.tsx`: PrintableShiftResult بopeningCount اختياري — صف «عدّ البداية» عند إعادة الطباعة.

## التحقق
- lint صفر (exit 0)؛ tsc نظيف لملفاتي (أخطاء screens/cash/index.tsx موجودة بالخط الأساسي — ليست لي)؛ dev.log صفر 500؛ agent-browser errors فارغ بعد كل سيناريو.
- curl: shift/4 (SAR مقفلة، reconcile=true) ✓، shift/1 (تصنيف كامل+notes) ✓، 9999→404 ✓، 0/abc→400 ✓، وردية مفتوحة مؤقتة→400 «ما زالت مفتوحة» ثم حُذف صفها (استعادة الحالة).
- **رصيد بعد الحركة**: tx 121 (آخر حركة على الرئيسي) → **333,401.89 = الرصيد الحالي المعروض أعلى الخزينة** ✓؛ tx 210 (آخر على السعودي) → 114.51 ✓؛ السلسلة السعودية متسقة (62→184.51، 192→134.51، 206→124.51)؛ حركة ص2 القديمة (tx 36) → −110,183.77 مطابقة لمحاكاة مستقلة بنفس منطق الأرصدة (تاريخياً سالب — رواتب البذرة 2026-07-31 تسبق الافتتاح 2026-09-05).
- متصفح: وردية #2 (رئيسي) → ورقة كاملة + طباعة (#print-root بطول 2621 يتضمن عدّ البداية) ثم تنظيف؛ وردية #4 (سعودي، تعدد صناديق) → أصفار + عجز −10.00؛ ص2 → «رصيد الصندوق بعدها» ظاهرة؛ آخر حركة → 333,402 ر.ي مطابقة للبطاقة.
- لقطات: tmp-q/{10b-shift-details, 10b-shift-breakdown, 10b-tx-balance-after, 10b-tx-balance-after-last}.png.

## بيئة (مهم للوكلاء التالين)
- خادم dev كان **متوقفاً** عند بدء الجولة؛ أُعيد بنفس أمر النظام `bun run dev` (port 3000، dev.log بtee) عبر wrapper يتيم (الأوامر الخلفية العادية تُقتل بنهاية أمر Bash).
- 9-a/9-b أنجزا طبقة الحركات (update/deleteCashTx + txContributionOn) وورقة تفاصيل الحركة — بنيتُ فوقها مباشرة.
