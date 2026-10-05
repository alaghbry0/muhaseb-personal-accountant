import type { Component } from "react";
import PartiesCustomersScreen from "./parties-customers";
import PartiesCustomerCardScreen from "./parties-customer-card";
import PartiesSuppliersScreen from "./parties-suppliers";
import PartiesSupplierCardScreen from "./parties-supplier-card";
import PartiesVoucherScreen from "./parties-voucher";
import PartiesRepsScreen from "./parties-reps";
import PartiesRepCardScreen from "./parties-rep-card";

/** شاشات وحدة الأطراف — Task 3-b (العملاء/الموردون/السندات/المناديب) */
export const screens: Record<string, Component> = {
  "parties-customers": PartiesCustomersScreen,
  "parties-customer-card": PartiesCustomerCardScreen,
  "parties-suppliers": PartiesSuppliersScreen,
  "parties-supplier-card": PartiesSupplierCardScreen,
  "parties-voucher": PartiesVoucherScreen,
  "parties-reps": PartiesRepsScreen,
  "parties-rep-card": PartiesRepCardScreen,
};
