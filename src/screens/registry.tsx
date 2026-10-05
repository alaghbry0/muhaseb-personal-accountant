import type { Component } from "react";

/**
 * سجل الشاشات — الملف النهائي (لا يُعدَّل من الوكلاء اللاحقين).
 * كل وحدة تصدّر `screens` من src/screens/<module>/index.tsx وتُدمج هنا.
 * التنقل: useNav().push('screen-id', params).
 */
import { screens as homeScreens } from "./home";
import { screens as salesScreens } from "./sales";
import { screens as purchasesScreens } from "./purchases";
import { screens as inventoryScreens } from "./inventory";
import { screens as partiesScreens } from "./parties";
import { screens as installmentsScreens } from "./installments";
import { screens as cashScreens } from "./cash";
import { screens as employeesScreens } from "./employees";
import { screens as reportsScreens } from "./reports";
import { screens as settingsScreens } from "./settings";
import { screens as moreScreens } from "./more";

export const registry: Record<string, Component> = {
  ...homeScreens,
  ...salesScreens,
  ...purchasesScreens,
  ...inventoryScreens,
  ...partiesScreens,
  ...installmentsScreens,
  ...cashScreens,
  ...employeesScreens,
  ...reportsScreens,
  ...settingsScreens,
  ...moreScreens,
};
