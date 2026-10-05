"use client";

/**
 * تصدير CSV عربي (UTF-8 BOM ليتعرف Excel على العربية) + بيانات المنشأة للطباعة.
 */
import { useQuery } from "@tanstack/react-query"
import { getJson } from "@/lib/api"
import { formatDate } from "@/lib/format"
import type { BootstrapData } from "@/lib/types"
import type { PrintCompanyInfo } from "@/components/print/voucher-types"

/** تحويل صفوف إلى CSV — القيم نص/رقم فقط */
export function toCsv(rows: Array<Record<string, string | number | null | undefined>>): string {
  if (rows.length === 0) return ""
  const headers = Object.keys(rows[0])
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))]
  return "\uFEFF" + lines.join("\n")
}

export function downloadCsv(filename: string, rows: Array<Record<string, string | number | null | undefined>>): void {
  const csv = toCsv(rows)
  if (!csv) return
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** بيانات المنشأة للطباعة من bootstrap (خطاف مشترك لشاشات التقارير) */
export function usePrintCompany() {
  const { data } = useQuery<BootstrapData>({
    queryKey: ["bootstrap"],
    queryFn: () => getJson<BootstrapData>("/api/bootstrap"),
    staleTime: 5 * 60 * 1000,
  })
  const company: PrintCompanyInfo = {
    name: data?.company?.name ?? "المنشأة",
    phone: data?.company?.phone ?? null,
    address: data?.company?.address ?? null,
    footerText: data?.company?.footerText ?? null,
  }
  return {
    company,
    baseCurrency: data?.baseCurrency?.code ?? "YER",
    rates: data?.rates ?? {},
    ready: !!data,
  }
}

/** اسم ملف التصدير بتاريخ اليوم */
export function csvName(prefix: string): string {
  return `${prefix}-${formatDate(new Date())}.csv`
}
