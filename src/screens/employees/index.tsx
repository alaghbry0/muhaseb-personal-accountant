import type { Component } from "react";
import EmployeesListScreen from "./employees-list";
import EmployeesCardScreen from "./employees-card";
import EmployeesAttendanceScreen from "./employees-attendance";
import EmployeesAdvancesScreen from "./employees-advances";
import EmployeesPayrollScreen from "./employees-payroll";

/** شاشات وحدة الموظفين — Task 4-b */
export const screens: Record<string, Component> = {
  "employees-list": EmployeesListScreen,
  "employees-card": EmployeesCardScreen,
  "employees-attendance": EmployeesAttendanceScreen,
  "employees-advances": EmployeesAdvancesScreen,
  "employees-payroll": EmployeesPayrollScreen,
};
