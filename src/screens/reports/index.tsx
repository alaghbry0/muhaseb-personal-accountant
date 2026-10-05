import type { Component } from "react";
import ReportsGalleryScreen from "./reports-gallery";
import ReportPlScreen from "./report-pl";
import ReportSalesByScreen from "./report-sales-by";
import ReportItemMovementScreen from "./report-item-movement";
import ReportAgingScreen from "./report-aging";
import ReportInstallmentsScreen from "./report-installments";
import ReportExpensesScreen from "./report-expenses";
import ReportCashboxesScreen from "./report-cashboxes";
import ReportTaxScreen from "./report-tax";
import ReportRepsScreen from "./report-reps";

/** شاشات وحدة التقارير — Task 4-a (FR-09) */
export const screens: Record<string, Component> = {
  "reports-gallery": ReportsGalleryScreen,
  "report-pl": ReportPlScreen,
  "report-sales-by": ReportSalesByScreen,
  "report-item-movement": ReportItemMovementScreen,
  "report-aging": ReportAgingScreen,
  "report-installments": ReportInstallmentsScreen,
  "report-expenses": ReportExpensesScreen,
  "report-cashboxes": ReportCashboxesScreen,
  "report-tax": ReportTaxScreen,
  "report-reps": ReportRepsScreen,
};
