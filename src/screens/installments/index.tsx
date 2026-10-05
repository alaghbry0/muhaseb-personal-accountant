import type { Component } from "react";
import InstallmentsPlansScreen from "./installments-plans";
import InstallmentsDueScreen from "./installments-due";

/** شاشات وحدة الأقساط — Task 3-b (الخطط والتحصيل والمستحق اليوم/الأسبوع) */
export const screens: Record<string, Component> = {
  "installments-plans": InstallmentsPlansScreen,
  "installments-due": InstallmentsDueScreen,
};
