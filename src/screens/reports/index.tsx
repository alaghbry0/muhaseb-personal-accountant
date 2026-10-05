import type { Component } from "react";
import { makeStub } from "@/components/ds";

/** شاشات وحدة التقارير — تُنفَّذ في المرحلة 4-أ */
export const screens: Record<string, Component> = {
  "reports-gallery": makeStub("معرض التقارير", "كل تقارير النظام مجمّعة بمجموعات"),
  "report-pl": makeStub("الأرباح والخسائر", "حركة الشركة — إيرادات وتكاليف ومصاريف"),
  "report-sales-by": makeStub("المبيعات حسب", "العميل/الصنف/المندوب/اليوم/الفئة"),
  "report-item-movement": makeStub("حركة صنف", "حركة صنف معين دخولاً وخروجاً"),
  "report-aging": makeStub("أعمار الديون", "توزيع أرصدة العملاء حسب عمر الدين"),
  "report-installments": makeStub("تقرير الأقساط", "أداء خطط التقسيط والتحصيل"),
  "report-expenses": makeStub("تقرير المصروفات", "المصروفات حسب الفئة والفترة"),
  "report-cashboxes": makeStub("تقرير الصناديق", "حركة وأرصدة كل صندوق"),
  "report-tax": makeStub("تقرير الضريبة", "الضريبة المحصلة على المبيعات"),
  "report-reps": makeStub("أداء المناديب", "مبيعات وعمولات كل مندوب"),
};
