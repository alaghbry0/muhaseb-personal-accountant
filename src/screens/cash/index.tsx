import type { Component } from "react";
import CashBoxesScreen from "./cash-boxes";
import CashTxNewScreen from "./cash-tx-new";
import CashExpensesScreen from "./cash-expenses";
import CashExpenseCategoriesScreen from "./cash-expense-categories";
import CashShiftScreen from "./cash-shift";

/** شاشات وحدة الخزينة — Task 4-a (FR-04) */
export const screens: Record<string, Component> = {
  "cash-boxes": CashBoxesScreen,
  "cash-tx-new": CashTxNewScreen,
  "cash-expenses": CashExpensesScreen,
  "cash-expense-categories": CashExpenseCategoriesScreen,
  "cash-shift": CashShiftScreen,
};
