"use client";

/**
 * ألوان الرسوم البيانية (recharts) حسب الثيم — FR-13-05/DS-11 (Task 9-b).
 * المشكلة: خطوط/نقاط الرسوم بألوان داكنة-الزهارة (#22D3EE/#34D399/#94A3B8)
 * تُرسم على بطاقات بيضاء في الثيم الفاتح فتفقد تباينها.
 * الحل: hook موحد يقرأ الثيم من مخزن إعدادات العرض (useDisplaySettings) ويعيد
 * كائن ألوان واحداً تستخدمه كل الرسوم (نقاط المحاور، الشبكة، الخطوط، الأعمدة،
 * تدرجات المساحات، صناديق التلميح، ومفاتيح الرسم الملونة).
 *
 * قاعدة التوافق البصري: قيم الوضع الداكن هي **نفس القيم الحرفية الحالية**
 * للرسوم (بلا أي تغيير مرئي في الداكن)، والفاتح يستخدم النظائر الأدكن
 * المعتمدة أصلاً في بدائل الثيم الفاتح بـ globals.css
 * (22D3EE→0891B2، 34D399→059669، F87171→DC2626، 94A3B8→64748B).
 */

import { useDisplaySettings } from "@/components/settings/numbers-context";

export interface ChartTheme {
  /** لون نص نقاط المحاور X/Y (tick fill) */
  axisTick: string;
  /** لون خطوط شبكة الخلفية (CartesianGrid stroke) */
  grid: string;
  /** لون خط المحور (XAxis axisLine) */
  axisLine: string;
  /** اللون السماوي الأساسي — خط/منحنى/مساحة/أعمدة (DS-04) */
  line1: string;
  /** الأخضر — أعمدة الإيرادات ونظائرها */
  line2: string;
  /** الأحمر — أعمدة المصروفات ونظائرها */
  barNeg: string;
  /** خلفية صندوق التلميح (Tooltip contentStyle background) */
  tooltipBg: string;
  /** حد صندوق التلميح */
  tooltipBorder: string;
  /** ظل صندوق التلميح (لا ظل في الداكن — مطابق للحالي) */
  tooltipShadow: string;
  /** لون عنوان التلميح الخافت (رسم الرئيسية) */
  tooltipLabel: string;
  /** لون عنوان التلميح القوي/الغامق (رسوم التقارير) */
  tooltipLabelStrong: string;
}

/** الداكن — قيم حرفية مطابقة تماماً لرسوم ما قبل هذه المهمة (صفر انحدار) */
const CHART_THEME_DARK: ChartTheme = {
  axisTick: "#94A3B8",
  grid: "rgba(148,163,184,0.15)",
  axisLine: "#334155",
  line1: "#22D3EE",
  line2: "#34D399",
  barNeg: "#F87171",
  tooltipBg: "#1E293B",
  tooltipBorder: "#334155",
  tooltipShadow: "none",
  tooltipLabel: "#94A3B8",
  tooltipLabelStrong: "#F1F5F9",
};

/** الفاتح — نظائر أدكن مقروءة على البطاقات البيضاء (نفس خريطة ألوان 8-a) */
const CHART_THEME_LIGHT: ChartTheme = {
  axisTick: "#64748B",
  grid: "#E2E8F0",
  axisLine: "#CBD5E1",
  line1: "#0891B2",
  line2: "#059669",
  barNeg: "#DC2626",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#CBD5E1",
  tooltipShadow: "0 4px 12px rgba(15,23,42,0.12)",
  tooltipLabel: "#475569",
  tooltipLabelStrong: "#0F172A",
};

/** ألوان الرسوم للثيم المفعّل — يعيد الرسم فور تبديل الثيم (اشتراك zustand) */
export function useChartTheme(): ChartTheme {
  const theme = useDisplaySettings((s) => s.theme);
  return theme === "light" ? CHART_THEME_LIGHT : CHART_THEME_DARK;
}
