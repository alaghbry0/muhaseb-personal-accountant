# Task 4-b — الموظفون (HR) + المناديب والعمولات

**الوكيل:** full-stack-developer | **الحالة:** ✅ مكتمل ومُتحقق (lint 0 أخطاء + curl + browser)

السجل الكامل في `/home/z/my-project/worklog.md` قسم «Task ID: 4-b». الملخص:

## الملفات المُنشأة (كلها جديدة)
- **Domain**: `src/domain/payroll.ts` (saveEmployee/updateEmployee, markAttendance(+Batch), saveAdvance, generatePayroll/previewPayroll/commitPayroll, payCommission, repAccount, listAdvances, getEmployeeFile, getAttendanceDay, getPayrollHistory, calcPayrollLine) — ذري، مكتفٍ بذاته، يستورد resolveRate من domain/parties.ts (3-b مستقر).
- **API**: `/api/employees` + `[id]`، `/api/attendance`، `/api/advances`، `/api/payroll` + `preview|generate|commit`، `/api/reps` + `[id]`(PATCH) + `[id]/account` + `[id]/pay-commissions`.
- **شاشات**: employees-{list,card,attendance,advances,payroll}.tsx + index.tsx.
- **مكونات**: components/employees/{employee-form, advance-form, cashbox-picker, rep-payout-sheet, payroll-print}.tsx.
- **تعديل متفق عليه**: screens/parties/parties-rep-card.tsx (تفعيل صرف العمولة + قسم أداء الفترة).
- **Seed**: scripts/seed-people.ts (نُفِّذ: 70 حضور + 4 سحبيات + مسير 2026-09 مدفوع 434,250 + مسير 2026-10 مسودة).

## معادلات الرواتب (المصدر domain/payroll.ts)
- قيمة اليوم: شهري÷30، أسبوعي÷7، يومي×1. غائب=يوم، نص=نصف، إجازة=بلا خصم، تأخير: min(1, round¼(دقائق/60×0.5)) يوم.
- unpaid(P) = Σ سحبيات بالأساس حتى نهاية P − Σ advances_deducted لمسيرات مدفوعة ≤ P (ترحيل تلقائي، بلا ازدواج).
- advancesApplied = min(unpaid, max(0, preNet)) → صافٍ ≥ 0 دائماً. net = max(0, preNet − advancesApplied).

## للتسليم اللاحق
- **4-a (report-reps)**: استهلك `GET /api/reps/[id]/account?from=&to=` أو `GET /api/reps`.
- **Task 5**: tx_type الجديدة في حركات الصندوق: employee_advance(refType='advance')، salary_batch(refType='salary_period' refId=صف المسير employee_id)، commission_payout(refType='commission' refId=المندوب). جدول employee بلا عمود notes (كما في DDL — بلا ملاحظات للموظف). POST/PATCH /api/reps جاهزان بلا واجهة إنشاء (يمكن إضافة FAB لقائمة المناديب).
