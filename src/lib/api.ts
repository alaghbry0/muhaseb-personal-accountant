/**
 * مساعدات HTTP موحدة (client-side) — مسارات نسبية فقط، مع تنبيه خطأ عبر sonner.
 */
import { toast } from "sonner"

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...init,
    })
  } catch {
    toast.error("تعذر الاتصال بالخادم — تحقق من الشبكة")
    throw new Error("network")
  }
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* استجابة بلا جسم */
  }
  if (!res.ok) {
    const msg =
      (body && typeof body === "object" && "error" in body && String((body as { error: unknown }).error)) ||
      `فشل الطلب (${res.status})`
    toast.error(msg)
    throw new Error(msg)
  }
  return body as T
}

export function getJson<T>(url: string): Promise<T> {
  return request<T>(url, { method: "GET", cache: "no-store" })
}

export function postJson<T>(url: string, data?: unknown): Promise<T> {
  return request<T>(url, { method: "POST", body: JSON.stringify(data ?? {}) })
}

export function patchJson<T>(url: string, data?: unknown): Promise<T> {
  return request<T>(url, { method: "PATCH", body: JSON.stringify(data ?? {}) })
}

/** استخراج رسالة خطأ للعرض */
export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return "حدث خطأ غير متوقع"
}
