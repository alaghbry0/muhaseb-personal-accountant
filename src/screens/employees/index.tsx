import type { Component } from "react";
import { makeStub } from "@/components/ds";

/** شاشات وحدة الموظفين — تُنفَّذ في المرحلة 4-ب */
export const screens: Record<string, Component> = {
  "employees-list": makeStub("الموظفون", "قائمة الموظفين ورواتبهم"),
  "employees-card": makeStub("بطاقة الموظف", "بيانات الموظف وسحبياته ورواتبه"),
  "employees-attendance": makeStub("الحضور اليومي", "تسجيل حضور وانصراف الموظفين"),
  "employees-advances": makeStub("السحبيات", "سحبيات الموظفين المرصودة من الراتب"),
  "employees-payroll": makeStub("مسير الرواتب", "إعداد مسير الشهر واعتماده وصرفه"),
};
