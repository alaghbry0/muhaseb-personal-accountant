import type { Component } from "react";
import { makeStub } from "@/components/ds";

/** شاشات وحدة الخزينة — تُنفَّذ في المرحلة 4-أ */
export const screens: Record<string, Component> = {
  "cash-boxes": makeStub("الخزينة", "الصناديق وأرصدتها الحية وحركاتها"),
  "cash-tx-new": makeStub("حركة نقدية جديدة", "قبض/صرف/مصروف/تحويل بين الصناديق"),
  "cash-expenses": makeStub("المصروفات", "مصروفات التشغيل حسب الفئة والفترة"),
  "cash-expense-categories": makeStub("فئات المصروفات", "إدارة فئات المصروفات"),
  "cash-shift": makeStub("وردية الصندوق", "فتح وإقفال الوردية وعدّ النقدية"),
};
