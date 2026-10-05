import type { Component } from "react";
import { makeStub } from "@/components/ds";

/** شاشات وحدة المخزون — تُنفَّذ في المرحلة 3-أ */
export const screens: Record<string, Component> = {
  "inventory-products": makeStub("الأصناف", "قائمة الأصناف مع البحث والمسح والفلاتر"),
  "inventory-product-card": makeStub("بطاقة الصنف", "الأسعار والأرصدة لكل مخزن وآخر الحركات"),
  "inventory-product-form": makeStub("بيانات الصنف", "إضافة وتعديل صنف بأسعار كل عملة"),
  "inventory-categories": makeStub("التصنيفات", "فئات الأصناف الشجرية"),
  "inventory-units": makeStub("وحدات القياس", "الوحدات ومعاملات التحويل"),
  "inventory-warehouses": makeStub("المخازن", "إدارة المخازن ومواقعها"),
  "inventory-stocktake": makeStub("الجرد", "جرد فعلي ومراجعة الفروقات قبل الاعتماد"),
  "inventory-transfers": makeStub("تحويل المخازن", "نقل الكميات بين المخازن"),
  "inventory-alerts": makeStub("تنبيهات المخزون", "الأصناف تحت الحد الأدنى والراكدة"),
  "inventory-movements": makeStub("سجل الحركات", "كل حركات الدخول والخروج والتسويات"),
};
