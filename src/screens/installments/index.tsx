import type { Component } from "react";
import { makeStub } from "@/components/ds";

/** شاشات وحدة الأقساط — تُنفَّذ في المرحلة 3-ب */
export const screens: Record<string, Component> = {
  "installments-plans": makeStub("خطط الأقساط", "كل خطط التقسيط وحالتها"),
  "installments-due": makeStub("الأقساط المستحقة", "مستحق اليوم/الأسبوع والتحصيل"),
};
