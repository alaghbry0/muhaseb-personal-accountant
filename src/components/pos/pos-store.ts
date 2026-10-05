"use client";

/**
 * مخزن سلة شاشة البيع (POS) — zustand مع persist في localStorage
 * حتى لا تُفقد الفاتورة الجارية عند تحديث الصفحة (FR-02-13 روح التعليق).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProductSearchItemDto } from "@/domain/dto";

export interface PosLine {
  productId: number
  name: string
  barcode: string | null
  unitName: string | null
  qty: number
  unitPrice: number
  discountPercent: number
  /** أسعار الصنف بكل عملة (مفتاح الرمز YER/SAR/USD) — لتبديل العملة */
  prices: Record<string, number>
  totalStock: number
}

interface PosState {
  lines: PosLine[]
  customerId: number | null
  customerName: string
  salesRepId: number | null
  cashboxId: number | null
  warehouseId: number | null
  currencyId: number | null
  currencyCode: string
  invoiceDiscount: number
  taxRate: number
  /** فاتورة معلّقة مستؤنفة — تُحذف بعد الحفظ الناجح */
  resumeHeldId: number | null

  setCustomer: (id: number | null, name: string) => void
  setSalesRep: (id: number | null) => void
  setCashbox: (id: number | null) => void
  setWarehouse: (id: number | null) => void
  setCurrency: (id: number | null, code: string) => void
  addProduct: (p: ProductSearchItemDto) => boolean
  incQty: (productId: number, delta: number) => void
  setQty: (productId: number, qty: number) => void
  setPrice: (productId: number, price: number) => void
  setLineDiscount: (productId: number, percent: number) => void
  removeLine: (productId: number) => void
  setInvoiceDiscount: (amount: number) => void
  setTaxRate: (rate: number) => void
  setResumeHeld: (id: number | null) => void
  loadLines: (lines: PosLine[]) => void
  clearAll: () => void
}

const emptyState = {
  lines: [] as PosLine[],
  customerId: null,
  customerName: "",
  salesRepId: null,
  cashboxId: null,
  warehouseId: null,
  currencyId: null,
  currencyCode: "YER",
  invoiceDiscount: 0,
  taxRate: 0,
  resumeHeldId: null,
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      ...emptyState,

      setCustomer: (id, name) => set({ customerId: id, customerName: id ? name : "" }),
      setSalesRep: (id) => set({ salesRepId: id }),
      setCashbox: (id) => set({ cashboxId: id }),
      setWarehouse: (id) => set({ warehouseId: id }),
      setCurrency: (id, code) =>
        set((s) => ({
          currencyId: id,
          currencyCode: code,
          // تبديل أسعار البنود لأسعار العملة الجديدة (إن وُجدت)
          lines: s.lines.map((l) => ({
            ...l,
            unitPrice: l.prices[code] ?? l.unitPrice,
          })),
        })),

      addProduct: (p) => {
        const { lines, currencyCode } = get()
        const existing = lines.find((l) => l.productId === p.id)
        if (existing) {
          set({
            lines: lines.map((l) =>
              l.productId === p.id ? { ...l, qty: l.qty + 1, totalStock: p.totalStock } : l
            ),
          })
          return false
        }
        set({
          lines: [
            ...lines,
            {
              productId: p.id,
              name: p.name,
              barcode: p.barcode,
              unitName: p.unitName,
              qty: 1,
              unitPrice: p.prices[currencyCode] ?? 0,
              discountPercent: 0,
              prices: p.prices,
              totalStock: p.totalStock,
            },
          ],
        })
        return true
      },

      incQty: (productId, delta) =>
        set((s) => ({
          lines: s.lines
            .map((l) =>
              l.productId === productId
                ? { ...l, qty: Math.max(0, Math.round((l.qty + delta) * 1000) / 1000) }
                : l
            )
            .filter((l) => l.qty > 0),
        })),

      setQty: (productId, qty) =>
        set((s) => ({
          lines: s.lines
            .map((l) => (l.productId === productId ? { ...l, qty: Math.max(0, qty) } : l))
            .filter((l) => l.qty > 0),
        })),

      setPrice: (productId, price) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.productId === productId ? { ...l, unitPrice: Math.max(0, price) } : l
          ),
        })),

      setLineDiscount: (productId, percent) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.productId === productId
              ? { ...l, discountPercent: Math.min(100, Math.max(0, percent)) }
              : l
          ),
        })),

      removeLine: (productId) =>
        set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),

      setInvoiceDiscount: (amount) => set({ invoiceDiscount: Math.max(0, amount || 0) }),
      setTaxRate: (rate) => set({ taxRate: Math.min(100, Math.max(0, rate || 0)) }),
      setResumeHeld: (id) => set({ resumeHeldId: id }),
      loadLines: (lines) => set({ lines }),

      clearAll: () =>
        set((s) => ({
          ...emptyState,
          // الإعدادات المرجعية تبقى (صندوق/مخزن/عملة) لراحة الكاشير
          cashboxId: s.cashboxId,
          warehouseId: s.warehouseId,
          currencyId: s.currencyId,
          currencyCode: s.currencyCode,
          salesRepId: null,
        })),
    }),
    {
      name: "pos-cart-v1",
      version: 1,
    }
  )
)
