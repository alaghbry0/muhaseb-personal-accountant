import type { Component } from "react";
import PurchasesListScreen from "./purchases-list";
import PurchasesNewScreen from "./purchases-new";
import PurchasesDetailsScreen from "./purchases-details";
import PurchasesReturnsScreen from "./purchases-returns";

/** شاشات وحدة المشتريات والمرتجعات — Task 3-a */
export const screens: Record<string, Component> = {
  "purchases-list": PurchasesListScreen,
  "purchases-new": PurchasesNewScreen,
  "purchases-details": PurchasesDetailsScreen,
  "purchases-returns": PurchasesReturnsScreen,
};
