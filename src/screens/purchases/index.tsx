import type { Component } from "react";
import { makeStub } from "@/components/ds";

/** شاشات وحدة المشتريات — تُنفَّذ في المرحلة 3-أ */
export const screens: Record<string, Component> = {
  "purchases-list": makeStub("فواتير المشتريات", "قائمة فواتير الشراء والمرتجعات"),
  "purchases-new": makeStub("فاتورة شراء جديدة", "إدخال توريد بضاعة وتحديث التكلفة المرجحة"),
  "purchases-details": makeStub("تفاصيل فاتورة الشراء", "بنود التوريد وسداد المورد"),
};
