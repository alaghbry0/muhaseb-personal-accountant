import type { Component } from "react";
import SalesPosScreen from "./sales-pos";
import SalesInvoicesScreen from "./sales-invoices";
import SalesInvoiceDetailsScreen from "./sales-invoice-details";
import SalesQuotationsScreen from "./sales-quotations";

/** شاشات وحدة المبيعات — Task 2 (الفوترة ⭐) */
export const screens: Record<string, Component> = {
  "sales-pos": SalesPosScreen,
  "sales-invoices": SalesInvoicesScreen,
  "sales-invoice-details": SalesInvoiceDetailsScreen,
  "sales-quotations": SalesQuotationsScreen,
};
