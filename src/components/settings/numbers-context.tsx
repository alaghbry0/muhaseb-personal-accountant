"use client";

/**
 * إعدادات العرض (FR-13-05) — Task 5:
 * - شكل الأرقام (غربية 0-9 / هندية ٠-٩): مخزن zustand + localStorage،
 *   يُطبَّق عبر useFormatD() داخل شاشات الإعدادات والبيانات المرجعية.
 *   (التطبيق الشامل على كل شاشات المهام 1-4 يتطلب تعديل ملفات ملكيتها — موثق في سجل العمل.)
 * - حجم الخط (عادي/كبير): يقرؤه AppShell ويطبّق تكبيراً على إطار التطبيق كله.
 */
import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { formatAmount, toArabicDigits, type FormatAmountOptions } from "@/lib/format";

export type NumbersShape = "western" | "arabic";
export type FontSize = "normal" | "large";

interface DisplaySettingsState {
  numbers: NumbersShape;
  fontSize: FontSize;
  setNumbers: (n: NumbersShape) => void;
  setFontSize: (f: FontSize) => void;
}

export const useDisplaySettings = create<DisplaySettingsState>()(
  persist(
    (set) => ({
      numbers: "western",
      fontSize: "normal",
      setNumbers: (numbers) => set({ numbers }),
      setFontSize: (fontSize) => set({ fontSize }),
    }),
    { name: "app.display" }
  )
);

/** تنسيق مبلغ حسب شكل الأرقام المختار (خارج المكونات) */
export function formatAmountD(n: number | null | undefined, opts?: FormatAmountOptions): string {
  const shape = useDisplaySettings.getState().numbers;
  const s = formatAmount(n, opts);
  return shape === "arabic" ? toArabicDigits(s) : s;
}

/** hook تفاعلي: يعيد دالة تنسيق تتبع شكل الأرقام الحالي */
export function useFormatD() {
  const numbers = useDisplaySettings((s) => s.numbers);
  return useMemo(
    () =>
      (n: number | null | undefined, opts?: FormatAmountOptions): string => {
        const s = formatAmount(n, opts);
        return numbers === "arabic" ? toArabicDigits(s) : s;
      },
    [numbers]
  );
}
