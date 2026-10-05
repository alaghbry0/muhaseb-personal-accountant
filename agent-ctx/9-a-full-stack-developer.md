# Task 9-a — تعديل/حذف حركات الصندوق (FR-04-08) + تسوية فرق الوردية آلياً

> سجل عمل الوكيل — الجولة 9. الوكيل الموازي (9-b) عدّل format.ts/app-shell/الطباعة/الشارتات و أضاف `formatDateDisplay`/`formatDateTimeDisplay` (استُهلكت في شاشاتي للعرض فقط).

## الملكية (ملفاتي حصرياً)
- `src/domain/cash.ts`
- `src/app/api/cashbox/**` (جديد: `tx/[id]/route.ts` — معدل: `shift/close/route.ts`)
- `src/screens/cash/**` (معدل: `cash-boxes.tsx`, `cash-shift.tsx`)
- جديد: `src/components/cash/tx-details-sheet.tsx` — معدل: `src/components/cash/fields.tsx`

## ما نُفذ
1. **Domain**: `getCashTx` / `updateCashTx` / `deleteCashTx` (ذرّيان داخل `$transaction`) بحماية `refType != null` («تُدار من مصدرها» 400) وحارس رصيد يحاكي أثر الصندوق المصدر والوجهة عبر `txContributionOn` (نفس منطق computeCashboxBalance: SIGN_CASHBOX/SIGN_TO + تحويل rateAt بتاريخ الحركة). `closeShift` تقبل `reconcile?: boolean` (افتراضي false) وتنشئ عند فرق ≥ 0.01 حركة receipt/payment بrefType `shift_reconcile` + refId=shift.id — `CloseShiftResult` توسع بـ `reconciled`/`reconcileTxId`. `shiftBreakdown` يستثنى التسويات (نشاط غير تجاري).
2. **API**: `GET/PATCH/DELETE /api/cashbox/tx/[id]` (params Promise) + `reconcile: Boolean(body.reconcile)` في close. PATCH/DELETE يسجلان تدقيقاً (logAudit بaction عربية).
3. **UI**: ورقة «تفاصيل الحركة» (view|edit|delete) — رأس ملون + مبلغ signed + شبكة KeyValueRow + شارة صفراء للحركات المرتبطة (بلا أزرار) + تعديل (مبلغ/تاريخ ISO/وصف) وحذف بتأكيد أحمر. صفوف القائمة قابلة للنقر. خانة «تسجيل تسوية الفرق تلقائياً» (مفعّلة افتراضياً) في ورقة تأكيد الإقفال + سطر «تم إنشاء حركة تسوية بمبلغ X» بالنتيجة. `formatDateDisplay` لكل نصوص العرض.

## التحقق
- lint exit 0، tsc نظيف لملفاتي، `agent-browser errors` فارغ، console نظيف (عدا HMR للوكيل الموازي)، dev.log بلا 500.
- curl: كل الحارس (مرتبطة 400 / رصيد سالب 400 برسالة المتاح / amount 0 / تاريخ غير ISO / 404 missing) + إنشاء/تعديل/حذف E2E + سجل تدقيق.
- متصفح: سيناريو الحركات كاملاً (500→750+تاريخ→حفظ→القائمة محدثة→حذف→اختفى) + الحماية (شارة + صفر أزرار) + الوردية SAR (عدّ=متوقع−10 → تسوية 10 ر.س محمية والرصيد صار = العدّ).
- لقطات: `tmp-q/{9a-tx-details,9a-tx-edit,9a-tx-linked,9a-reconcile-result}.png`

## ملاحظات للوكيل القادم
- حركات `shift_reconcile` محمية بقاعدة refType — لا تُعدَّل/تحذف يدوياً أبداً.
- `deleteJson` غير موجودة في lib/api.ts — نسخة محلية داخل tx-details-sheet.tsx (lib/api.ts ملك الوكيل 1).
- التسوية تُنشأ بعملة الصندوق وexchangeRate = rateAt(اليوم) لغير الأساس.
- تحذير uncontrolled→controlled في SelectField أُصلح (Select دائماً controlled — placeholder يظل يظهر لأن قيمة "" لا تطابق عنصراً).
