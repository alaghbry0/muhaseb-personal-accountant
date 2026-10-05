import type { Component } from "react";

/**
 * شاشات وحدة الإعدادات — Task 5 (منفذة كاملة):
 * القائمة الرئيسية + بيانات المنشأة + الترقيم + الطباعة + العرض + البيانات المرجعية
 * + النسخ الاحتياطي والاستعادة + سجل التدقيق + حول التطبيق.
 */
import SettingsMainScreen from "./settings-main";
import SettingsCompanyScreen from "./settings-company";
import SettingsNumberingScreen from "./settings-numbering";
import SettingsPrintingScreen from "./settings-printing";
import SettingsDisplayScreen from "./settings-display";
import SettingsDataScreen from "./settings-data";
import SettingsBackupScreen from "./settings-backup";
import SettingsAuditScreen from "./settings-audit";
import SettingsAboutScreen from "./settings-about";

export const screens: Record<string, Component> = {
  "settings-main": SettingsMainScreen,
  "settings-company": SettingsCompanyScreen,
  "settings-numbering": SettingsNumberingScreen,
  "settings-printing": SettingsPrintingScreen,
  "settings-display": SettingsDisplayScreen,
  "settings-data": SettingsDataScreen,
  "settings-backup": SettingsBackupScreen,
  "settings-audit": SettingsAuditScreen,
  "settings-about": SettingsAboutScreen,
};
