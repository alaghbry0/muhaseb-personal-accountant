# Task 7-a — البحث الشامل v2 (كل أنواع المستندات + عروض الأسعار + اختصار Ctrl+K)

**Agent**: full-stack-developer
**Date**: 2026-10-05 (maintenance/development round 7)
**Status**: ✅ مكتمل ومُتحقق — lint صفر أخطاء، صفر أخطاء صفحة/كونسول، dev.log كل الطلبات 200.

## ما تغيّر (الملفات)

| الملف | التغيير |
|---|---|
| `src/app/api/invoices/route.ts` | GET: `docType` يقبل قائمة مفصولة بفواصل (`sale,purchase,...`) — `where.docType = مفردة ? قيمة : { in: [...] }`. أضيف `docType: r.docType` لصفوف الاستجابة. POST لم يُمس. |
| `src/domain/dto.ts` | `InvoiceListItemDto.docType: string` (إضافة حقل فقط — المُنشئ الوحيد هو مسار GET أعلاه). |
| `src/screens/home/global-search.tsx` | v2: استعلام الفواتير بـ `docType=sale,purchase,sale_return,purchase_return` + رقائق نوع ملوّنة لكل صف (بيع #22D3EE/شراء #FBBF24/مرتجع بيع #F87171/مرتجع شراء #FB923C) + تنقل صحيح (sale→sales-invoice-details، البقية→purchases-details) + عرض supplierName + قسم خامس «عروض الأسعار» (#A78BFA، StatusChip مفتوح/محوّل/مرفوض، نقر→sales-quotations) + تلميح `<kbd>Ctrl + K</kbd>` تحت SearchBar. |
| `src/components/app-shell.tsx` | مستمع keydown عام: Ctrl+K/⌘K من أي شاشة (حتى داخل الحقول) + `/` فقط خارج حقول الإدخال (`isEditableTarget` حارس) → `nav.push('global-search')` مع منع التكرار إن كانت الشاشة أعلى الكدس. تنظيف عند الفك. |

## قرارات تصميمية للوكيل التالي

- **docType المركب متاح للجميع**: أي شاشة تريد مزج أنواع مستندات في قائمة واحدة تستطيع تمرير `docType=a,b` لـ GET /api/invoices — القيمة المفردة سلوكها مطابق حرفياً للقديم (متحقق curl + E2E على كل المستهلكين القدامى).
- **صفوف قائمة الفواتير تحمل الآن `docType`** — إن أرادت شاشة قائمة تمييز النوع من الصف نفسه (بدل filter محلي) فالحقل متاح.
- **purchases-details هو وجه عرض sale_return أيضاً** (كما شراء/مرتجع شراء) — استُخدم في تنقل نتائج البحث.
- **عروض الأسعار لا تملك شاشة تفاصيل مستقلة** — تفاصيلها Drawer داخل sales-quotations، لذا نتيجة البحث تفتح القائمة (قرار من المهمة).
- رقاقة «مرتجع شراء» استخدمت #FB923C (برتقالي — بين الأحمر والكهرماني حسب توجيه المهمة «red/amber») لتمييزها عن «شراء» الكهرماني و«مرتجع بيع» الأحمر.
- لم تُمس: sales-pos.tsx / more.tsx / reports-gallery.tsx / settings-main.tsx / success-sheet.tsx / format.ts / prisma schema (ملوك جولات أخرى).

## نقاط تحقق سريعة (agent-browser)

- «PUR» → 14 شراء برقائق «شراء» → نقرة → فاتورة شراء ✓ | «SRN»/«PRN» → شاشات المرتجعات ✓ | «QTE» → 5 عروض برقائق مفتوح/محوّل → القائمة ✓
- Ctrl+K من الرئيسية يفتح البحث؛ مرتان فوق البحث بلا تراكم؛ `/` داخل الحقل يُكتب حرفاً؛ `/` خارجه يفتح البحث ✓
- انحدار: فلاتر فواتير المشتريات (شراء=14 PUR / مرتجع شراء=2 PRN / مرتجع بيع=3 SRN) وقائمة المبيعات (INV فقط) ✓
- لقطة: `tmp-q/7a-search-v2.png` (بحث «السعادة» — 3 أقسام: عملاء + مستندات برقائق الأنواع + عروض أسعار).
