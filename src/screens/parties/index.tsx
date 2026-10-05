import type { Component } from "react";
import { makeStub } from "@/components/ds";

/** شاشات وحدة الأطراف — تُنفَّذ في المرحلة 3-ب */
export const screens: Record<string, Component> = {
  "parties-customers": makeStub("العملاء", "قائمة العملاء وأرصدتهم وحدود الائتمان"),
  "parties-customer-card": makeStub("بطاقة العميل", "كشف حساب تفصيلي بالرصيد المتحرك"),
  "parties-suppliers": makeStub("الموردون", "قائمة الموردين والمستحق لهم"),
  "parties-supplier-card": makeStub("بطاقة المورد", "كشف حساب المورد والسدادات"),
  "parties-voucher": makeStub("سندات القبض والصرف", "سند قبض من عميل أو صرف لمورد"),
  "parties-reps": makeStub("المناديب", "مندوبو البيع والتحصيل ونسب العمولة"),
  "parties-rep-card": makeStub("بطاقة المندوب", "حساب المندوب وعمولاته"),
};
