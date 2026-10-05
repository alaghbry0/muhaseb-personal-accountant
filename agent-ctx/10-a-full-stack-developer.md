# Task 10-a — full-stack-developer — ملصقات حرارية 58/80مم + رمز QR للصنف (FR-01-02)

## المهمة
إعادة تشغيل المهمة: توسيع منظومة الملصقات من ورق A4 فقط إلى ثلاث صيغ (a4 / حراري 58×32مم / حراري 80×50مم) مع خيار رمز الملصق (باركود Code128 أو رمز QR بحمولة JSON عربي مضغوط) — باستخدام حزمة qrcode@1.5.4 المثبتة (لا ترميز يدوي).

## الملكية (التزام صارم)
**مملوكي**: src/lib/qr.ts (جديد)، src/components/print/label-print.tsx، src/components/print/print.css (إلحاق فقط)، src/screens/inventory/inventory-product-card.tsx.
**لم ألمس**: barcode.ts / format.ts / app-shell / lib/api.ts / domain / API routes / أي شاشة أخرى (قراءة فقط).

## ما نُفّذ
1. **src/lib/qr.ts (جديد)**: `qrSvg(text, {color?})` — غلاف رقيق فوق QRCode.toString(type:"svg", margin:0, ec:"M") يستبدل `stroke="#000000"` بلون الطالب؛ نص فارغ أو >1000 حرف ⇒ "" (بلا رمي). `qrPayload({name,barcode,price?})` — `{"ن":name,"ب":barcode,"س":price?}` بلا السعر عند غيابه.
2. **label-print.tsx**: أنواع `LabelFormat = "a4"|"t58"|"t80"` و`LabelCode = "code128"|"qr"`؛ `printLabelSheet` صارت **async** بمعاملات افتراضية (توافق رجعي — الاستدعاء القديم يعمل كما هو). a4 كما كان حرفياً (شبكة 3×8، @page A4 5mm) والQR داخل الخلية 46px مربع بلا أرقام. t58: `@page {size:58mm 32mm; margin:0}` كل ملصق صفحة (page-break-after:always، `.last` بدونه) padding 2mm؛ t80 مثله بـ80mm 50mm وخطوط أكبر (اسم 11pt، سعر 13pt، QR 28مم). الحد الأقصى للحراري LABELS_MAX_THERMAL=100. فشل توليد QR ⇒ رجوع صامت للباركود. toast: «تم إرسال N ملصقاً (حراري 58/80مم — «الاسم»)» / «(N صفحة ورق A4 — ...)».
3. **print.css (إلحاق)**: `.label-qr svg{width/height:100%}` + أحجام الحاوية لكل صيغة (a4:46px, t58:16mm, t80:28mm) + `.label-t58/.label-t80` بلا حدود قص (الطابعة الحرارية تقص ذاتياً — أبيض/أسود) + خطوط كل صيغة.
4. **inventory-product-card.tsx**: منتقي صيغة (3 رقائق أفقية aria-pressed: ورق A4 24/صفحة / حراري 58مم / حراري 80مم) + منتقي رمز (Code128 / QR) + نص مساعدة عند QR «يحتوي الاسم والباركود والسعر — يقرأه أي قارئ». **معاينة حية**: حالة `previewQr` تُجلب بuseEffect عند codeType==="qr" (عرض مربع dangerouslySetInnerHTML مع spinner مؤقت أثناء الجلب)؛ code128 كما كان. أبعاد المعاينة بنسب الصيغة: a4 240px بلا ارتفاع/حد متقطع، t58 240×132، t80 240×150. hint العدد يتغير (240/100) والزر الطباعة loading عبر await printLabelSheet. مدخلات معاينة QR تُشتق قبل أي return مبكر (الhook قبل early-return).

## التحقق (agent-browser، خادم 3000)
- lint صفر أخطاء؛ tsc نظيف لكل ملفاتي (لا أخطاء جديدة).
- تقطيع الصيغ: t58→240×132، t80→240×150، a4→حد متقطع بارتفاع تلقائي ✓. QR: svg viewBox "0 0 33 33" (2 paths) مربع 46/64/84px حسب الصيغة + المساعدة تظهر ✓.
- طباعة (window.print مرقّع أثناء الفحص ثم فحص #print-root قبل التنظيف): t58+QR ⇒ `58mm 32mm` + margin 0 + 24 صفحة label-t58 كلها label-qr بpath ولا rect باركود + `.last` ✓؛ t80+QR ⇒ `80mm 50mm` ✓؛ a4+code128 (توافق رجعي) ⇒ A4 5mm + 24 خلية بbars+digits بلا QR ✓؛ a4+QR ⇒ 24 خلية بQR بلا digits ✓.
- Clamp: عدد 150 بالحراري ⇒ 100 صفحة فعلية ✓.
- الفاتح: اللوحة تُفتح — المعاينة بيضاء (bg rgb(255,255,255)) بQR أبيض مربع وأرقام غربية، ثم عاد الداكن ✓.
- agent-browser errors فارغ (كونسول: فقط خطأ الزر المتداخل الموثق سابقاً في inventory-alerts لوكيل آخر)؛ dev.log بلا أي 500.
- لقطات: tmp-q/10a-label-panel-thermal.png (t58+QR) وtmp-q/10a-label-qr-preview.png (t80+QR) — محتوايان مختلفان.

## بيئة
- window.print() في headless: afterprint يُنظّف #print-root فوراً — للتحقق رقّعت `window.print=()=>{}` قبل الضغط (نمط مفيد للوكلاء التالين).
- PosSheet = Drawer بdata-slot=drawer-content (وليس sheet-content) — offsetParentnull للعناصر fixed فلا يصلح كفحص ظهور.
