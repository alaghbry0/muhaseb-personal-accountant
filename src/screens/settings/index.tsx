import type { Component } from "react";
import { makeStub } from "@/components/ds";

/** شاشات وحدة الإعدادات — تُنفَّذ في المرحلة 5 */
export const screens: Record<string, Component> = {
  "settings-main": makeStub("الإعدادات", "القائمة الرئيسية للإعدادات"),
  "settings-company": makeStub("بيانات المنشأة", "الاسم والهاتف والعملة والضريبة"),
  "settings-numbering": makeStub("الترقيم", "بادئات المستندات والعدّادات"),
  "settings-printing": makeStub("الطباعة", "قالب الإيصال وحجم الورق والنسخ"),
  "settings-display": makeStub("العرض", "العملة الافتراضية وشكل الأرقام"),
  "settings-data": makeStub("البيانات المرجعية", "العملات وأسعار الصرف والوحدات"),
  "settings-backup": makeStub("النسخ الاحتياطي", "تصدير واستيراد نسخ JSON"),
  "settings-audit": makeStub("سجل التدقيق", "من فعل ماذا ومتى"),
  "settings-about": makeStub("حول التطبيق", "الإصدار والترخيص والتواصل"),
};
